begin;
select pg_advisory_xact_lock(7391542026);

create table if not exists public.serenity_collection_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true
);
insert into public.serenity_collection_settings values (true, true) on conflict do nothing;
alter table public.serenity_collection_settings enable row level security;
revoke all on public.serenity_collection_settings from public, anon, authenticated;
grant select on public.serenity_collection_settings to anon, authenticated;
grant all on public.serenity_collection_settings to service_role;
drop policy if exists collection_public_read on public.serenity_collection_settings;
create policy collection_public_read on public.serenity_collection_settings for select to anon, authenticated using (true);

create table if not exists public.serenity_collection_function_backups_v1 (
  signature text primary key, definition text not null, saved_at timestamptz not null default now()
);
alter table public.serenity_collection_function_backups_v1 enable row level security;
revoke all on public.serenity_collection_function_backups_v1 from public, anon, authenticated;
grant all on public.serenity_collection_function_backups_v1 to service_role;

-- Preserve the installed functions, including any previous account/payment fixes.
do $migration$
declare signature text; original text;
begin
  foreach signature in array array[
    'public.serenity_checkout_coupon_quote_v2(jsonb,text,text,uuid)',
    'public.serenity_checkout_reserve_coupon_v2(uuid,text)',
    'public.serenity_checkout_complete_order_v2(uuid)',
    'public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text)',
    'public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)'
  ] loop
    original := pg_get_functiondef(signature::regprocedure);
    insert into public.serenity_collection_function_backups_v1 values(signature, original, now()) on conflict do nothing;
  end loop;
  if to_regprocedure('public.serenity_collection_coupon_base_v1(jsonb,text,text,uuid)') is null then
    original := pg_get_functiondef('public.serenity_checkout_coupon_quote_v2(jsonb,text,text,uuid)'::regprocedure);
    if position('FUNCTION public.serenity_checkout_coupon_quote_v2(' in original) = 0 then
      raise exception 'Não foi possível preservar a função de cupons. Nenhuma alteração aplicada.';
    end if;
    execute replace(original, 'FUNCTION public.serenity_checkout_coupon_quote_v2(', 'FUNCTION public.serenity_collection_coupon_base_v1(');
  end if;
end;
$migration$;

create or replace function public.serenity_collection_is_jewel_v1(p_product uuid)
returns boolean language sql stable set search_path = '' as $function$
  select coalesce(
    product_type in ('simple','variable')
    and lower(coalesce(name,'') || ' ' || coalesce(array_to_string(categories,' '),''))
      !~ '(after.?care|soro|limpeza|higieni|antiss[eé]pt|pin[çc]a|porta.?joia|estojo|mostru[aá]rio|expositor|luvas?|alicate|instrumental|autoclave|esteriliz|agulha|cateter|dermogr[aá]fo)'
    and lower(coalesce(material,'') || ' ' || coalesce(name,''))
      ~ '(tit[âa]nio|ouro|prata|a[çc]o|ni[óo]bio|joia|piercing|argola|clicker|labret|topo|stud|brinco|colar|pulseira|pingente|corrente|barbell|haste|conector)',
    false
  ) from public.products where id = p_product;
$function$;

create or replace function public.serenity_collection_coupon_cents_v1(snapshot jsonb, legacy_total bigint)
returns bigint language sql immutable set search_path = '' as $function$
  select coalesce((snapshot->'coupon'->>'discount_cents')::bigint,
    case when snapshot ? 'progressive' then 0 else legacy_total end);
$function$;

create or replace function public.serenity_checkout_coupon_quote_v2(
  p_items jsonb, p_code text default null, p_customer_key text default null, p_request uuid default null
) returns jsonb language plpgsql set search_path = '' as $function$
declare
  quote jsonb; item jsonb; units bigint := 0; eligible bigint := 0; products_cents bigint := 0;
  coupon_cents bigint; coupon_share bigint; coupon_products bigint := 0; coupon_jewels bigint := 0; coupon_scope text; selected_coupon uuid; line_cents bigint; is_jewel boolean; basis bigint; savings bigint; percent integer; enabled boolean;
