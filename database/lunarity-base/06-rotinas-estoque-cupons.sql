-- Rotinas completas de estoque/cupons, sem dados nem implementações simuladas.

CREATE OR REPLACE FUNCTION public.serenity_stock_reserve(p_order uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  o public.serenity_orders%rowtype;
  row record;
  until_at timestamptz:=now()+interval '30 minutes';
  missing integer;
begin
  perform pg_advisory_xact_lock(7391542026);

  select *
  into o
  from public.serenity_orders
  where id=p_order
  for update;

  if not found or o.status<>'pending' then
    raise exception 'INVALID_STOCK_STATUS';
  end if;

  if o.stock_state='reserved' and o.stock_reserved_until>now() then
    return;
  end if;

  if o.stock_state in ('debited','returned') then
    raise exception 'INVALID_STOCK_STATUS';
  end if;

  perform public.serenity_stock_assert(o.id,o.items);

  for row in
    select
      (x->>'product_id')::uuid as product_id,
      nullif(x->>'variant_id','')::uuid as variant_id,
      sum((x->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(o.items) x
    group by 1,2
    order by 1,2
  loop
    insert into public.serenity_stock_reservations(
      order_id,entity_key,product_id,variant_id,
      quantity,expires_at,state
    )
    values(
      o.id,
      coalesce(row.variant_id::text,'product:'||row.product_id::text),
      row.product_id,
      row.variant_id,
      row.quantity,
      until_at,
      'active'
    )
    on conflict(order_id,entity_key)
    do update set
      quantity=excluded.quantity,
      expires_at=excluded.expires_at,
      state='active';
  end loop;

  select coalesce(sum((x->>'quantity')::integer),0)::integer
  into missing
  from jsonb_array_elements(o.items) x
  join public.products pp
    on pp.id::text=x->>'product_id'
  left join public.product_variants vv
    on vv.id::text=x->>'variant_id'
  where pp.stock_quantity is null
    and vv.stock_quantity is null;

  update public.serenity_orders
  set
    stock_state='reserved',
    stock_reserved_until=until_at,
    stock_untracked=missing,
    updated_at=now()
  where id=o.id;

  insert into public.serenity_stock_events(
    order_id,kind,changes,actor
  )
  values(
    o.id,
    'reserved',
    jsonb_build_object('until',until_at,'untracked',missing),
    p_actor
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.serenity_stock_debit(p_order uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  o public.serenity_orders%rowtype;
  row record;
  p public.products%rowtype;
  v public.product_variants%rowtype;
  movements jsonb:='[]'::jsonb;
  missing integer;
begin
  perform pg_advisory_xact_lock(7391542026);

  select *
  into o
  from public.serenity_orders
  where id=p_order
  for update;

  if not found or o.status<>'paid' then
    raise exception 'INVALID_STOCK_STATUS';
  end if;

  if o.stock_state='debited' then
    return;
  end if;

  if o.stock_state='returned' then
    raise exception 'INVALID_STOCK_STATUS';
  end if;

  perform public.serenity_stock_assert(o.id,o.items);

  update public.serenity_stock_reservations
  set state='consumed'
  where order_id=o.id and state='active';

  for row in
    select
      (x->>'product_id')::uuid as product_id,
      sum((x->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(o.items) x
    group by 1
    order by 1
  loop
    select *
    into p
    from public.products
    where id=row.product_id
    for update;

    if p.product_type<>'variable' and p.stock_quantity is not null then -- Serenity variant stock v2

      update public.products
      set
        stock_quantity=p.stock_quantity-row.quantity,
        stock_status=case
          when p.stock_quantity-row.quantity=0 then 'outofstock'
          else p.stock_status
        end
      where id=p.id;

      movements:=movements||jsonb_build_array(
        jsonb_build_object(
          'entity','product',
          'id',p.id,
          'name',p.name,
          'quantity',row.quantity,
          'before',p.stock_quantity,
          'after',p.stock_quantity-row.quantity
        )
      );
    end if;
  end loop;

  for row in
    select
      nullif(x->>'variant_id','')::uuid as variant_id,
      sum((x->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(o.items) x
    where nullif(x->>'variant_id','') is not null
    group by 1
    order by 1
  loop
    select *
    into v
    from public.product_variants
    where id=row.variant_id
    for update;

    if v.stock_quantity is not null then
      update public.product_variants
      set
        stock_quantity=v.stock_quantity-row.quantity,
        stock_status=case
          when v.stock_quantity-row.quantity=0 then 'outofstock'
          else v.stock_status
        end
      where id=v.id;

      movements:=movements||jsonb_build_array(
        jsonb_build_object(
          'entity','variant',
          'id',v.id,
          'name',v.name,
          'quantity',row.quantity,
          'before',v.stock_quantity,
          'after',v.stock_quantity-row.quantity
        )
      );
    end if;
  end loop;

  select coalesce(sum((x->>'quantity')::integer),0)::integer
  into missing
  from jsonb_array_elements(o.items) x
  join public.products pp
    on pp.id::text=x->>'product_id'
  left join public.product_variants vv
    on vv.id::text=x->>'variant_id'
  where pp.stock_quantity is null
    and vv.stock_quantity is null;

  update public.serenity_orders
  set
    stock_state='debited',
    stock_reserved_until=null,
    stock_untracked=missing,
    updated_at=now()
  where id=o.id;

  insert into public.serenity_stock_events(
    order_id,kind,changes,actor
  )
  values(o.id,'debited',movements,p_actor);
end
$function$;

CREATE OR REPLACE FUNCTION public.serenity_stock_release(p_order uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  o public.serenity_orders%rowtype;
begin
  perform pg_advisory_xact_lock(7391542026);

  select *
  into o
  from public.serenity_orders
  where id=p_order
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if o.stock_state in ('released','debited','returned') then
    return;
  end if;

  update public.serenity_stock_reservations
  set state='released'
  where order_id=o.id and state='active';

  update public.serenity_orders
  set
    stock_state='released',
    stock_reserved_until=null,
    updated_at=now()
  where id=o.id;

  insert into public.serenity_stock_events(order_id,kind,actor)
  values(o.id,'released',p_actor);
end
$function$;

CREATE OR REPLACE FUNCTION public.serenity_stock_order_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op='INSERT' then
    if new.status='pending' then
      perform public.serenity_stock_reserve(
        new.id,
        case
          when new.created_by=new.id and new.customer_id=new.id
          then null
          else new.created_by
        end
      );
    elsif new.status='paid' then
      perform public.serenity_stock_debit(new.id,new.created_by);
    end if;
  elsif new.status is distinct from old.status then
    if new.status='paid' then
      perform public.serenity_stock_debit(new.id,null);
    elsif new.status='cancelled' then
      perform public.serenity_stock_release(new.id,null);
    end if;
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.serenity_admin_order_status(p_id uuid, p_expected text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  current_status text;
begin
  perform pg_advisory_xact_lock(7391542026); -- Serenity stock mutex v1

  select status
  into current_status
  from public.serenity_orders
  where id = p_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if current_status is distinct from p_expected then
    raise exception 'STALE_ORDER';
  end if;

  if not (
    (current_status = 'pending' and p_status in ('paid','cancelled'))
    or
    (current_status = 'paid' and p_status = 'refunded')
  ) then
    raise exception 'INVALID_STATUS';
  end if;

  update public.serenity_orders
  set
    status = p_status,
    updated_at = now(),
    paid_at = case
      when p_status = 'paid' then now()
      else paid_at
    end
  where id = p_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.serenity_coupon_order_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_use public.serenity_coupon_redemptions%rowtype;
  v_coupon public.serenity_coupons%rowtype;
  v_global bigint;
  v_customer bigint;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  perform pg_advisory_xact_lock(7391542026);

  select *
  into v_use
  from public.serenity_coupon_redemptions
  where order_id = new.id
  for update;

  if not found then
    return new;
  end if;

  if
    new.status = 'cancelled'
    and v_use.state = 'reserved'
  then
    update public.serenity_coupon_redemptions
    set
      state = 'released',
      updated_at = now()
    where order_id = new.id;

    return new;
  end if;

  if new.status <> 'paid' or v_use.state = 'used' then
    return new;
  end if;

  select *
  into v_coupon
  from public.serenity_coupons
  where id = v_use.coupon_id
  for update;

  if not found then
    raise exception 'COUPON_UNAVAILABLE';
  end if;

  select
    count(*),

    count(*) filter (
      where r.customer_key = v_use.customer_key
    )

  into v_global, v_customer

  from public.serenity_coupon_redemptions as r

  join public.serenity_orders as o
    on o.id = r.order_id

  where
    r.coupon_id = v_use.coupon_id
    and r.order_id <> new.id

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
    and v_global >= v_coupon.max_uses
  then
    raise exception 'COUPON_LIMIT';
  end if;

  if
    v_coupon.max_uses_per_customer is not null
    and v_customer >= v_coupon.max_uses_per_customer
  then
    raise exception 'COUPON_CUSTOMER_LIMIT';
  end if;

  update public.serenity_coupon_redemptions
  set
    state = 'used',
    reserved_until = null,
    updated_at = now()
  where order_id = new.id;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.serenity_stock_review(p_items jsonb, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform pg_advisory_xact_lock(7391542026);

  perform set_config(
    'serenity.stock_quote_order',
    coalesce(
      (
        select id::text
        from public.serenity_orders
        where id=p_request
          and source='site'
          and status='pending'
      ),
      ''
    ),
    true
  );

  return public.serenity_checkout_quote(p_items);
end
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.serenity_wholesale_stock_review(p_user uuid, p_items jsonb, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  context jsonb;
  quote jsonb;
  products_cents bigint;
  previous_user text;
begin
  perform pg_advisory_xact_lock(7391542026);

  if p_user is null then
    raise exception 'WHOLESALE_UNAVAILABLE';
  end if;

  context := public.serenity_wholesale_context(p_user);

  if (context->>'active')::boolean is distinct from true then
    raise exception 'WHOLESALE_UNAVAILABLE';
  end if;

  previous_user := current_setting(
    'serenity.wholesale_user',
    true
  );

  perform set_config(
    'serenity.wholesale_user',
    p_user::text,
    true
  );

  quote := public.serenity_stock_review(
    p_items,
    p_request
  );

  perform set_config(
    'serenity.wholesale_user',
    coalesce(previous_user, ''),
    true
  );

  -- Soma somente os produtos após o desconto.
  -- Não inclui anodização nem frete.

  select coalesce(
    sum(
      round(
        (item->>'unit_price')::numeric * 100
      )::bigint
      * (item->>'quantity')::integer
    ),
    0
  )
  into products_cents
  from jsonb_array_elements(quote->'items') as rows(item);

  return quote || jsonb_build_object(
    'pricing_mode', 'wholesale',
    'wholesale',
    context || jsonb_build_object(
      'products_cents', products_cents,
      'minimum_met',
      products_cents >=
        (context->>'minimum_products_cents')::bigint
    ),
    'coupon', null,
    'discount_cents', 0,
    'subtotal_cents', (quote->>'total_cents')::bigint
  );
end;
$function$;