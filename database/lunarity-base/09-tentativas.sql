-- Rotinas completas revisadas do snapshot de checkout existente; sem fixtures de dados.
begin;

-- Uma resposta incerta mantém a reserva até o prazo já concedido.
do $migration$
declare
  signature text;
  definition text;
  modified text;
  matches integer;
  expected integer;
  pattern text := $pattern$c[.]state[[:space:]]+in[[:space:]]*\('pending',[[:space:]]*'payment_pending'\)$pattern$;
begin
  for signature, expected in
    select * from (values
      ('public.serenity_stock_assert(uuid,jsonb)', 2),
      ('public.serenity_coupon_capacity_v2(uuid,text,uuid)', 1)
    ) as functions(signature, expected_matches)
  loop
    definition := pg_get_functiondef(signature::regprocedure);
    if position('c.state in (''pending'', ''payment_pending'', ''review'')' in definition) > 0 then
      continue;
    end if;
    select count(*) into matches from regexp_matches(definition, pattern, 'gi');
    if matches <> expected then
      raise exception 'A conferência de reservas mudou. Nenhuma alteração foi aplicada.';
    end if;
    modified := regexp_replace(definition, pattern,
      'c.state in (''pending'', ''payment_pending'', ''review'')', 'gi');
    execute modified;
  end loop;
end;
$migration$;

