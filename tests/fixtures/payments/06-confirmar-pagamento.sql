begin;

create or replace function public.serenity_checkout_complete_order_v2(p_attempt uuid)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  attempt public.serenity_checkout_payments_v2%rowtype;
  checkout public.serenity_checkout_sessions_v2%rowtype;
  existing public.serenity_orders%rowtype;
  coupon_hold public.serenity_checkout_coupon_v2%rowtype;
  coupon public.serenity_coupons%rowtype;
  product public.products%rowtype;
  variant public.product_variants%rowtype;
  capacity record;
  customer_id uuid;
  item jsonb;
  entries jsonb := '[]'::jsonb;
  wanted jsonb;
  held jsonb;
  qty integer;
  unit numeric;
  fee numeric;
  unit_cost numeric;
  supplier text;
  color text;
  color_name text;
  subtotal numeric := 0;
  costs numeric := 0;
  missing integer := 0;
  shipping_snapshot jsonb;
begin
  perform pg_advisory_xact_lock(7391542026);
  select * into attempt from public.serenity_checkout_payments_v2
  where id = p_attempt for update;
  if not found or attempt.state <> 'approved'
    or attempt.provider_status <> 'approved' or attempt.environment <> 'production'
    or attempt.provider_payment_id is null or attempt.refunded_cents <> 0 then
    raise exception 'PAYMENT_APPROVAL_REQUIRED';
  end if;

  select * into checkout from public.serenity_checkout_sessions_v2
  where id = attempt.checkout_id for update;
  if not found or checkout.environment <> 'production'
    or checkout.total_cents is distinct from attempt.amount_cents
    or checkout.shipping_pending then
    raise exception 'PAYMENT_CHECKOUT_UNAVAILABLE';
  end if;

  if checkout.order_id is not null then
    select * into existing from public.serenity_orders where id = checkout.order_id;
    if not found or existing.source <> 'site' or existing.status is distinct from 'paid'
      or existing.checkout_fingerprint is distinct from checkout.fingerprint
      or existing.total * 100 is distinct from checkout.total_cents::numeric
      or existing.shipping_details->'payment'->>'attempt_id' is distinct from attempt.id::text then
      raise exception 'PAYMENT_ORDER_CONFLICT';
    end if;
    return existing.id;
  end if;

  if checkout.state not in ('pending', 'payment_pending', 'review')
    or checkout.expires_at <= now()
    or exists(select 1 from public.serenity_orders where id = checkout.id) then
    raise exception 'PAYMENT_RESERVATION_EXPIRED';
  end if;
  if exists(select 1 from public.serenity_checkout_payments_v2
    where checkout_id = checkout.id and id <> attempt.id
      and (blocks_new_attempt or application_state = 'review'
        or state in ('approved', 'refunded', 'charged_back'))) then
    raise exception 'PAYMENT_ORDER_CONFLICT';
  end if;

  select jsonb_object_agg(entity_key, quantity) into wanted
  from (
    select coalesce(nullif(x->>'variant_id', ''), 'product:' || (x->>'product_id')) as entity_key,
      sum((x->>'quantity')::integer) as quantity
    from jsonb_array_elements(checkout.order_items) x group by 1
  ) expected;
  select jsonb_object_agg(entity_key, quantity) into held
  from public.serenity_checkout_stock_v2
  where checkout_id = checkout.id and state = 'active';
  if wanted is null or wanted is distinct from held
    or exists(select 1 from public.serenity_checkout_stock_v2
      where checkout_id = checkout.id and state = 'active' and expires_at <= now()) then
    raise exception 'PAYMENT_RESERVATION_EXPIRED';
  end if;
  perform public.serenity_stock_assert(checkout.id, checkout.order_items);

  if checkout.discount_cents > 0 then
    select * into coupon_hold from public.serenity_checkout_coupon_v2
    where checkout_id = checkout.id for update;
    if not found or coupon_hold.state <> 'reserved' or coupon_hold.expires_at <= now()
      or coupon_hold.discount_cents is distinct from checkout.discount_cents
      or coupon_hold.coupon_snapshot is distinct from checkout.pricing_snapshot->'coupon' then
      raise exception 'COUPON_RESERVATION';
    end if;
    select * into coupon from public.serenity_coupons where id = coupon_hold.coupon_id for update;
    if not found then raise exception 'COUPON_UNAVAILABLE'; end if;
    select * into capacity from public.serenity_coupon_capacity_v2(
      coupon.id, coupon_hold.customer_key, checkout.id);
    if coupon.max_uses is not null and capacity.global_uses >= coupon.max_uses then
      raise exception 'COUPON_LIMIT';
    end if;
    if coupon.max_uses_per_customer is not null
      and capacity.customer_uses >= coupon.max_uses_per_customer then
      raise exception 'COUPON_CUSTOMER_LIMIT';
    end if;
  end if;

  if checkout.account_user_id is not null then
    select a.customer_id into customer_id from public.serenity_customer_accounts a
    where a.user_id = checkout.account_user_id;
    if customer_id is null then raise exception 'CUSTOMER_ACCOUNT_UNAVAILABLE'; end if;
  else
    customer_id := checkout.id;
    insert into public.serenity_customers(id, name, email, phone)
    values(customer_id, checkout.customer_snapshot->>'name',
      checkout.customer_snapshot->>'email', checkout.customer_snapshot->>'phone');
  end if;

  for item in select value from jsonb_array_elements(checkout.order_items)
  loop
    select * into product from public.products where id = (item->>'product_id')::uuid;
    if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    variant := null;
    if nullif(item->>'variant_id', '') is not null then
      select * into variant from public.product_variants
      where id = (item->>'variant_id')::uuid and product_id = product.id;
      if not found then raise exception 'VARIANT_UNAVAILABLE'; end if;
    end if;
    qty := (item->>'quantity')::integer;
    unit := (item->>'unit_price')::numeric;
    fee := (item->>'fee')::numeric;
    if qty is null or qty <= 0 or unit is null or fee is null
      or unit::text in ('NaN', 'Infinity', '-Infinity')
      or fee not in (0, 15) or unit < 0 or unit <> round(unit, 2) then
      raise exception 'PAYMENT_AMOUNT_CHANGED';
    end if;
    color := coalesce(item->>'color', '');
    color_name := ('{"12":"Bronze Claro","15":"Bronze Escuro","18":"Berinjela","20":"Roxo Escuro","22":"Roxo","25":"Azul Escuro","28":"Azul","30":"Azul Médio","33":"Azul Céu","36":"Azul Claro","40":"Azul Gelo","42":"Azul Prateado","48":"Amarelo Pálido","55":"Amarelo Claro","61":"Amarelo","64":"Dourado","70":"Rose Gold","72":"Rosa Claro","75":"Rosa","80":"Fúcsia","85":"Fúcsia Escuro","90":"Roxo Vibrante","92":"Roxo Azulado","95":"Roxo Petróleo","103":"Verde Azulado","105":"Verde"}'::jsonb)->>color;
    if (color = '' and fee <> 0) or (color <> '' and (color_name is null or fee <> 15)) then
      raise exception 'INVALID_ANODIZATION';
    end if;

    unit_cost := null;
    supplier := null;
    select c.unit_cost, c.supplier_name into unit_cost, supplier
    from public.serenity_product_commercial c
    where c.entity_key in ('product:' || product.id::text, 'variant:' || variant.id::text)
    order by (c.variant_id is not null and c.unit_cost is not null) desc,
      (c.unit_cost is not null) desc, (c.variant_id is not null) desc limit 1;
    if unit_cost is null then missing := missing + qty;
    elsif unit_cost::text in ('NaN', 'Infinity', '-Infinity') or unit_cost < 0 then
      raise exception 'INVALID_COST';
    else costs := costs + unit_cost * qty;
    end if;
    subtotal := subtotal + (unit + fee) * qty;
    entries := entries || jsonb_build_array(jsonb_build_object(
      'product_id', product.id, 'variant_id', variant.id,
      'name', coalesce(item->>'name', product.name), 'variation', item->>'variation',
      'sku', coalesce(variant.sku, product.sku), 'quantity', qty,
      'base_price', unit, 'anodization', color_name, 'voltage', nullif(color, ''),
      'anodization_fee', fee, 'unit_price', unit + fee,
      'unit_cost', unit_cost, 'supplier', supplier
    ));
  end loop;
  if subtotal * 100 is distinct from checkout.subtotal_cents::numeric then
    raise exception 'PAYMENT_AMOUNT_CHANGED';
  end if;

  shipping_snapshot := checkout.shipping_snapshot || jsonb_build_object(
    'pricing_mode', checkout.pricing_mode,
    'payment', jsonb_build_object('provider', 'mercado_pago',
      'attempt_id', attempt.id, 'payment_id', attempt.provider_payment_id));
  if checkout.pricing_mode = 'wholesale' then
    shipping_snapshot := shipping_snapshot || jsonb_build_object('wholesale',
      checkout.pricing_snapshot->'wholesale' || jsonb_build_object('user_id', checkout.account_user_id));
  end if;

  insert into public.serenity_orders (
    id, customer_id, customer_snapshot, items, subtotal, discount, shipping,
    expenses, total, cost, missing_costs, status, notes, created_by, paid_at,
    source, shipping_pending, delivery_address, checkout_fingerprint,
    shipping_details, account_user_id
  ) values (
    checkout.id, customer_id, checkout.customer_snapshot, entries,
    subtotal, checkout.discount_cents / 100.0, checkout.shipping_cents / 100.0,
    0, checkout.total_cents / 100.0, case when missing = 0 then costs end,
    missing, 'paid', 'Pagamento confirmado pelo Mercado Pago.', null, now(),
    'site', false, checkout.delivery_address, checkout.fingerprint,
    shipping_snapshot, checkout.account_user_id
  );

  -- A função existente é idempotente, inclusive quando chamada pelo trigger.
  perform public.serenity_stock_debit(checkout.id, null);

  if checkout.discount_cents > 0 then
    insert into public.serenity_coupon_redemptions (
      order_id, coupon_id, customer_key, state, discount_cents,
      coupon_snapshot, reserved_until
    ) values (
      checkout.id, coupon_hold.coupon_id, coupon_hold.customer_key, 'used',
      checkout.discount_cents, coupon_hold.coupon_snapshot, null
    );
  end if;
  update public.serenity_shipping_quotes set consumed_by = checkout.id
  where id = checkout.shipping_quote_id and request_id = checkout.id and consumed_by is null;
  if not found then raise exception 'SHIPPING_QUOTE_EXPIRED'; end if;

  update public.serenity_checkout_stock_v2 set state = 'converted'
  where checkout_id = checkout.id and state = 'active';
  update public.serenity_checkout_coupon_v2 set state = 'converted'
  where checkout_id = checkout.id and state = 'reserved';
  update public.serenity_checkout_sessions_v2
  set state = 'converted', order_id = checkout.id, updated_at = now()
  where id = checkout.id;
  return checkout.id;
