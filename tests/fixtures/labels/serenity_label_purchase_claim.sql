CREATE OR REPLACE FUNCTION public.serenity_label_purchase_claim(p_order uuid, p_operation uuid, p_step text, p_review uuid, p_actor uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  p public.serenity_label_purchases%rowtype;
  j public.serenity_label_jobs%rowtype;
  o public.serenity_orders%rowtype;
  next_phase text;
begin
  perform pg_advisory_xact_lock(7391542026);

  if p_actor is null
    or p_step is null
    or p_step not in ('buy','generate')
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

  select * into j
  from public.serenity_label_jobs
  where order_id=p_order
  for share;

  if not found
    or j.state<>'prepared'
    or j.operation is distinct from p_operation
  then
    raise exception 'PURCHASE_LINK';
  end if;

  select * into p
  from public.serenity_label_purchases
  where order_id=p_order
  for update;

  if not found
    or p.operation is distinct from p_operation
    or p.remote_id is distinct from j.remote_id
  then
    raise exception 'PURCHASE_LINK';
  end if;

  if p_step='buy' then
    if p.phase<>'review' then
      raise exception 'PURCHASE_LOCKED';
    end if;

    if p.review_id is distinct from p_review
      or p_review is null
      or p.review_expires<=now()
      or p.order_version is distinct from o.updated_at
    then
      raise exception 'PURCHASE_STALE';
    end if;

    next_phase:='buying';
  else
    if p.phase<>'paid' then
      raise exception 'PURCHASE_LOCKED';
    end if;

    next_phase:='generating';
  end if;

  update public.serenity_label_purchases
  set
    phase=next_phase,
    note='',
    updated_at=now(),
    actor=p_actor
  where order_id=p_order;

  insert into public.serenity_label_purchase_events(
    order_id,phase,actor
  ) values(p_order,next_phase,p_actor);

  return p.remote_id;
end
$function$
;
