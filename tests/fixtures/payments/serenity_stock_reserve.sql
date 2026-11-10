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
$function$
