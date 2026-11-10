-- Atualização única: Pix e cartão. Pode ser reaplicada. Não cria cobranças.
begin;

create or replace function public.serenity_checkout_account_confirmed_v2(
  p_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from auth.users as u
    where u.id = p_user
      and u.email_confirmed_at is not null
  );
$function$;

alter function public.serenity_checkout_account_confirmed_v2(uuid)
  owner to postgres;

revoke all on function public.serenity_checkout_account_confirmed_v2(uuid)
  from public, anon, authenticated;

grant execute on function public.serenity_checkout_account_confirmed_v2(uuid)
  to service_role;

do $migration$
declare
  definition text;
  patched text;
  matches integer;
  pattern constant text :=
    'not[[:space:]]+exists[[:space:]]*[(][[:space:]]*select[[:space:]]+1[[:space:]]+from[[:space:]]+auth[.]users[[:space:]]+where[[:space:]]+id[[:space:]]*=[[:space:]]*p_user[[:space:]]+and[[:space:]]+email_confirmed_at[[:space:]]+is[[:space:]]+not[[:space:]]+null[[:space:]]*[)]';
  replacement constant text :=
    'not public.serenity_checkout_account_confirmed_v2(p_user)';
begin
  definition := pg_get_functiondef(
    'public.serenity_checkout_start_v2(uuid,text,text,text,uuid,jsonb,jsonb,jsonb,bigint,text,uuid,text,text)'::regprocedure
  );

  select count(*) into matches
  from regexp_matches(definition, pattern, 'gi');

  if matches = 1 then
    patched := regexp_replace(definition, pattern, replacement, 'i');
    execute patched;
  elsif matches = 0 and position(replacement in definition) > 0 then
    null;
  else
    raise exception 'Não foi localizada uma única verificação de conta compatível. Nenhuma alteração foi aplicada.';
  end if;
end;
$migration$;

do $migration$
declare
  definition text;
  matches integer;
  pattern constant text :=
    'delivery[.]snapshot[[:space:]]*->[[:space:]]*''wholesale''[[:space:]]*->>[[:space:]]*''discount_percent''[[:space:]]+is[[:space:]]+distinct[[:space:]]+from[[:space:]]+context[[:space:]]*->>[[:space:]]*''discount_percent''';
  replacement constant text :=
    '(delivery.snapshot->''wholesale''->>''discount_percent'')::numeric is distinct from (context->>''discount_percent'')::numeric';
begin
  definition := pg_get_functiondef(
    'public.serenity_checkout_start_v2(uuid,text,text,text,uuid,jsonb,jsonb,jsonb,bigint,text,uuid,text,text)'::regprocedure
  );

  select count(*) into matches
  from regexp_matches(definition, pattern, 'gi');

  if matches = 1 then
    execute regexp_replace(definition, pattern, replacement, 'i');
  elsif matches = 0 and position(replacement in definition) > 0 then
    null;
  else
    raise exception 'Não foi localizada uma única comparação de desconto compatível. Nenhuma alteração foi aplicada.';
  end if;
end;
$migration$;

-- Verificar todas as funções que gravam a aprovação antes de liberar produção.
do $readiness$
declare
  signature text;
begin
  foreach signature in array array[
    'public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text)',
    'public.serenity_checkout_observe_payment_v2(uuid,jsonb,text)',
    'public.serenity_checkout_complete_order_v2(uuid)',
    'public.serenity_checkout_context_v2(uuid,text)'
  ] loop
    if to_regprocedure(signature) is null then
      raise exception 'Função obrigatória não instalada: %', signature;
    end if;
    if not has_function_privilege('service_role', signature, 'execute') then
      raise exception 'Permissão de servidor ausente: %', signature;
    end if;
  end loop;
end;
$readiness$;

alter table public.serenity_checkout_payments_v2
  add column if not exists last_reconciled_at timestamptz;

create index if not exists serenity_checkout_payments_v2_reconcile_idx
  on public.serenity_checkout_payments_v2(environment, last_reconciled_at, created_at)
  where state in ('submitting', 'pending', 'uncertain', 'approved');

create or replace function public.serenity_checkout_payment_ready_v3()
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'version', 3,
    'ready',
      to_regprocedure('public.serenity_checkout_complete_order_v2(uuid)') is not null
      and to_regprocedure('public.serenity_checkout_observe_payment_v2(uuid,jsonb,text)') is not null
      and to_regprocedure('public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text)') is not null
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'serenity_checkout_payments_v2'
          and column_name = 'last_reconciled_at'
      )
  );
