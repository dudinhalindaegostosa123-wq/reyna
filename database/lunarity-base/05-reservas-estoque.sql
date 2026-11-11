-- Rotinas completas revisadas do snapshot de checkout existente; sem fixtures de dados.
begin;

CREATE OR REPLACE FUNCTION public.serenity_stock_assert(p_order uuid, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  row record;
  p public.products%rowtype;
  v public.product_variants%rowtype;
  held bigint;
begin
  perform pg_advisory_xact_lock(7391542026);

  for row in
    select
      (x->>'product_id')::uuid as product_id,
      sum((x->>'quantity')::integer) as quantity
    from jsonb_array_elements(p_items) x
    group by 1
    order by 1
  loop
    select *
    into p
    from public.products
    where id=row.product_id
    for update;

    if not found or p.stock_status is distinct from 'instock' then
      raise exception 'STOCK_UNAVAILABLE';
    end if;

    select coalesce(sum(quantity),0)
    into held
    from public.serenity_stock_reservations
    where product_id=p.id
      and state='active'
      and expires_at>now()
      and order_id is distinct from p_order;

    select held + coalesce(sum(r.quantity), 0)
    into held
    from public.serenity_checkout_stock_v2 r
    join public.serenity_checkout_sessions_v2 c on c.id = r.checkout_id
    where r.product_id = p.id
      and r.state = 'active'
      and r.expires_at > now()
      and c.expires_at > now()
      and c.state in ('pending', 'payment_pending')
      and r.checkout_id is distinct from p_order;

    if p.stock_quantity is not null
      and row.quantity+held>p.stock_quantity
    then
      raise exception 'STOCK_RESERVED';
    end if;

    if p.sold_individually and row.quantity>1 then
      raise exception 'STOCK_UNAVAILABLE';
    end if;
  end loop;

  for row in
    select
      (x->>'product_id')::uuid as product_id,
      nullif(x->>'variant_id','')::uuid as variant_id,
      sum((x->>'quantity')::integer) as quantity
    from jsonb_array_elements(p_items) x
    group by 1,2
    order by 1,2
  loop
    select *
    into p
    from public.products
    where id=row.product_id;

    if row.variant_id is null then
      if p.product_type='variable' then
        raise exception 'VARIANT_REQUIRED';
      end if;
    else
      select *
      into v
      from public.product_variants
      where id=row.variant_id and product_id=p.id
      for update;

      if not found
        or v.enabled is distinct from true
        or v.stock_status is distinct from 'instock'
      then
        raise exception 'STOCK_UNAVAILABLE';
      end if;

      select coalesce(sum(quantity),0)
      into held
      from public.serenity_stock_reservations
      where variant_id=v.id
        and state='active'
        and expires_at>now()
        and order_id is distinct from p_order;

      select held + coalesce(sum(r.quantity), 0)
      into held
      from public.serenity_checkout_stock_v2 r
      join public.serenity_checkout_sessions_v2 c on c.id = r.checkout_id
      where r.variant_id = v.id
        and r.state = 'active'
        and r.expires_at > now()
        and c.expires_at > now()
        and c.state in ('pending', 'payment_pending')
        and r.checkout_id is distinct from p_order;

      if v.stock_quantity is not null
        and row.quantity+held>v.stock_quantity
      then
        raise exception 'STOCK_RESERVED';
      end if;
    end if;
  end loop;
end
$function$;

create or replace function public.serenity_checkout_reserve_stock_v2(p_checkout uuid)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  checkout public.serenity_checkout_sessions_v2%rowtype;
  item jsonb;
  line record;
  units bigint := 0;
begin
  perform pg_advisory_xact_lock(7391542026);

  select * into checkout
  from public.serenity_checkout_sessions_v2
  where id = p_checkout
  for update;

  if not found then
    raise exception 'CHECKOUT_SESSION_INVALID';
  end if;

  if checkout.state not in ('pending', 'payment_pending')
    or checkout.order_id is not null
    or exists(select 1 from public.serenity_orders where id = p_checkout)
  then
    raise exception 'CHECKOUT_SESSION_NOT_RESERVABLE';
  end if;

  if checkout.expires_at <= now() + interval '1 minute' then
    raise exception 'CHECKOUT_RESERVATION_EXPIRED';
  end if;

  if jsonb_array_length(checkout.order_items) not between 1 and 200 then
    raise exception 'INVALID_ITEMS';
  end if;

  for item in select value from jsonb_array_elements(checkout.order_items)
  loop
    if jsonb_typeof(item) is distinct from 'object'
      or coalesce(item->>'product_id', '') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or (coalesce(item->>'variant_id', '') <> '' and
        (item->>'variant_id') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
      or coalesce(item->>'quantity', '') !~ '^[1-9][0-9]{0,5}$'
    then
      raise exception 'INVALID_ITEMS';
    end if;
  end loop;

  perform public.serenity_stock_assert(checkout.id, checkout.order_items);

  update public.serenity_checkout_stock_v2
  set state = 'released'
  where checkout_id = checkout.id and state = 'active';

  for line in
    select
      (x->>'product_id')::uuid as product_id,
      nullif(x->>'variant_id', '')::uuid as variant_id,
      sum((x->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(checkout.order_items) x
    group by 1, 2
    order by 1, 2
  loop
    insert into public.serenity_checkout_stock_v2 (
      checkout_id, entity_key, product_id, variant_id,
      quantity, state, expires_at
    ) values (
      checkout.id,
      coalesce(line.variant_id::text, 'product:' || line.product_id::text),
      line.product_id, line.variant_id,
      line.quantity, 'active', checkout.expires_at
    )
    on conflict (checkout_id, entity_key)
    do update set
      quantity = excluded.quantity,
      state = 'active',
      expires_at = excluded.expires_at;

    units := units + line.quantity;
  end loop;

  return jsonb_build_object(
    'checkout_id', checkout.id,
    'reserved_until', checkout.expires_at,
    'units', units
  );
end;
$function$;

revoke all on function public.serenity_checkout_reserve_stock_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.serenity_checkout_reserve_stock_v2(uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;

select
  p.proname as funcao,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  pg_get_functiondef(p.oid) as definicao
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and p.proname in (
    'serenity_checkout_quote',
    'serenity_checkout_stock_review',
    'serenity_checkout_coupon_quote',
    'serenity_wholesale_stock_review'
  )
order by p.proname;
