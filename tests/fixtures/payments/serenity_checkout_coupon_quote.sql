CREATE OR REPLACE FUNCTION public.serenity_checkout_coupon_quote(p_items jsonb, p_code text DEFAULT NULL::text, p_customer_key text DEFAULT NULL::text, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_quote jsonb;
  v_coupon public.serenity_coupons%rowtype;

  v_code text;
  v_item jsonb;

  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;

  v_regular numeric;
  v_quantity integer;

  v_current_cents bigint;
  v_regular_cents bigint;

  v_subtotal bigint := 0;
  v_eligible_current bigint := 0;
  v_eligible_regular bigint := 0;

  v_existing_discount bigint;
  v_nominal_discount bigint;
  v_extra_discount bigint;
  v_total bigint;

  v_global_uses bigint;
  v_customer_uses bigint;

  v_eligible boolean;
begin
  v_quote := public.serenity_stock_review(
    p_items,
    p_request
  );

  v_total := (v_quote->>'total_cents')::bigint;
  v_code := upper(trim(coalesce(p_code, '')));

  if v_code = '' then
    return v_quote || jsonb_build_object(
      'subtotal_cents', v_total,
      'discount_cents', 0,
      'coupon', null
    );
  end if;

  if
    v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'
    or (
      p_customer_key is not null
      and p_customer_key !~ '^[a-f0-9]{64}$'
    )
  then
    raise exception 'COUPON_INVALID';
  end if;

  select *
  into v_coupon
  from public.serenity_coupons
  where code = v_code
  for share;

  if not found or v_coupon.status <> 'active' then
    raise exception 'COUPON_UNAVAILABLE';
  end if;

  if
    v_coupon.starts_at is not null
    and v_coupon.starts_at > now()
  then
    raise exception 'COUPON_NOT_STARTED';
  end if;

  if
    v_coupon.ends_at is not null
    and v_coupon.ends_at <= now()
  then
    raise exception 'COUPON_EXPIRED';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(v_quote->'items')
  loop
    v_quantity := (v_item->>'quantity')::integer;

    v_current_cents :=
      round(
        (v_item->>'unit_price')::numeric * 100
      )::bigint * v_quantity;

    v_subtotal := v_subtotal + v_current_cents;

    v_eligible :=
      v_coupon.scope = 'all'
      or exists (
        select 1
        from public.serenity_coupon_products
        where coupon_id = v_coupon.id
          and product_id =
            (v_item->>'product_id')::uuid
      );

    if not v_eligible then
      continue;
    end if;

    select *
    into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid;

    if not found then
      raise exception 'PRODUCT_UNAVAILABLE';
    end if;

    if nullif(v_item->>'variant_id', '') is not null then
      select *
      into v_variant
      from public.product_variants
      where id = (v_item->>'variant_id')::uuid
        and product_id = v_product.id;

      if not found then
        raise exception 'VARIANT_UNAVAILABLE';
      end if;

      v_regular := v_variant.regular_price;
    else
      v_regular := v_product.regular_price;
    end if;

    if
      v_regular is null
      or v_regular < 0
      or v_regular::text in (
        'NaN',
        'Infinity',
        '-Infinity'
      )
    then
      raise exception 'PRICE_UNAVAILABLE';
    end if;

    v_regular_cents :=
      round(v_regular * 100)::bigint
      * v_quantity;

    v_eligible_regular :=
      v_eligible_regular + v_regular_cents;

    v_eligible_current :=
      v_eligible_current + v_current_cents;
  end loop;

  if
    v_subtotal <
    round(v_coupon.minimum_subtotal * 100)::bigint
  then
    raise exception 'COUPON_MINIMUM';
  end if;

  if v_eligible_regular <= 0 then
    raise exception 'COUPON_NO_PRODUCTS';
  end if;

  if v_coupon.discount_type = 'percent' then
    v_nominal_discount := round(
      v_eligible_regular
      * v_coupon.discount_value
      / 100
    )::bigint;
  else
    v_nominal_discount := round(
      v_coupon.discount_value * 100
    )::bigint;
  end if;

  v_nominal_discount := least(
    v_eligible_regular,
    v_nominal_discount
  );

  v_existing_discount := greatest(
    0,
    v_eligible_regular - v_eligible_current
  );

  v_extra_discount := least(
    v_eligible_current,
    greatest(
      0,
      v_nominal_discount - v_existing_discount
    )
  );

  if v_extra_discount > 0 then
    select
      count(*),
      count(*) filter (
        where r.customer_key = p_customer_key
      )
    into
      v_global_uses,
      v_customer_uses
    from public.serenity_coupon_redemptions as r
    join public.serenity_orders as o
      on o.id = r.order_id
    where r.coupon_id = v_coupon.id
      and (
        p_request is null
        or r.order_id <> p_request
      )
      and (
        r.state = 'used'
        or (
          r.state = 'reserved'
          and (
            o.status = 'paid'
            or (
              o.status = 'pending'
              and r.reserved_until > now()
            )
          )
        )
      );

    if
      v_coupon.max_uses is not null
      and v_global_uses >= v_coupon.max_uses
    then
      raise exception 'COUPON_LIMIT';
    end if;

    if
      p_customer_key is not null
      and v_coupon.max_uses_per_customer is not null
      and v_customer_uses >=
        v_coupon.max_uses_per_customer
    then
      raise exception 'COUPON_CUSTOMER_LIMIT';
    end if;
  end if;

  return v_quote || jsonb_build_object(
    'subtotal_cents', v_total,
    'discount_cents', v_extra_discount,
    'total_cents', v_total - v_extra_discount,
    'total', (v_total - v_extra_discount) / 100.0,
    'coupon', jsonb_build_object(
      'id', v_coupon.id,
      'code', v_coupon.code,
      'version', v_coupon.version,
      'applied', v_extra_discount > 0,
      'discount_cents', v_extra_discount,
      'nominal_discount_cents', v_nominal_discount,
      'existing_discount_cents', v_existing_discount,
      'customer_check_required',
        v_coupon.max_uses_per_customer is not null
        and p_customer_key is null
    )
  );
end;
$function$