$function$;

revoke all on function public.serenity_checkout_payment_ready_v3()
  from public, anon, authenticated;
grant execute on function public.serenity_checkout_payment_ready_v3()
  to service_role;

notify pgrst, 'reload schema';

alter table public.serenity_checkout_payments_v2
  add column if not exists card_authentication jsonb;

-- Reutiliza as mesmas reservas, trava e impedimento de cobrança simultânea do Pix.
do $migration$
declare
  definition text;
  matches integer;
begin
  definition := pg_get_functiondef(
    'public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text)'::regprocedure
  );
  select count(*) into matches
  from regexp_matches(definition, '''pix''', 'g');
  if matches <> 3 then
    raise exception 'A preparação de pagamento mudou. Nenhuma alteração foi aplicada.';
  end if;
  definition := replace(definition,
    'FUNCTION public.serenity_checkout_claim_pix_v2(',
    'FUNCTION public.serenity_checkout_claim_card_v3(');
  if position('FUNCTION public.serenity_checkout_claim_card_v3(' in definition) = 0 then
    raise exception 'Não foi possível preparar a função de cartão.';
  end if;
  execute replace(definition, '''pix''', '''card''');
end;
$migration$;

revoke all on function public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)
  to service_role;

create or replace function public.serenity_checkout_observe_payment_v3(
  p_attempt uuid, p_observation jsonb, p_source text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  result jsonb;
  authentication jsonb;
begin
  if p_observation->>'method' is distinct from 'card' then
    raise exception 'PAYMENT_OBSERVATION_INVALID';
  end if;
  authentication := nullif(p_observation->'card_authentication', 'null'::jsonb);
  if authentication is not null and (
    jsonb_typeof(authentication) is distinct from 'object'
    or jsonb_typeof(authentication->'external_resource_url') is distinct from 'string'
    or jsonb_typeof(authentication->'creq') is distinct from 'string'
    or length(authentication->>'external_resource_url') > 2048
    or (authentication->>'external_resource_url') !~ '^https://'
    or length(authentication->>'creq') not between 1 and 16384
    or (authentication->>'creq') !~ '^[A-Za-z0-9_+/=-]+$'
  ) then
    raise exception 'PAYMENT_OBSERVATION_INVALID';
  end if;

  result := public.serenity_checkout_observe_payment_v2(
    p_attempt, p_observation, p_source
  );

  update public.serenity_checkout_payments_v2
  set card_authentication = case
    when state = 'pending' and application_state <> 'review'
      and provider_status_detail = 'pending_challenge'
    then coalesce(
      case when provider_updated_at = (p_observation->>'updated_at')::timestamptz
        then authentication end,
      card_authentication
    )
    else null
  end
  where id = p_attempt and method = 'card';

  return result;
end;
$function$;

revoke all on function public.serenity_checkout_observe_payment_v3(uuid,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.serenity_checkout_observe_payment_v3(uuid,jsonb,text)
  to service_role;

-- Expõe somente o ID do pagamento e o desafio bancário da própria sessão.
do $migration$
declare
  definition text;
  matches integer;
  pattern constant text := '''application_state''[[:space:]]*,[[:space:]]*application_state';
begin
  definition := pg_get_functiondef(
    'public.serenity_checkout_context_v2(uuid,text)'::regprocedure
  );
  if position('''card_authentication''' in definition) > 0 then
    return;
  end if;
  select count(*) into matches from regexp_matches(definition, pattern, 'g');
  if matches <> 1 then
    raise exception 'A consulta da sessão mudou. Nenhuma alteração foi aplicada.';
  end if;
  execute regexp_replace(definition, pattern,
    '''provider_payment_id'', provider_payment_id,
      ''card_authentication'', case when method = ''card''
        and state = ''pending'' and application_state <> ''review''
        then card_authentication end,
      ''application_state'', application_state');
end;
$migration$;

create or replace function public.serenity_checkout_card_ready_v3()
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'version', 3,
    'ready',
      to_regprocedure('public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)') is not null
      and to_regprocedure('public.serenity_checkout_observe_payment_v3(uuid,jsonb,text)') is not null
      and position('''card_authentication''' in pg_get_functiondef(
        'public.serenity_checkout_context_v2(uuid,text)'::regprocedure
      )) > 0
  );
$function$;

revoke all on function public.serenity_checkout_card_ready_v3()
  from public, anon, authenticated;
grant execute on function public.serenity_checkout_card_ready_v3()
  to service_role;

notify pgrst, 'reload schema';

commit;
