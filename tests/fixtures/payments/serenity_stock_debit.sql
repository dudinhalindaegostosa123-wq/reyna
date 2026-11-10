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
$function$
