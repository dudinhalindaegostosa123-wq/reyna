CREATE OR REPLACE FUNCTION public.serenity_checkout_complete_order_v2(p_attempt uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

  select *
  into attempt
  from public.serenity_checkout_payments_v2
  where id = p_attempt
  for update;

  if not found
    or attempt.state <> 'approved'
    or attempt.provider_status <> 'approved'
    or attempt.environment <> 'production'
    or attempt.provider_payment_id is null
    or attempt.refunded_cents <> 0
  then
    raise exception 'PAYMENT_APPROVAL_REQUIRED';
  end if;

  select *
  into checkout
  from public.serenity_checkout_sessions_v2
  where id = attempt.checkout_id
  for update;

  if not found
    or checkout.environment <> 'production'
    or checkout.total_cents
      is distinct from attempt.amount_cents
    or checkout.shipping_pending
  then
    raise exception 'PAYMENT_CHECKOUT_UNAVAILABLE';
  end if;

  if checkout.order_id is not null then
    select *
    into existing
    from public.serenity_orders
    where id = checkout.order_id;

    if not found
      or existing.source <> 'site'
      or existing.status is distinct from 'paid'
      or existing.checkout_fingerprint
        is distinct from checkout.fingerprint
      or existing.total * 100
        is distinct from checkout.total_cents::numeric
      or existing.shipping_details->'payment'->>'attempt_id'
        is distinct from attempt.id::text
    then
      raise exception 'PAYMENT_ORDER_CONFLICT';
    end if;

    return existing.id;
  end if;

  if checkout.state not in (
      'pending',
      'payment_pending',
      'review'
    )
    or checkout.expires_at <= now()
    or exists (
      select 1
      from public.serenity_orders
      where id = checkout.id
    )
  then
    raise exception 'PAYMENT_RESERVATION_EXPIRED';
  end if;

  if exists (
    select 1
    from public.serenity_checkout_payments_v2
    where checkout_id = checkout.id
      and id <> attempt.id
      and (
        blocks_new_attempt
        or application_state = 'review'
        or state in (
          'approved',
          'refunded',
          'charged_back'
        )
      )
  ) then
    raise exception 'PAYMENT_ORDER_CONFLICT';
  end if;

  select jsonb_object_agg(entity_key, quantity)
  into wanted
  from (
    select
      coalesce(
        nullif(x->>'variant_id', ''),
        'product:' || (x->>'product_id')
      ) as entity_key,
      sum((x->>'quantity')::integer) as quantity
    from jsonb_array_elements(checkout.order_items) x
    group by 1
  ) expected;

  select jsonb_object_agg(entity_key, quantity)
  into held
  from public.serenity_checkout_stock_v2
  where checkout_id = checkout.id
    and state = 'active';

  if wanted is null
    or wanted is distinct from held
    or exists (
      select 1
      from public.serenity_checkout_stock_v2
      where checkout_id = checkout.id
        and state = 'active'
        and expires_at <= now()
    )
  then
    raise exception 'PAYMENT_RESERVATION_EXPIRED';
  end if;

  perform public.serenity_stock_assert(
    checkout.id,
    checkout.order_items
  );

  if checkout.discount_cents > 0 then
    select *
    into coupon_hold
    from public.serenity_checkout_coupon_v2
    where checkout_id = checkout.id
    for update;

    if not found
      or coupon_hold.state <> 'reserved'
      or coupon_hold.expires_at <= now()
      or coupon_hold.discount_cents
        is distinct from checkout.discount_cents
      or coupon_hold.coupon_snapshot
        is distinct from
          checkout.pricing_snapshot->'coupon'
    then
      raise exception 'COUPON_RESERVATION';
    end if;

    select *
    into coupon
    from public.serenity_coupons
    where id = coupon_hold.coupon_id
    for update;

    if not found then
      raise exception 'COUPON_UNAVAILABLE';
    end if;

    select *
    into capacity
    from public.serenity_coupon_capacity_v2(
      coupon.id,
      coupon_hold.customer_key,
      checkout.id
    );

    if coupon.max_uses is not null
      and capacity.global_uses >= coupon.max_uses
    then
      raise exception 'COUPON_LIMIT';
    end if;

    if coupon.max_uses_per_customer is not null
      and capacity.customer_uses >=
        coupon.max_uses_per_customer
    then
      raise exception 'COUPON_CUSTOMER_LIMIT';
    end if;
  end if;

  if checkout.account_user_id is not null then
    select a.customer_id
    into customer_id
    from public.serenity_customer_accounts a
    where a.user_id = checkout.account_user_id;

    if customer_id is null then
      raise exception 'CUSTOMER_ACCOUNT_UNAVAILABLE';
    end if;
  else
    customer_id := checkout.id;

    insert into public.serenity_customers (
      id,
      name,
      email,
      phone
    )
    values (
      customer_id,
      checkout.customer_snapshot->>'name',
      checkout.customer_snapshot->>'email',
      checkout.customer_snapshot->>'phone'
    );
  end if;

  for item in
    select value
    from jsonb_array_elements(checkout.order_items)
  loop
    select *
    into product
    from public.products
    where id = (item->>'product_id')::uuid;

    if not found then
      raise exception 'PRODUCT_UNAVAILABLE';
    end if;

    variant := null;

    if nullif(item->>'variant_id', '') is not null then
      select *
      into variant
      from public.product_variants
      where id = (item->>'variant_id')::uuid
        and product_id = product.id;

      if not found then
        raise exception 'VARIANT_UNAVAILABLE';
      end if;
    end if;

    qty := (item->>'quantity')::integer;
    unit := (item->>'unit_price')::numeric;
    fee := (item->>'fee')::numeric;

    if qty is null
      or qty <= 0
      or unit is null
      or fee is null
      or unit::text in (
        'NaN',
        'Infinity',
        '-Infinity'
      )
      or fee not in (0, 15)
      or unit < 0
      or unit <> round(unit, 2)
    then
      raise exception 'PAYMENT_AMOUNT_CHANGED';
    end if;

    color := coalesce(item->>'color', '');

    color_name := (
      '{
        "12":"Bronze Claro",
        "15":"Bronze Escuro",
        "18":"Berinjela",
        "20":"Roxo Escuro",
        "22":"Roxo",
        "25":"Azul Escuro",
        "28":"Azul",
        "30":"Azul Médio",
        "33":"Azul Céu",
        "36":"Azul Claro",
        "40":"Azul Gelo",
        "42":"Azul Prateado",
        "48":"Amarelo Pálido",
        "55":"Amarelo Claro",
        "61":"Amarelo",
        "64":"Dourado",
        "70":"Rose Gold",
        "72":"Rosa Claro",
        "75":"Rosa",
        "80":"Fúcsia",
        "85":"Fúcsia Escuro",
        "90":"Roxo Vibrante",
        "92":"Roxo Azulado",
        "95":"Roxo Petróleo",
        "103":"Verde Azulado",
        "105":"Verde"
      }'::jsonb
    )->>color;

    if (
      color = '' and fee <> 0
    ) or (
      color <> ''
      and (
        color_name is null
        or fee <> 15
      )
    ) then
      raise exception 'INVALID_ANODIZATION';
    end if;

    unit_cost := null;
    supplier := null;

    select
      c.unit_cost,
      c.supplier_name
    into unit_cost, supplier
    from public.serenity_product_commercial c
    where c.entity_key in (
      'product:' || product.id::text,
      'variant:' || variant.id::text
    )
    order by
      (
        c.variant_id is not null
        and c.unit_cost is not null
      ) desc,
      (c.unit_cost is not null) desc,
      (c.variant_id is not null) desc
    limit 1;

    if unit_cost is null then
      missing := missing + qty;
    elsif unit_cost::text in (
        'NaN',
        'Infinity',
        '-Infinity'
      )
      or unit_cost < 0
    then
      raise exception 'INVALID_COST';
    else
      costs := costs + unit_cost * qty;
    end if;

    subtotal := subtotal + (unit + fee) * qty;

    entries := entries || jsonb_build_array(
      jsonb_build_object(
        'product_id', product.id,
        'variant_id', variant.id,
        'name', coalesce(item->>'name', product.name),
        'variation', item->>'variation',
        'sku', coalesce(variant.sku, product.sku),
        'quantity', qty,
        'base_price', unit,
        'anodization', color_name,
        'voltage', nullif(color, ''),
        'anodization_fee', fee,
        'unit_price', unit + fee,
        'unit_cost', unit_cost,
        'supplier', supplier
      )
    );
  end loop;

  if subtotal * 100
    is distinct from checkout.subtotal_cents::numeric
  then
    raise exception 'PAYMENT_AMOUNT_CHANGED';
  end if;

  shipping_snapshot :=
    checkout.shipping_snapshot ||
    jsonb_build_object(
      'pricing_mode', checkout.pricing_mode,
      'payment', jsonb_build_object(
        'provider', 'mercado_pago',
        'attempt_id', attempt.id,
        'payment_id', attempt.provider_payment_id
      )
    );

  if checkout.pricing_mode = 'wholesale' then
    shipping_snapshot :=
      shipping_snapshot ||
      jsonb_build_object(
        'wholesale',
        checkout.pricing_snapshot->'wholesale' ||
        jsonb_build_object(
          'user_id', checkout.account_user_id
        )
      );
  end if;

  insert into public.serenity_orders (
    id,
    customer_id,
    customer_snapshot,
    items,
    subtotal,
    discount,
    shipping,
    expenses,
    total,
    cost,
    missing_costs,
    status,
    notes,
    created_by,
    paid_at,
    source,
    shipping_pending,
    delivery_address,
    checkout_fingerprint,
    shipping_details,
    account_user_id
  )
  values (
    checkout.id,
    customer_id,
    checkout.customer_snapshot,
    entries,
    subtotal,
    checkout.discount_cents / 100.0,
    checkout.shipping_cents / 100.0,
    0,
    checkout.total_cents / 100.0,
    case when missing = 0 then costs end,
    missing,
    'paid',
    'Pagamento confirmado pelo Mercado Pago.',
    null,
    now(),
    'site',
    false,
    checkout.delivery_address,
    checkout.fingerprint,
    shipping_snapshot,
    checkout.account_user_id
  );

  -- A função existente é idempotente, inclusive
  -- quando já foi chamada pelo trigger do pedido.
  perform public.serenity_stock_debit(
    checkout.id,
    null
  );

  if checkout.discount_cents > 0 then
    insert into public.serenity_coupon_redemptions (
      order_id,
      coupon_id,
      customer_key,
      state,
      discount_cents,
      coupon_snapshot,
      reserved_until
    )
    values (
      checkout.id,
      coupon_hold.coupon_id,
      coupon_hold.customer_key,
      'used',
      checkout.discount_cents,
      coupon_hold.coupon_snapshot,
      null
    );
  end if;

  update public.serenity_shipping_quotes
  set consumed_by = checkout.id
  where id = checkout.shipping_quote_id
    and request_id = checkout.id
    and consumed_by is null;

  if not found then
    raise exception 'SHIPPING_QUOTE_EXPIRED';
  end if;

  update public.serenity_checkout_stock_v2
  set state = 'converted'
  where checkout_id = checkout.id
    and state = 'active';

  update public.serenity_checkout_coupon_v2
  set state = 'converted'
  where checkout_id = checkout.id
    and state = 'reserved';

  update public.serenity_checkout_sessions_v2
  set
    state = 'converted',
    order_id = checkout.id,
    updated_at = now()
  where id = checkout.id;

  return checkout.id;
end;
$function$;