end;
$function$;

-- Aceita somente fatos normalizados após consulta autenticada ao Mercado Pago.
-- Nunca passar diretamente o corpo recebido de um webhook ou do navegador.
create or replace function public.serenity_checkout_observe_payment_v2(
  p_attempt uuid, p_observation jsonb, p_source text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  attempt public.serenity_checkout_payments_v2%rowtype;
  checkout public.serenity_checkout_sessions_v2%rowtype;
  provider_time timestamptz;
  expiration timestamptz;
  payment_id text;
  status text;
  detail text;
  next_state text;
  amount bigint;
  refunded bigint;
  snapshot jsonb;
  application text := 'pending';
  error_code text := '';
  code text;
  result_order uuid;
  order_status text;
  order_attempt text;
  review boolean := false;
  regressed boolean := false;
  blocker_available boolean;
begin
  perform pg_advisory_xact_lock(7391542026);
  if p_attempt is null or jsonb_typeof(p_observation) is distinct from 'object'
    or p_source is null or p_source not in ('create', 'webhook', 'poll', 'reconcile', 'admin')
    or coalesce(p_observation->>'provider_payment_id', '') !~ '^[0-9]{1,40}$'
    or coalesce(p_observation->>'amount_cents', '') !~ '^[0-9]{1,16}$'
    or coalesce(p_observation->>'refunded_cents', '') !~ '^[0-9]{1,16}$'
    or coalesce(p_observation->>'status', '') !~ '^[a-z_]{1,40}$'
    or length(coalesce(p_observation->>'status_detail', '')) > 120
    or length(coalesce(p_observation->>'pix_code', '')) > 4096
    or length(coalesce(p_observation->>'pix_qr_base64', '')) > 300000
    or coalesce(p_observation->>'pix_qr_base64', '') !~ '^[A-Za-z0-9+/]*={0,2}$' then
    raise exception 'PAYMENT_OBSERVATION_INVALID';
  end if;
  begin
    provider_time := (p_observation->>'updated_at')::timestamptz;
    expiration := nullif(p_observation->>'expires_at', '')::timestamptz;
    if provider_time is null or not isfinite(provider_time)
      or (expiration is not null and not isfinite(expiration)) then
      raise exception 'PAYMENT_OBSERVATION_INVALID';
    end if;
  exception when others then raise exception 'PAYMENT_OBSERVATION_INVALID';
  end;

  select * into attempt from public.serenity_checkout_payments_v2
  where id = p_attempt for update;
  if not found then raise exception 'PAYMENT_ATTEMPT_INVALID'; end if;
  select * into checkout from public.serenity_checkout_sessions_v2
  where id = attempt.checkout_id for update;

  blocker_available := not exists(
    select 1 from public.serenity_checkout_payments_v2
    where checkout_id = checkout.id and id <> attempt.id and blocks_new_attempt
  );

  payment_id := p_observation->>'provider_payment_id';
  amount := (p_observation->>'amount_cents')::bigint;
  refunded := (p_observation->>'refunded_cents')::bigint;
  status := p_observation->>'status';
  detail := coalesce(p_observation->>'status_detail', '');
  if p_observation->>'environment' is distinct from attempt.environment
    or p_observation->>'merchant_id' is distinct from attempt.merchant_id
    or p_observation->>'external_reference' is distinct from checkout.id::text
    or p_observation->>'attempt_id' is distinct from attempt.id::text
    or p_observation->>'method' is distinct from attempt.method
    or p_observation->>'currency' is distinct from attempt.currency
    or amount is distinct from attempt.amount_cents or refunded > amount
    or exists(select 1 from public.serenity_checkout_payments_v2
      where id <> attempt.id and environment = attempt.environment
        and merchant_id = attempt.merchant_id and provider_payment_id = payment_id) then
    raise exception 'PAYMENT_OBSERVATION_MISMATCH';
  end if;

  snapshot := jsonb_build_object(
    'provider_payment_id', payment_id, 'status', status, 'status_detail', detail,
    'amount_cents', amount, 'refunded_cents', refunded,
    'updated_at', provider_time, 'expires_at', expiration);
  insert into public.serenity_checkout_payment_events_v2(attempt_id, source, event_key, snapshot)
  values(attempt.id, p_source, encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex'), snapshot)
  on conflict(attempt_id, event_key) do nothing;

  if attempt.provider_payment_id is not null and attempt.provider_payment_id <> payment_id then
    update public.serenity_checkout_payments_v2
    set application_state = 'review', blocks_new_attempt = blocker_available,
      last_error_code = 'PAYMENT_PROVIDER_CONFLICT', updated_at = now()
    where id = attempt.id;
    update public.serenity_checkout_sessions_v2 set state = 'review', updated_at = now()
    where id = checkout.id and order_id is null;
    return jsonb_build_object('state', attempt.state, 'application_state', 'review');
  end if;
  if attempt.provider_updated_at is not null and provider_time < attempt.provider_updated_at then
    return jsonb_build_object('state', attempt.state, 'application_state', attempt.application_state);
  end if;

  next_state := case
    when status = 'charged_back' then 'charged_back'
    when refunded = amount then 'refunded'
    when status = 'approved' then 'approved'
    when status = 'rejected' then 'rejected'
    when status in ('cancelled', 'canceled') then 'cancelled'
    when status in ('pending', 'in_process', 'authorized', 'in_mediation') then 'pending'
    else 'uncertain' end;
  refunded := greatest(refunded, attempt.refunded_cents);
  if refunded = amount and next_state <> 'charged_back' then next_state := 'refunded'; end if;

  if (attempt.state = 'approved' and next_state in ('pending', 'rejected', 'cancelled', 'uncertain'))
    or (attempt.state = 'refunded' and next_state not in ('refunded', 'charged_back'))
    or (attempt.state = 'charged_back' and next_state <> 'charged_back') then
    next_state := attempt.state;
    regressed := true;
  end if;
  if regressed or (p_observation->>'refunded_cents')::bigint < attempt.refunded_cents then
    review := true; error_code := 'PAYMENT_STATE_REGRESSION';
  elsif status = 'in_mediation' or next_state in ('charged_back', 'uncertain')
    or (refunded > 0 and refunded < amount) then
    review := true; error_code := 'PAYMENT_FINANCIAL_REVIEW';
  end if;
  if next_state = 'pending' and attempt.method = 'pix'
    and (expiration is null or expiration > checkout.expires_at - interval '1 minute'
      or expiration <= now()) then
    review := true; error_code := 'PAYMENT_EXPIRY_UNSAFE';
  end if;

  if next_state = 'uncertain' and not blocker_available then
    next_state := attempt.state;
    review := true;
    error_code := 'PAYMENT_MULTIPLE_ATTEMPTS';
  end if;

  update public.serenity_checkout_payments_v2
  set provider_payment_id = payment_id, provider_status = status,
    provider_status_detail = detail, provider_updated_at = provider_time,
    refunded_cents = refunded, state = next_state,
    application_state = case when review then 'review' else 'pending' end,
    blocks_new_attempt = blocker_available and (review or next_state not in ('rejected', 'cancelled', 'refunded')),
    expires_at = coalesce(expiration, expires_at),
    pix_code = case when next_state = 'pending' and not review
      then coalesce(nullif(p_observation->>'pix_code', ''), pix_code) end,
    pix_qr_base64 = case when next_state = 'pending' and not review
      then coalesce(nullif(p_observation->>'pix_qr_base64', ''), pix_qr_base64) end,
    lease_id = null, lease_expires_at = null, last_error_code = error_code, updated_at = now()
  where id = attempt.id;

  if review then application := 'review';
  elsif next_state = 'approved' and attempt.environment = 'test' then
    application := 'test_approved';
  elsif next_state = 'approved' then
    begin
      result_order := public.serenity_checkout_complete_order_v2(attempt.id);
      application := 'applied';
    exception when others then
      get stacked diagnostics code = returned_sqlstate;
      application := 'review'; error_code := 'PAYMENT_ORDER_' || code;
    end;
  elsif next_state = 'refunded' and attempt.environment = 'production' and checkout.order_id is not null then
    begin
      select o.status, o.shipping_details->'payment'->>'attempt_id'
      into order_status, order_attempt from public.serenity_orders o
      where o.id = checkout.order_id for update;
      if order_attempt is distinct from attempt.id::text then
        raise exception 'PAYMENT_ORDER_CONFLICT';
      end if;
      if order_status = 'paid' then
        perform public.serenity_admin_order_status(checkout.order_id, 'paid', 'refunded');
      elsif order_status <> 'refunded' then
        raise exception 'PAYMENT_ORDER_CONFLICT';
      end if;
      application := 'applied';
    exception when others then
      get stacked diagnostics code = returned_sqlstate;
      application := 'review'; error_code := 'PAYMENT_REFUND_' || code;
    end;
  elsif next_state in ('rejected', 'cancelled', 'refunded') then
    application := 'applied';
  end if;

  update public.serenity_checkout_payments_v2
  set application_state = application, last_error_code = error_code,
    blocks_new_attempt = blocker_available and (application in ('review', 'test_approved')
      or next_state not in ('rejected', 'cancelled', 'refunded')),
    updated_at = now()
  where id = attempt.id;

  if application = 'test_approved' then
    update public.serenity_checkout_stock_v2 set state = 'released'
    where checkout_id = checkout.id and state = 'active';
    update public.serenity_checkout_coupon_v2 set state = 'released'
    where checkout_id = checkout.id and state = 'reserved';
    update public.serenity_checkout_sessions_v2 set state = 'review', updated_at = now()
    where id = checkout.id and order_id is null;
  elsif application = 'review' then
    update public.serenity_checkout_sessions_v2 set state = 'review', updated_at = now()
    where id = checkout.id and order_id is null;
  elsif next_state = 'pending' then
    update public.serenity_checkout_sessions_v2 set state = 'payment_pending', updated_at = now()
    where id = checkout.id and order_id is null and state in ('pending', 'payment_pending', 'review');
  elsif next_state in ('rejected', 'cancelled', 'refunded') then
    if not exists(select 1 from public.serenity_checkout_payments_v2
      where checkout_id = checkout.id and (blocks_new_attempt or application_state = 'review')) then
      update public.serenity_checkout_sessions_v2 set state = 'pending', updated_at = now()
      where id = checkout.id and order_id is null and state in ('pending', 'payment_pending', 'review');
    end if;
  end if;

  return jsonb_build_object('state', next_state, 'application_state', application, 'order_id', result_order);
end;
$function$;

-- Acrescentar os indicadores de conferência sem expor dados do pagador.
do $migration$
declare
  definition text;
  modified text;
  pattern text := $pattern$return[[:space:]]+jsonb_build_object\([[:space:]]*'checkout_id'$pattern$;
begin
  definition := pg_get_functiondef('public.serenity_checkout_context_v2(uuid,text)'::regprocedure);
  if position('''needs_review''' in definition) > 0 then return; end if;
  modified := regexp_replace(definition, pattern,
    'return jsonb_build_object(
      ''needs_review'', exists(select 1 from public.serenity_checkout_payments_v2
        where checkout_id = checkout.id and application_state = ''review''),
      ''test_approved'', exists(select 1 from public.serenity_checkout_payments_v2
        where checkout_id = checkout.id and application_state = ''test_approved'')
    ) || jsonb_build_object(''checkout_id''');
  if modified = definition then raise exception 'A consulta do checkout está diferente da esperada.'; end if;
  execute modified;
end;
$migration$;

revoke all on function public.serenity_checkout_complete_order_v2(uuid) from public, anon, authenticated;
revoke all on function public.serenity_checkout_observe_payment_v2(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.serenity_checkout_complete_order_v2(uuid) to service_role;
grant execute on function public.serenity_checkout_observe_payment_v2(uuid, jsonb, text) to service_role;

notify pgrst, 'reload schema';
commit;
