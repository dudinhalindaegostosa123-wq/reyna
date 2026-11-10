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
$function$
