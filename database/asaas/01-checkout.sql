-- Atualização do checkout V2/V3 existente. Não é instalador de banco vazio.
-- Aplicar depois das migrações de checkout, pagamentos e desconto Pix existentes.
begin;

do $$ begin
  if to_regprocedure('public.serenity_checkout_payment_ready_v3()') is null
    or to_regprocedure('public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)') is null then
    raise exception 'ASAAS_CHECKOUT_BASE_REQUIRED: instale o checkout V2/V3 antes desta atualização.';
  end if;
end $$;

alter table public.serenity_checkout_payments_v2
  add column if not exists provider text not null default 'mercado_pago'
    check (provider in ('mercado_pago','asaas')),
  add column if not exists asaas_customer_id text check (asaas_customer_id ~ '^cus_[A-Za-z0-9_-]{1,100}$'),
  add column if not exists asaas_invoice_url text;

alter table public.serenity_checkout_payments_v2
  drop constraint if exists serenity_checkout_payments_v2_provider_payment_id_check;
alter table public.serenity_checkout_payments_v2
  add constraint serenity_checkout_payments_v2_provider_payment_id_check check (
    provider_payment_id is null or
    (provider='mercado_pago' and provider_payment_id ~ '^[0-9]{1,40}$') or
    (provider='asaas' and provider_payment_id ~ '^pay_[A-Za-z0-9_-]{1,100}$')
  );

-- Cria um observador específico para Asaas preservando as proteções de estoque,
-- cupom, rollback da conversão, idempotência e regressão do observador instalado.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.serenity_checkout_observe_payment_v2(uuid,jsonb,text)'::regprocedure);
  if position('''^[0-9]{1,40}$''' in definition)=0
    or position('if next_state = ''pending'' and attempt.method = ''pix''' in definition)=0 then
    raise exception 'ASAAS_OBSERVER_BASE_INCOMPATIBLE';
  end if;
  definition := replace(definition,'FUNCTION public.serenity_checkout_observe_payment_v2(',
    'FUNCTION public.serenity_asaas_observe_base_v1(');
  definition := replace(definition,'''^[0-9]{1,40}$''','''^pay_[A-Za-z0-9_-]{1,100}$''');
  -- O QR do Asaas pode sobreviver à reserva local. Nunca liberar nova cobrança
  -- pelo vencimento local; aprovação tardia continua em review na conversão.
  definition := replace(definition,'if next_state = ''pending'' and attempt.method = ''pix''',
    'if next_state = ''pending'' and attempt.provider <> ''asaas'' and attempt.method = ''pix''');
  execute definition;
end;
$migration$;

create or replace function public.serenity_asaas_claim_v1(
  p_checkout uuid,p_access_hash text,p_attempt uuid,p_merchant text,p_request_hash text,p_method text
) returns jsonb language plpgsql set search_path = '' as $$
declare result jsonb;
begin
  perform pg_advisory_xact_lock(7391542026);
  if p_method not in ('pix','card') or p_method is null then raise exception 'PAYMENT_REQUEST_INVALID'; end if;
  if exists(select 1 from public.serenity_checkout_payments_v2 where id=p_attempt and provider<>'asaas') then
    raise exception 'PAYMENT_REQUEST_CHANGED';
  end if;
  if p_method='pix' then
    result := public.serenity_checkout_claim_pix_v2(p_checkout,p_access_hash,p_attempt,p_merchant,p_request_hash);
  else
    result := public.serenity_checkout_claim_card_v3(p_checkout,p_access_hash,p_attempt,p_merchant,p_request_hash);
  end if;
  if result->>'submit'='true' then
    update public.serenity_checkout_payments_v2 set provider='asaas' where id=p_attempt;
  end if;
  return result;
end $$;

create or replace function public.serenity_asaas_customer_v1(p_attempt uuid,p_lease uuid,p_customer text)
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(7391542026);
  if coalesce(p_customer,'') !~ '^cus_[A-Za-z0-9_-]{1,100}$' then raise exception 'ASAAS_CUSTOMER_INVALID'; end if;
  update public.serenity_checkout_payments_v2 set asaas_customer_id=p_customer
  where id=p_attempt and provider='asaas' and state='submitting' and lease_id=p_lease
    and asaas_customer_id is null and provider_payment_id is null;
  if not found then raise exception 'PAYMENT_LEASE_INVALID'; end if;
end $$;

create or replace function public.serenity_asaas_uncertain_v1(p_attempt uuid,p_lease uuid,p_request_hash text,p_code text)
returns jsonb language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(7391542026);
  if coalesce(p_code,'') !~ '^ASAAS_[A-Z0-9_]{1,70}$' then raise exception 'PAYMENT_REQUEST_INVALID'; end if;
  -- A função existente exige um código MP; preservar o diagnóstico Asaas depois.
  if not exists(select 1 from public.serenity_checkout_payments_v2 where id=p_attempt and provider='asaas') then
    raise exception 'PAYMENT_ATTEMPT_INVALID';
  end if;
  perform public.serenity_checkout_pix_uncertain_v2(p_attempt,p_lease,p_request_hash,'MP_SUBMISSION_UNCERTAIN');
  update public.serenity_checkout_payments_v2 set last_error_code=p_code
  where id=p_attempt and state='uncertain';
  return jsonb_build_object('state','uncertain');
