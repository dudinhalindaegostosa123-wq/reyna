CREATE OR REPLACE FUNCTION public.serenity_label_job_quote(p_order uuid, p_operation uuid, p_order_version timestamp with time zone, p_sender bigint, p_draft bigint, p_settings bigint, p_context jsonb, p_quotes jsonb, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  o public.serenity_orders%rowtype;
  j public.serenity_label_jobs%rowtype;
begin
  perform pg_advisory_xact_lock(7391542026);

  if p_actor is null
    or p_operation is null
    or jsonb_typeof(p_context) is distinct from 'object'
    or jsonb_typeof(p_quotes) is distinct from 'array'
  then
    raise exception 'LABEL_INVALID';
  end if;

  if jsonb_array_length(p_quotes) not between 1 and 50 then
    raise exception 'LABEL_INVALID';
  end if;

  select * into o
  from public.serenity_orders
  where id = p_order
  for share;

  if not found or o.status not in ('pending', 'paid') then
    raise exception 'LABEL_ORDER_STATUS';
  end if;

  if o.updated_at is distinct from p_order_version
    or p_sender is distinct from (
      select version
      from public.serenity_label_sender
      where singleton
    )
    or p_draft is distinct from coalesce((
      select version
      from public.serenity_label_drafts
      where order_id = p_order
    ), 0)
    or p_settings is distinct from (
      select version
      from public.serenity_shipping_settings
      where singleton
    )
  then
    raise exception 'LABEL_STALE';
  end if;

  select * into j
  from public.serenity_label_jobs
  where order_id = p_order
  for update;

  if found and j.state in (
    'creating', 'prepared', 'uncertain'
  ) then
    raise exception 'LABEL_JOB_LOCKED';
  end if;

  insert into public.serenity_label_jobs (
    order_id,
    operation,
    state,
    order_version,
    sender_version,
    draft_version,
    settings_version,
    context,
    quotes,
    quote_expires,
    actor
  )
  values (
    p_order,
    p_operation,
    'quoted',
    p_order_version,
    p_sender,
    p_draft,
    p_settings,
    p_context,
    p_quotes,
    now() + interval '15 minutes',
    p_actor
  )
  on conflict(order_id) do update set
    operation = excluded.operation,
    state = 'quoted',
    order_version = excluded.order_version,
    sender_version = excluded.sender_version,
    draft_version = excluded.draft_version,
    settings_version = excluded.settings_version,
    context = excluded.context,
    quotes = excluded.quotes,
    selected = null,
    remote_id = null,
    remote_price = null,
    quote_expires = excluded.quote_expires,
    updated_at = now(),
    actor = p_actor;

  insert into public.serenity_label_events (
    order_id, operation, state, actor
  )
  values (
    p_order, p_operation, 'quoted', p_actor
  );
end
$function$
;