begin
  perform pg_advisory_xact_lock(7391542026);
  quote := public.serenity_collection_coupon_base_v1(p_items, p_code, p_customer_key, p_request);
  select s.enabled into enabled from public.serenity_collection_settings s where singleton;
  if enabled is distinct from true or coalesce(current_setting('serenity.wholesale_user',true),'') <> ''
    or quote->>'pricing_mode' = 'wholesale' then return quote; end if;
  coupon_cents := coalesce((quote->>'discount_cents')::bigint,0);
  selected_coupon := (quote->'coupon'->>'id')::uuid;
  select scope into coupon_scope from public.serenity_coupons where id = selected_coupon;
  for item in select value from jsonb_array_elements(quote->'items') loop
    line_cents := round((item->>'unit_price')::numeric * 100)::bigint * (item->>'quantity')::integer;
    products_cents := products_cents + line_cents;
    is_jewel := public.serenity_collection_is_jewel_v1((item->>'product_id')::uuid);
    if coupon_cents > 0 and (coupon_scope = 'all' or exists (select 1 from public.serenity_coupon_products where coupon_id = selected_coupon and product_id = (item->>'product_id')::uuid)) then
      coupon_products := coupon_products + line_cents;
      if is_jewel is true then coupon_jewels := coupon_jewels + line_cents; end if;
    end if;
    if is_jewel is true then
      units := units + (item->>'quantity')::integer;
      eligible := eligible + round((item->>'unit_price')::numeric * 100)::bigint * (item->>'quantity')::integer;
    end if;
  end loop;
  percent := case when units >= 4 then 20 when units = 3 then 15 when units = 2 then 10 else 0 end;
  -- Allocate the coupon proportionally, so only the remaining jewelry value gets the extra discount.
  coupon_share := case when coupon_products > 0 then least(eligible, round(coupon_cents::numeric * coupon_jewels / coupon_products)::bigint) else 0 end;
  basis := greatest(0, eligible - coupon_share);
  savings := least(basis, round(basis::numeric * percent / 100)::bigint);
  return quote || jsonb_build_object(
    'subtotal_cents', coalesce((quote->>'subtotal_cents')::bigint,(quote->>'total_cents')::bigint + coupon_cents),
    'discount_cents', coupon_cents + savings,
    'total_cents', (quote->>'total_cents')::bigint - savings,
    'total', ((quote->>'total_cents')::bigint - savings) / 100.0,
    'progressive', jsonb_build_object('campaign','serenity-collection-v1','quantity',units,'percent',percent,
      'eligible_cents',eligible,'basis_cents',basis,'discount_cents',savings)
  );
end;
$function$;

-- Match only the intended expressions, allowing the installed SQL's line breaks.
do $migration$
declare
  original text; modified text; signature text; matches integer;
  coupon_value text := 'public.serenity_collection_coupon_cents_v1(checkout.pricing_snapshot, checkout.discount_cents)';
  condition_pattern text := 'if[[:space:]]+checkout[.]discount_cents[[:space:]]*>[[:space:]]*0[[:space:]]+then';
  comparison_pattern text := 'coupon_hold[.]discount_cents[[:space:]]+is[[:space:]]+distinct[[:space:]]+from[[:space:]]+checkout[.]discount_cents';
  redemption_pattern text := 'checkout[.]discount_cents[[:space:]]*,[[:space:]]*coupon_hold[.]coupon_snapshot';
  empty_coupon_pattern text := 'elsif[[:space:]]+checkout[.]discount_cents[[:space:]]*<>[[:space:]]*0[[:space:]]+then';
  assignment_pattern text := 'discount[[:space:]]*:=[[:space:]]*checkout[.]discount_cents[[:space:]]*;';
