CREATE OR REPLACE FUNCTION public.serenity_guest_register_v1(p_checkout uuid, p_access_hash text, p_token_hash text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.serenity_checkout_sessions_v2%rowtype;
  existing public.serenity_guest_access_v1%rowtype;
  n bigint;
  recipient text;
  lines jsonb;
begin
  perform pg_advisory_xact_lock(7391542026);

  select *
  into c
  from public.serenity_checkout_sessions_v2
  where id = p_checkout
  for update;

  if not found
    or c.access_hash is distinct from p_access_hash
    or (
      c.account_user_id is null
      and c.pricing_mode <> 'retail'
    )
    or c.state not in (
      'pending',
      'payment_pending',
      'converted'
    )
    or c.access_expires_at <= now()
    or coalesce(p_token_hash, '') !~ '^[a-f0-9]{64}$'
  then
    raise exception 'CHECKOUT_ACCESS_INVALID';
  end if;

  select *
  into existing
  from public.serenity_guest_access_v1
  where checkout_id = c.id;

  if found then
    if existing.token_hash is distinct from p_token_hash
      or existing.revoked
    then
      raise exception 'GUEST_LINK_UNAVAILABLE';
    end if;

    return existing.number;
  end if;

  recipient := lower(trim(c.customer_snapshot->>'email'));

  if recipient is null
    or length(recipient) > 254
    or recipient !~
      '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
  then
    raise exception 'INVALID_EMAIL';
  end if;

  n := public.serenity_guest_next_number_v1();

  insert into public.serenity_guest_access_v1(
    checkout_id,
    number,
    token_hash,
    expires_at
  )
  values (
    c.id,
    n,
    p_token_hash,
    now() + interval '180 days'
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', i->>'name',
        'variation', i->>'variation',
        'quantity', i->'quantity',
        'unit_price',
          coalesce((i->>'unit_price')::numeric, 0)
          + coalesce((i->>'fee')::numeric, 0)
          + coalesce((i->>'sterilization_fee')::numeric, 0)
      )
    ),
    '[]'::jsonb
  )
  into lines
  from jsonb_array_elements(c.order_items) i;

  if c.environment = 'production' then
    insert into public.serenity_email_outbox_v1(
      checkout_id,
      kind,
      recipient,
      payload
    )
    values (
      c.id,
      'received',
      recipient,
      jsonb_build_object(
        'number', n,
        'name', c.customer_snapshot->>'name',
        'total', c.total_cents / 100.0,
        'items', lines,
        'guest_checkout', true
      )
    )
    on conflict (checkout_id, kind)
      where checkout_id is not null
    do nothing;
  end if;

  return n;
end
$function$;
