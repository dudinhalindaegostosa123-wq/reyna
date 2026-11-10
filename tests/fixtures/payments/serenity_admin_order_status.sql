CREATE OR REPLACE FUNCTION public.serenity_admin_order_status(p_id uuid, p_expected text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  current_status text;
begin
  perform pg_advisory_xact_lock(7391542026); -- Serenity stock mutex v1

  select status
  into current_status
  from public.serenity_orders
  where id = p_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if current_status is distinct from p_expected then
    raise exception 'STALE_ORDER';
  end if;

  if not (
    (current_status = 'pending' and p_status in ('paid','cancelled'))
    or
    (current_status = 'paid' and p_status = 'refunded')
  ) then
    raise exception 'INVALID_STATUS';
  end if;

  update public.serenity_orders
  set
    status = p_status,
    updated_at = now(),
    paid_at = case
      when p_status = 'paid' then now()
      else paid_at
    end
  where id = p_id;
end
$function$;