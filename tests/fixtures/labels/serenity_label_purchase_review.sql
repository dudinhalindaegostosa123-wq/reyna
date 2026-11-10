CREATE OR REPLACE FUNCTION public.serenity_label_purchase_review(p_order uuid, p_operation uuid, p_remote uuid, p_review uuid, p_cents bigint, p_version timestamp with time zone, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  j public.serenity_label_jobs%rowtype;
  o public.serenity_orders%rowtype;
  p public.serenity_label_purchases%rowtype;
begin
  perform pg_advisory_xact_lock(7391542026);

  if p_actor is null
    or p_review is null
    or p_cents is null
    or p_cents not between 0 and 100000000
  then
    raise exception 'PURCHASE_INVALID';
  end if;

  select * into o
  from public.serenity_orders
  where id=p_order
  for share;

  if not found or o.status<>'paid' or o.shipping_pending then
    raise exception 'PURCHASE_ORDER';
  end if;

  if o.updated_at is distinct from p_version then
    raise exception 'PURCHASE_STALE';
  end if;

  select * into j
  from public.serenity_label_jobs
  where order_id=p_order
  for share;

  if not found
    or j.state<>'prepared'
    or j.operation is distinct from p_operation
    or j.remote_id is distinct from p_remote
  then
    raise exception 'PURCHASE_LINK';
  end if;

  select * into p
  from public.serenity_label_purchases
  where order_id=p_order
  for update;

  if found and (
    p.phase not in ('empty','review')
    or p.operation is distinct from p_operation
    or p.remote_id is distinct from p_remote
  ) then
    raise exception 'PURCHASE_LOCKED';
  end if;

  insert into public.serenity_label_purchases(
    order_id,operation,remote_id,phase,review_id,
    review_cents,review_expires,order_version,actor
  )
  values(
    p_order,p_operation,p_remote,'review',p_review,
    p_cents,now()+interval '5 minutes',p_version,p_actor
  )
  on conflict(order_id) do update set
    phase='review',
    review_id=p_review,
    review_cents=p_cents,
    review_expires=excluded.review_expires,
    order_version=p_version,
    note='',
    updated_at=now(),
    actor=p_actor;

  insert into public.serenity_label_purchase_events(
    order_id,phase,actor
  ) values(p_order,'review',p_actor);
end
$function$
;
