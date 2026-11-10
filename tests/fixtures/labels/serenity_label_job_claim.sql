CREATE OR REPLACE FUNCTION public.serenity_label_job_claim(p_order uuid, p_operation uuid, p_selected text, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  j public.serenity_label_jobs%rowtype;
  o public.serenity_orders%rowtype;
  choice jsonb;
begin
  perform pg_advisory_xact_lock(7391542026);

  if p_actor is null then
    raise exception 'LABEL_INVALID';
  end if;

  select * into o
  from public.serenity_orders
  where id = p_order
  for share;

  if not found
    or o.status <> 'paid'
    or o.shipping_pending
  then
    raise exception 'LABEL_PAYMENT';
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

  if j.state <> 'quoted' then
    raise exception 'LABEL_JOB_LOCKED';
  end if;

  if j.quote_expires <= now() then
    raise exception 'LABEL_QUOTE_EXPIRED';
  end if;

  if o.updated_at is distinct from j.order_version
    or j.sender_version is distinct from (
      select version
      from public.serenity_label_sender
      where singleton
    )
    or j.draft_version is distinct from coalesce((
      select version
      from public.serenity_label_drafts
      where order_id = p_order
    ), 0)
    or j.settings_version is distinct from (
      select version
      from public.serenity_shipping_settings
      where singleton
    )
  then
    raise exception 'LABEL_STALE';
  end if;

  select q into choice
  from jsonb_array_elements(j.quotes) q
  where q ->> 'id' = p_selected
  limit 1;

  if choice is null then
    raise exception 'LABEL_INVALID';
  end if;

  update public.serenity_label_jobs
  set
    state = 'creating',
    selected = choice,
    updated_at = now(),
    actor = p_actor
  where order_id = p_order;

  insert into public.serenity_label_events (
    order_id, operation, state, actor
  )
  values (
    p_order, p_operation, 'creating', p_actor
  );

  return jsonb_build_object(
    'context', j.context,
    'selected', choice
  );
end
$function$
;
