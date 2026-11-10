begin;
select pg_advisory_xact_lock(7391542026);

create table if not exists public.serenity_pix_discount_settings_v4 (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true
);
insert into public.serenity_pix_discount_settings_v4 values(true,true) on conflict do nothing;
alter table public.serenity_pix_discount_settings_v4 enable row level security;
revoke all on public.serenity_pix_discount_settings_v4 from public,anon,authenticated;
grant select on public.serenity_pix_discount_settings_v4 to anon,authenticated;
grant all on public.serenity_pix_discount_settings_v4 to service_role;
drop policy if exists pix_discount_public_read on public.serenity_pix_discount_settings_v4;
create policy pix_discount_public_read on public.serenity_pix_discount_settings_v4 for select to anon,authenticated using(true);

create table if not exists public.serenity_pix_discount_backups_v4 (
  signature text primary key, definition text not null, saved_at timestamptz not null default now()
);
alter table public.serenity_pix_discount_backups_v4 enable row level security;
revoke all on public.serenity_pix_discount_backups_v4 from public,anon,authenticated;
grant all on public.serenity_pix_discount_backups_v4 to service_role;

do $migration$
declare signature text; target text; definition text; source_name text;
begin
  foreach signature in array array[
    'public.serenity_checkout_context_v2(uuid,text)',
    'public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text)',
    'public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)',
    'public.serenity_collection_coupon_cents_v1(jsonb,bigint)',
    'public.serenity_checkout_card_ready_v3()'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    insert into public.serenity_pix_discount_backups_v4 values(signature,definition,now()) on conflict do nothing;
    source_name := split_part(split_part(signature,'public.',2),'(',1);
    target := case source_name
      when 'serenity_checkout_context_v2' then 'serenity_pix_base_context_v4'
      when 'serenity_checkout_claim_pix_v2' then 'serenity_pix_base_claim_v4'
      when 'serenity_checkout_claim_card_v3' then 'serenity_card_base_claim_v4'
      else null end;
    if target is not null and to_regprocedure(replace(signature,source_name,target)) is null then
      if position('FUNCTION public.' || source_name || '(' in definition) = 0 then
        raise exception 'Não foi possível preservar a função %. Nenhuma alteração aplicada.',source_name;
      end if;
      execute replace(definition,'FUNCTION public.' || source_name || '(','FUNCTION public.' || target || '(');
    end if;
  end loop;
end;
$migration$;

create or replace function public.serenity_collection_coupon_cents_v1(snapshot jsonb,legacy_total bigint)
returns bigint language sql immutable set search_path = '' as $function$
  select coalesce((snapshot->'coupon'->>'discount_cents')::bigint,
    case when snapshot ? 'progressive' or snapshot ? 'payment_discount' then 0 else legacy_total end);
$function$;

create or replace function public.serenity_checkout_payment_prices_v4(p_checkout uuid)
returns jsonb language plpgsql set search_path = '' as $function$
declare
  checkout public.serenity_checkout_sessions_v2%rowtype;
  saved jsonb; original_total bigint; original_discount bigint; products_cents bigint; basis bigint;
  savings bigint := 0; selected text; enabled boolean; blocked boolean;
begin
  select * into checkout from public.serenity_checkout_sessions_v2 where id=p_checkout;
  if not found then raise exception 'CHECKOUT_ACCESS_INVALID'; end if;
  saved := checkout.pricing_snapshot->'payment_discount';
  if saved->>'campaign' = 'pix-five-v4' then
    original_total := (saved->>'original_total_cents')::bigint;
    original_discount := (saved->>'original_discount_cents')::bigint;
    selected := saved->>'selected_method';
  else
    original_total := checkout.total_cents;
    original_discount := checkout.discount_cents;
  end if;
  select coalesce(sum(round((item->>'unit_price')::numeric * 100)::bigint * (item->>'quantity')::integer),0)
    into products_cents from jsonb_array_elements(checkout.order_items) as rows(item);
  basis := greatest(0,products_cents-original_discount);
  select s.enabled into enabled from public.serenity_pix_discount_settings_v4 s where singleton;
  select exists(select 1 from public.serenity_checkout_payments_v2 where checkout_id=p_checkout and
    (blocks_new_attempt or application_state='review' or state in ('approved','refunded','charged_back'))) into blocked;
  if enabled is true and checkout.pricing_mode='retail' and (not blocked or selected is not null) then
    savings := least(basis,round(basis::numeric*5/100)::bigint);
  end if;
  return jsonb_build_object('card_total_cents',original_total,'pix_total_cents',original_total-savings,
    'pix_discount_cents',savings,'basis_cents',basis,'original_discount_cents',original_discount,
    'selected_method',selected,'applied_discount_cents',coalesce((saved->>'discount_cents')::bigint,0));
end;
$function$;

create or replace function public.serenity_checkout_context_v2(p_checkout uuid,p_access_hash text)
returns jsonb language plpgsql set search_path = '' as $function$
declare context jsonb;
begin
  context := public.serenity_pix_base_context_v4(p_checkout,p_access_hash);
  return context || jsonb_build_object('payment_options',public.serenity_checkout_payment_prices_v4(p_checkout));
end;
$function$;

create or replace function public.serenity_checkout_select_method_v4(p_checkout uuid,p_access_hash text,p_method text)
returns jsonb language plpgsql set search_path = '' as $function$
declare checkout public.serenity_checkout_sessions_v2%rowtype; prices jsonb; savings bigint; original_total bigint; original_discount bigint; snapshot jsonb;
begin
  perform pg_advisory_xact_lock(7391542026);
  if p_method is null or p_method not in ('pix','card') then raise exception 'INVALID_REQUEST'; end if;
  perform public.serenity_pix_base_context_v4(p_checkout,p_access_hash);
  select * into checkout from public.serenity_checkout_sessions_v2 where id=p_checkout for update;
  if checkout.state <> 'pending' or checkout.order_id is not null or checkout.shipping_pending
    or checkout.expires_at <= now()+interval '1 minute' then raise exception 'PAYMENT_CHECKOUT_UNAVAILABLE'; end if;
  if exists(select 1 from public.serenity_checkout_payments_v2 where checkout_id=p_checkout and
    (blocks_new_attempt or application_state='review' or state in ('approved','refunded','charged_back'))) then
    raise exception 'PAYMENT_ALREADY_STARTED';
  end if;
  prices := public.serenity_checkout_payment_prices_v4(p_checkout);
  original_total := (prices->>'card_total_cents')::bigint;
  original_discount := (prices->>'original_discount_cents')::bigint;
  savings := case when p_method='pix' then (prices->>'pix_discount_cents')::bigint else 0 end;
  snapshot := checkout.pricing_snapshot || jsonb_build_object(
    'payment_discount',jsonb_build_object('campaign','pix-five-v4','selected_method',p_method,
      'original_total_cents',original_total,'original_discount_cents',original_discount,
      'basis_cents',(prices->>'basis_cents')::bigint,'discount_cents',savings),
    'discount_cents',original_discount+savings,'total_cents',original_total-savings,'total',(original_total-savings)/100.0);
  update public.serenity_checkout_sessions_v2 set pricing_snapshot=snapshot,discount_cents=original_discount+savings,
    total_cents=original_total-savings,updated_at=now() where id=p_checkout;
  return public.serenity_checkout_context_v2(p_checkout,p_access_hash);
end;
$function$;

create or replace function public.serenity_checkout_assert_method_v4(p_checkout uuid,p_method text)
returns void language plpgsql set search_path = '' as $function$
declare selected text;
begin
  perform pg_advisory_xact_lock(7391542026);
  select pricing_snapshot->'payment_discount'->>'selected_method' into selected
    from public.serenity_checkout_sessions_v2 where id=p_checkout;
  if selected is not null and selected is distinct from p_method then raise exception 'PAYMENT_METHOD_CHANGED'; end if;
end;
$function$;

create or replace function public.serenity_checkout_claim_pix_v2(p_checkout uuid,p_access_hash text,p_attempt uuid,p_merchant text,p_request_hash text)
returns jsonb language plpgsql set search_path = '' as $function$
begin
  perform public.serenity_checkout_assert_method_v4(p_checkout,'pix');
  return public.serenity_pix_base_claim_v4(p_checkout,p_access_hash,p_attempt,p_merchant,p_request_hash);
end;
$function$;
create or replace function public.serenity_checkout_claim_card_v3(p_checkout uuid,p_access_hash text,p_attempt uuid,p_merchant text,p_request_hash text)
returns jsonb language plpgsql set search_path = '' as $function$
begin
  perform public.serenity_checkout_assert_method_v4(p_checkout,'card');
  return public.serenity_card_base_claim_v4(p_checkout,p_access_hash,p_attempt,p_merchant,p_request_hash);
end;
$function$;

create or replace function public.serenity_checkout_card_ready_v3()
returns jsonb language sql stable set search_path = '' as $function$
  select jsonb_build_object('version',3,'ready',
    to_regprocedure('public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)') is not null
    and to_regprocedure('public.serenity_checkout_observe_payment_v3(uuid,jsonb,text)') is not null
    and position('serenity_pix_base_context_v4' in pg_get_functiondef('public.serenity_checkout_context_v2(uuid,text)'::regprocedure)) > 0
    and position('''card_authentication''' in pg_get_functiondef('public.serenity_pix_base_context_v4(uuid,text)'::regprocedure)) > 0);
$function$;

revoke all on function public.serenity_pix_base_context_v4(uuid,text),public.serenity_pix_base_claim_v4(uuid,text,uuid,text,text),
 public.serenity_card_base_claim_v4(uuid,text,uuid,text,text),public.serenity_checkout_payment_prices_v4(uuid),
 public.serenity_checkout_select_method_v4(uuid,text,text),public.serenity_checkout_assert_method_v4(uuid,text),
 public.serenity_checkout_context_v2(uuid,text),public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text),
 public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.serenity_pix_base_context_v4(uuid,text),public.serenity_pix_base_claim_v4(uuid,text,uuid,text,text),
 public.serenity_card_base_claim_v4(uuid,text,uuid,text,text),public.serenity_checkout_payment_prices_v4(uuid),
 public.serenity_checkout_select_method_v4(uuid,text,text),public.serenity_checkout_assert_method_v4(uuid,text),
 public.serenity_checkout_context_v2(uuid,text),public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text),
 public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
