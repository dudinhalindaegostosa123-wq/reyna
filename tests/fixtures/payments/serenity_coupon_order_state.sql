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