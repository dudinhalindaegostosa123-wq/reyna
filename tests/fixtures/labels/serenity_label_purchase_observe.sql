CREATE OR REPLACE FUNCTION public.serenity_label_purchase_observe(p_order uuid, p_operation uuid, p_remote uuid, p_status text, p_paid boolean, p_generated boolean, p_blocked boolean, p_cents bigint, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  j public.serenity_label_jobs%rowtype;
  p public.serenity_label_purchases%rowtype;
  next_phase text;
begin
  perform pg_advisory_xact_lock(7391542026);

  if p_actor is null
    or p_paid is null
    or p_generated is null
    or p_blocked is null
    or (p_generated and not p_paid)
    or p_status is null
    or length(p_status)>40
    or (
      p_cents is not null
      and p_cents not between 0 and 100000000
    )
  then
    raise exception 'PURCHASE_INVALID';
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
    p.operation is distinct from p_operation
    or p.remote_id is distinct from p_remote
  ) then
    raise exception 'PURCHASE_LINK';
  end if;

  next_phase:=case
    when p_blocked then 'blocked'
    when p_generated then 'ready'
    when p_paid then
      case
        when p.phase='ready' then 'ready'
        when p.phase='generating' then 'generating'
        else 'paid'
      end
    else coalesce(p.phase,'empty')
  end;

  insert into public.serenity_label_purchases(
    order_id,operation,remote_id,phase,carrier_status,
    paid_cents,paid_observed_at,generated_observed_at,actor
  )
  values(
    p_order,p_operation,p_remote,next_phase,p_status,
    case when p_paid then p_cents end,
    case when p_paid then now() end,
    case when p_generated then now() end,
    p_actor
  )
  on conflict(order_id) do update set
    phase=next_phase,
    carrier_status=p_status,
    paid_cents=coalesce(
      serenity_label_purchases.paid_cents,
      case when p_paid then p_cents end
    ),
    paid_observed_at=coalesce(
      serenity_label_purchases.paid_observed_at,
      case when p_paid then now() end
    ),
    generated_observed_at=coalesce(
      serenity_label_purchases.generated_observed_at,
      case when p_generated then now() end
    ),
    note=case
      when next_phase in ('paid','ready','blocked') then ''
      else serenity_label_purchases.note
    end,
    updated_at=now(),
    actor=p_actor;

  insert into public.serenity_label_purchase_events(
    order_id,phase,actor
  ) values(p_order,next_phase,p_actor);
end
$function$
;