begin
  original := pg_get_functiondef('public.serenity_checkout_reserve_coupon_v2(uuid,text)'::regprocedure);
  if position('serenity_collection_coupon_cents_v1' in original) = 0 then
    select count(*) into matches from regexp_matches(original, empty_coupon_pattern, 'g');
    if matches <> 1 then
      raise exception 'A reserva de cupons mudou (condição). Nenhuma alteração aplicada.';
    end if;
    select count(*) into matches from regexp_matches(original, assignment_pattern, 'g');
    if matches <> 1 or position('serenity_checkout_coupon_quote_v2' in original) = 0 then
      raise exception 'A reserva de cupons mudou (valor). Nenhuma alteração aplicada.';
    end if;
    modified := regexp_replace(original, empty_coupon_pattern,
      'elsif checkout.discount_cents <> coalesce((checkout.pricing_snapshot->''progressive''->>''discount_cents'')::bigint,0) then', 'g');
    modified := regexp_replace(modified, assignment_pattern, 'discount := ' || coupon_value || ';', 'g');
    execute modified;
  end if;

  original := pg_get_functiondef('public.serenity_checkout_complete_order_v2(uuid)'::regprocedure);
  if position('serenity_collection_coupon_cents_v1' in original) = 0 then
    select count(*) into matches from regexp_matches(original, condition_pattern, 'g');
    if matches <> 2 then
      raise exception 'A confirmação de pagamentos mudou (condições). Nenhuma alteração aplicada.';
    end if;
    select count(*) into matches from regexp_matches(original, comparison_pattern, 'g');
    if matches <> 1 then
      raise exception 'A confirmação de pagamentos mudou (comparação). Nenhuma alteração aplicada.';
    end if;
    select count(*) into matches from regexp_matches(original, redemption_pattern, 'g');
    if matches <> 1 then
      raise exception 'A confirmação de pagamentos mudou (registro). Nenhuma alteração aplicada.';
    end if;
    modified := regexp_replace(original, condition_pattern, 'if ' || coupon_value || ' > 0 then', 'g');
    modified := regexp_replace(modified, comparison_pattern, 'coupon_hold.discount_cents is distinct from ' || coupon_value, 'g');
    modified := regexp_replace(modified, redemption_pattern, coupon_value || ', coupon_hold.coupon_snapshot', 'g');
    execute modified;
  end if;

  foreach signature in array array[
    'public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text)',
    'public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)'
  ] loop
    original := pg_get_functiondef(signature::regprocedure);
    if position('serenity_collection_coupon_cents_v1' in original) = 0 then
      select count(*) into matches from regexp_matches(original, condition_pattern, 'g');
      if matches <> 1 then
        raise exception 'A preparação de pagamento mudou (condição): %. Nenhuma alteração aplicada.', signature;
      end if;
      select count(*) into matches from regexp_matches(original, comparison_pattern, 'g');
      if matches <> 1 then
        raise exception 'A preparação de pagamento mudou (comparação): %. Nenhuma alteração aplicada.', signature;
      end if;
      modified := regexp_replace(original, condition_pattern, 'if ' || coupon_value || ' > 0 then', 'g');
      modified := regexp_replace(modified, comparison_pattern, 'coupon_hold.discount_cents is distinct from ' || coupon_value, 'g');
      execute modified;
    end if;
  end loop;
end;
$migration$;

revoke all on function public.serenity_collection_coupon_base_v1(jsonb,text,text,uuid),
  public.serenity_collection_is_jewel_v1(uuid), public.serenity_collection_coupon_cents_v1(jsonb,bigint),
  public.serenity_checkout_coupon_quote_v2(jsonb,text,text,uuid) from public, anon, authenticated;
grant execute on function public.serenity_collection_coupon_base_v1(jsonb,text,text,uuid),
  public.serenity_collection_is_jewel_v1(uuid), public.serenity_collection_coupon_cents_v1(jsonb,bigint),
  public.serenity_checkout_coupon_quote_v2(jsonb,text,text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