create or replace function public.serenity_checkout_claim_pix_v2(
  p_checkout uuid,
  p_access_hash text,
  p_attempt uuid,
  p_merchant text,
  p_request_hash text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  checkout public.serenity_checkout_sessions_v2%rowtype;
  attempt public.serenity_checkout_payments_v2%rowtype;
  coupon_hold public.serenity_checkout_coupon_v2%rowtype;
  coupon public.serenity_coupons%rowtype;
  capacity record;
  context jsonb;
  lease uuid;
  payment_expires timestamptz;
  reserve_expires timestamptz;
  snapshot jsonb;
begin
  perform pg_advisory_xact_lock(7391542026);
  perform public.serenity_checkout_context_v2(p_checkout, p_access_hash);

  if p_attempt is null
    or coalesce(p_merchant, '') !~ '^[0-9]{1,40}$'
    or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'PAYMENT_REQUEST_INVALID';
  end if;

  select * into checkout
  from public.serenity_checkout_sessions_v2
  where id = p_checkout for update;

  select * into attempt
  from public.serenity_checkout_payments_v2
  where id = p_attempt for update;

  if found then
    if attempt.checkout_id is distinct from checkout.id
      or attempt.environment is distinct from checkout.environment
      or attempt.merchant_id is distinct from p_merchant
      or attempt.method is distinct from 'pix'
      or attempt.request_hash is distinct from p_request_hash
      or attempt.amount_cents is distinct from checkout.total_cents then
      raise exception 'PAYMENT_REQUEST_CHANGED';
    end if;

    if attempt.state = 'submitting'
      and (attempt.lease_expires_at is null or attempt.lease_expires_at <= now()) then
      update public.serenity_checkout_payments_v2
      set state = 'uncertain', application_state = 'review',
        last_error_code = 'MP_SUBMISSION_UNCERTAIN',
        lease_id = null, lease_expires_at = null, updated_at = now()
      where id = attempt.id;
      update public.serenity_checkout_sessions_v2
      set state = 'review', updated_at = now()
      where id = checkout.id and state in ('pending', 'payment_pending');
      return jsonb_build_object('submit', false, 'state', 'uncertain');
    end if;

    if attempt.state <> 'created' then
      return jsonb_build_object('submit', false, 'state', attempt.state);
    end if;
    if not attempt.blocks_new_attempt or attempt.application_state <> 'pending' then
      raise exception 'PAYMENT_ATTEMPT_UNAVAILABLE';
    end if;
  end if;

  if checkout.state not in ('pending', 'payment_pending')
    or checkout.order_id is not null
    or checkout.shipping_pending
    or exists(select 1 from public.serenity_orders where id = checkout.id) then
    raise exception 'PAYMENT_CHECKOUT_UNAVAILABLE';
  end if;
  if checkout.expires_at <= now() + interval '1 minute' then
    raise exception 'PAYMENT_RESERVATION_EXPIRED';
  end if;
  if exists (
    select 1 from public.serenity_checkout_payments_v2
    where checkout_id = checkout.id and id <> p_attempt
      and (blocks_new_attempt or application_state = 'review'
        or state in ('approved', 'refunded', 'charged_back'))
  ) then
    raise exception 'PAYMENT_ALREADY_STARTED';
  end if;

  if checkout.pricing_mode = 'wholesale' then
    context := public.serenity_wholesale_context(checkout.account_user_id);
    if (context->>'active')::boolean is distinct from true
      or context->>'settings_version' is distinct from checkout.pricing_snapshot->'wholesale'->>'settings_version'
      or context->>'account_version' is distinct from checkout.pricing_snapshot->'wholesale'->>'account_version'
      or context->>'discount_percent' is distinct from checkout.pricing_snapshot->'wholesale'->>'discount_percent'
      or context->>'minimum_products_cents' is distinct from checkout.pricing_snapshot->'wholesale'->>'minimum_products_cents' then
      raise exception 'WHOLESALE_UNAVAILABLE';
    end if;
  end if;

  select * into coupon_hold
  from public.serenity_checkout_coupon_v2
  where checkout_id = checkout.id for update;

  if checkout.discount_cents > 0 then
    if coupon_hold.checkout_id is null or coupon_hold.state <> 'reserved'
      or coupon_hold.expires_at <= now()
      or coupon_hold.discount_cents is distinct from checkout.discount_cents
      or coupon_hold.coupon_snapshot is distinct from checkout.pricing_snapshot->'coupon' then
      raise exception 'COUPON_RESERVATION';
    end if;

    select * into coupon from public.serenity_coupons
    where id = coupon_hold.coupon_id for update;
    if not found or coupon.status <> 'active'
      or (coupon.starts_at is not null and coupon.starts_at > now())
      or (coupon.ends_at is not null and coupon.ends_at <= now()) then
      raise exception 'COUPON_UNAVAILABLE';
    end if;

    select * into capacity from public.serenity_coupon_capacity_v2(
      coupon.id, coupon_hold.customer_key, checkout.id);
    if coupon.max_uses is not null and capacity.global_uses >= coupon.max_uses then
      raise exception 'COUPON_LIMIT';
    end if;
    if coupon.max_uses_per_customer is not null
      and capacity.customer_uses >= coupon.max_uses_per_customer then
      raise exception 'COUPON_CUSTOMER_LIMIT';
    end if;
  end if;

  if attempt.id is null then
    payment_expires := now() + interval '32 minutes';
    reserve_expires := least(
      greatest(checkout.expires_at, now() + interval '35 minutes'),
      checkout.created_at + interval '60 minutes');
    if reserve_expires <= payment_expires + interval '1 minute' then
      raise exception 'PAYMENT_RESERVATION_EXPIRED';
    end if;
  else
    payment_expires := attempt.expires_at;
    reserve_expires := checkout.expires_at;
    if payment_expires is null or payment_expires <= now() + interval '1 minute'
      or reserve_expires <= payment_expires + interval '1 minute' then
      raise exception 'PAYMENT_RESERVATION_EXPIRED';
    end if;
  end if;

  perform public.serenity_checkout_reserve_stock_v2(checkout.id);

  update public.serenity_checkout_sessions_v2
  set state = 'payment_pending', expires_at = reserve_expires, updated_at = now()
  where id = checkout.id;
  update public.serenity_checkout_stock_v2
  set expires_at = reserve_expires
  where checkout_id = checkout.id and state = 'active';
  update public.serenity_checkout_coupon_v2
  set expires_at = reserve_expires
  where checkout_id = checkout.id and state = 'reserved';

  lease := gen_random_uuid();
  if attempt.id is null then
    insert into public.serenity_checkout_payments_v2 (
      id, checkout_id, environment, merchant_id, method,
      request_hash, amount_cents, state, expires_at,
      lease_id, lease_expires_at
    ) values (
      p_attempt, checkout.id, checkout.environment, p_merchant, 'pix',
      p_request_hash, checkout.total_cents, 'submitting', payment_expires,
      lease, now() + interval '45 seconds'
    );
  else
    update public.serenity_checkout_payments_v2
    set state = 'submitting', lease_id = lease,
      lease_expires_at = now() + interval '45 seconds', updated_at = now()
    where id = attempt.id;
  end if;

  snapshot := jsonb_build_object('state', 'submitting', 'expires_at', payment_expires);
  insert into public.serenity_checkout_payment_events_v2 (
    attempt_id, source, event_key, snapshot
  ) values (
    p_attempt, 'create', encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex'), snapshot
  ) on conflict(attempt_id, event_key) do nothing;

  -- Contém dados do pagador. Usar somente no servidor.
  return jsonb_build_object(
    'submit', true, 'state', 'submitting', 'lease_id', lease,
    'checkout_id', checkout.id, 'attempt_id', p_attempt,
    'environment', checkout.environment, 'merchant_id', p_merchant,
    'amount_cents', checkout.total_cents, 'currency', 'BRL', 'method', 'pix',
    'expires_at', payment_expires, 'reserved_until', reserve_expires,
    'customer', checkout.customer_snapshot
  );
end;
$function$;

create or replace function public.serenity_checkout_pix_uncertain_v2(
  p_attempt uuid, p_lease uuid, p_request_hash text, p_code text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  attempt public.serenity_checkout_payments_v2%rowtype;
  snapshot jsonb;
begin
  perform pg_advisory_xact_lock(7391542026);
  if p_attempt is null or p_lease is null
    or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_code, '') !~ '^MP_[A-Z0-9_]{1,70}$' then
    raise exception 'PAYMENT_REQUEST_INVALID';
  end if;
  select * into attempt from public.serenity_checkout_payments_v2
  where id = p_attempt for update;
  if not found or attempt.request_hash is distinct from p_request_hash then
    raise exception 'PAYMENT_REQUEST_CHANGED';
  end if;
  if attempt.state <> 'submitting' then
    return jsonb_build_object('state', attempt.state);
  end if;
  if attempt.lease_id is distinct from p_lease
    or attempt.provider_payment_id is not null then
    raise exception 'PAYMENT_LEASE_INVALID';
  end if;

  update public.serenity_checkout_payments_v2
  set state = 'uncertain', blocks_new_attempt = true, application_state = 'review',
    last_error_code = p_code, lease_id = null, lease_expires_at = null, updated_at = now()
  where id = attempt.id;
  update public.serenity_checkout_sessions_v2
  set state = 'review', updated_at = now()
  where id = attempt.checkout_id and state in ('pending', 'payment_pending');

  snapshot := jsonb_build_object('state', 'uncertain', 'error_code', p_code);
  insert into public.serenity_checkout_payment_events_v2 (
    attempt_id, source, event_key, snapshot
  ) values (
    attempt.id, 'create', encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex'), snapshot
  ) on conflict(attempt_id, event_key) do nothing;
  return jsonb_build_object('state', 'uncertain');
end;
$function$;

revoke all on function public.serenity_checkout_claim_pix_v2(uuid, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.serenity_checkout_pix_uncertain_v2(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.serenity_checkout_claim_pix_v2(uuid, text, uuid, text, text)
  to service_role;
grant execute on function public.serenity_checkout_pix_uncertain_v2(uuid, uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
