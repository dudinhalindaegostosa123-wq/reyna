CREATE OR REPLACE FUNCTION public.serenity_label_save_draft(p_order uuid, p_fields jsonb, p_version bigint, p_order_version timestamp with time zone, p_sender_version bigint, p_actor uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  o public.serenity_orders%rowtype;
  current_version bigint;
  result bigint;
begin
  perform pg_advisory_xact_lock(7391542026);

  if p_actor is null
    or p_order is null
    or jsonb_typeof(p_fields) is distinct from 'object'
    or octet_length(p_fields::text) > 20000
  then
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
    or p_sender_version is distinct from (
      select version
      from public.serenity_label_sender
      where singleton
    )
  then
    raise exception 'LABEL_STALE';
  end if;

  select version into current_version
  from public.serenity_label_drafts
  where order_id = p_order
  for update;

  if coalesce(current_version, 0) is distinct from p_version then
    raise exception 'LABEL_STALE';
  end if;

  insert into public.serenity_label_drafts(
    order_id,
    fields,
    version,
    order_version,
    sender_version,
    updated_by
  )
  values(
    p_order,
    p_fields,
    1,
    p_order_version,
    p_sender_version,
    p_actor
  )
  on conflict(order_id) do update
  set
    fields = excluded.fields,
    version = serenity_label_drafts.version + 1,
    order_version = excluded.order_version,
    sender_version = excluded.sender_version,
    updated_at = now(),
    updated_by = p_actor
  returning version into result;

  return result;
end
$function$
;