end $$;

-- Somente fatos obtidos pela API autenticada, nunca o corpo do webhook.
create or replace function public.serenity_asaas_observe_v1(p_attempt uuid,p_observation jsonb,p_source text)
returns jsonb language plpgsql set search_path = '' as $$
declare attempt public.serenity_checkout_payments_v2%rowtype; result jsonb; invoice text;
begin
  perform pg_advisory_xact_lock(7391542026);
  select * into attempt from public.serenity_checkout_payments_v2 where id=p_attempt for update;
  if not found or attempt.provider<>'asaas' or attempt.asaas_customer_id is null
    or p_observation->>'customer_id' is distinct from attempt.asaas_customer_id then
    raise exception 'PAYMENT_OBSERVATION_MISMATCH';
  end if;
  invoice := p_observation->>'invoice_url';
  if invoice is not null and (length(invoice)>2048 or invoice !~
    (case when attempt.environment='test' then '^https://sandbox[.]asaas[.]com/i/[A-Za-z0-9_/?=&%.-]+$'
      else '^https://www[.]asaas[.]com/i/[A-Za-z0-9_/?=&%.-]+$' end)) then
    raise exception 'ASAAS_INVOICE_URL_INVALID';
  end if;
  result := public.serenity_asaas_observe_base_v1(p_attempt,p_observation,p_source);
  update public.serenity_checkout_payments_v2 set asaas_invoice_url=invoice where id=p_attempt;
  if result->>'application_state'='applied' and result->>'order_id' is not null then
    update public.serenity_orders set
      shipping_details=jsonb_set(shipping_details,'{payment,provider}','"asaas"'::jsonb),
      notes=replace(notes,'Pagamento confirmado pelo Mercado Pago.','Pagamento confirmado pelo Asaas.')
    where id=(result->>'order_id')::uuid
      and shipping_details->'payment'->>'attempt_id'=p_attempt::text;
  end if;
  return result;
end $$;

-- Enriquece o contexto público sem expor documento, chave ou customer ID.
do $migration$
declare definition text;
begin
  if to_regprocedure('public.serenity_asaas_base_context_v1(uuid,text)') is null then
    definition := pg_get_functiondef('public.serenity_checkout_context_v2(uuid,text)'::regprocedure);
    execute replace(definition,'FUNCTION public.serenity_checkout_context_v2(',
      'FUNCTION public.serenity_asaas_base_context_v1(');
  end if;
end;
$migration$;
create or replace function public.serenity_checkout_context_v2(p_checkout uuid,p_access_hash text)
returns jsonb language plpgsql set search_path = '' as $$
declare result jsonb;
begin
  result := public.serenity_asaas_base_context_v1(p_checkout,p_access_hash);
  return result || jsonb_build_object('attempts',coalesce((
    select jsonb_agg(a.value || jsonb_build_object('provider',p.provider,'invoice_url',
      case when p.provider='asaas' and p.state='pending' and p.application_state<>'review'
        then p.asaas_invoice_url end) order by a.ordinality)
    from jsonb_array_elements(result->'attempts') with ordinality a(value,ordinality)
    join public.serenity_checkout_payments_v2 p on p.id=(a.value->>'id')::uuid
  ),'[]'::jsonb));
end $$;

create or replace function public.serenity_asaas_ready_v1()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('version',1,'ready',
    (public.serenity_checkout_payment_ready_v3()->>'ready')::boolean
    and to_regprocedure('public.serenity_asaas_claim_v1(uuid,text,uuid,text,text,text)') is not null
    and to_regprocedure('public.serenity_asaas_observe_v1(uuid,jsonb,text)') is not null);
$$;

do $$ declare signature text; begin
  foreach signature in array array[
    'public.serenity_asaas_observe_base_v1(uuid,jsonb,text)',
    'public.serenity_asaas_claim_v1(uuid,text,uuid,text,text,text)',
    'public.serenity_asaas_customer_v1(uuid,uuid,text)',
    'public.serenity_asaas_uncertain_v1(uuid,uuid,text,text)',
    'public.serenity_asaas_observe_v1(uuid,jsonb,text)',
    'public.serenity_asaas_base_context_v1(uuid,text)',
    'public.serenity_checkout_context_v2(uuid,text)',
    'public.serenity_asaas_ready_v1()'
  ] loop
    execute 'revoke all on function ' || signature || ' from public,anon,authenticated';
    execute 'grant execute on function ' || signature || ' to service_role';
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
