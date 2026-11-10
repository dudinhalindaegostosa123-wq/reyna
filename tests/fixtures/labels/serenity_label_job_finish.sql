CREATE OR REPLACE FUNCTION public.serenity_label_job_finish(p_order uuid, p_operation uuid, p_state text, p_remote uuid, p_price numeric, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  j public.serenity_label_jobs%rowtype;
begin
  perform pg_advisory_xact_lock(7391542026);

  if p_actor is null
    or p_state not in (
      'prepared', 'rejected', 'uncertain'
    )
  then
    raise exception 'LABEL_INVALID';
  end if;

  select * into j
  from public.serenity_label_jobs
  where order_id = p_order
  for update;

  if not found
    or j.operation is distinct from p_operation
  then
    raise exception 'LABEL_STALE';
  end if;

  if j.state = 'prepared'
    and p_state = 'prepared'
    and j.remote_id = p_remote
  then
    return;
  end if;

  if j.state not in ('creating', 'uncertain') then
    raise exception 'LABEL_JOB_LOCKED';
  end if;

  if p_state = 'prepared' and p_remote is null then
    raise exception 'LABEL_INVALID';
  end if;

  if p_price is not null
    and (p_price < 0 or p_price > 1000000)
  then
    raise exception 'LABEL_INVALID';
  end if;

  update public.serenity_label_jobs
  set
    state = p_state,
    remote_id = p_remote,
    remote_price = p_price,
    updated_at = now(),
    actor = p_actor
  where order_id = p_order;

  insert into public.serenity_label_events (
    order_id,
    operation,
    state,
    remote_id,
    actor
  )
  values (
    p_order,
    p_operation,
    p_state,
    p_remote,
    p_actor
  );
end
$function$
;
