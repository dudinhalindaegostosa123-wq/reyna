-- Rotinas completas revisadas do snapshot de checkout existente; sem fixtures de dados.
begin;

create or replace function public.serenity_coupon_capacity_v2(
  p_coupon uuid,
  p_customer_key text,
  p_exclude uuid default null
)
returns table(global_uses bigint, customer_uses bigint)
language plpgsql
set search_path = ''
as $function$
begin
  perform pg_advisory_xact_lock(7391542026);

  return query
  select count(*), count(*) filter (where usage.customer_key = p_customer_key)
  from (
    select r.customer_key
    from public.serenity_coupon_redemptions r
    join public.serenity_orders o on o.id = r.order_id
    where r.coupon_id = p_coupon
      and r.order_id is distinct from p_exclude
      and (
        r.state = 'used'
        or (
          r.state = 'reserved'
          and (o.status = 'paid' or (o.status = 'pending' and r.reserved_until > now()))
        )
      )

    union all

    select r.customer_key
    from public.serenity_checkout_coupon_v2 r
    join public.serenity_checkout_sessions_v2 c on c.id = r.checkout_id
    where r.coupon_id = p_coupon
      and r.checkout_id is distinct from p_exclude
      and r.state = 'reserved'
      and r.expires_at > now()
      and c.expires_at > now()
      and c.state in ('pending', 'payment_pending')
  ) as usage;
end;
$function$;

revoke all on function public.serenity_coupon_capacity_v2(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.serenity_coupon_capacity_v2(uuid, text, uuid)
  to service_role;

do $migration$
declare
  source text;
  definition text;
  modified text;
  pattern text := $pattern$select[[:space:]]+count\(\*\),[[:space:]]+count\(\*\)[[:space:]]+filter[[:space:]]+\([[:space:]]+where[[:space:]]+r\.customer_key[[:space:]]+=[[:space:]]+p_customer_key[[:space:]]+\)[[:space:]]+into[[:space:]]+v_global_uses,[[:space:]]+v_customer_uses[[:space:]]+from[[:space:]]+public\.serenity_coupon_redemptions[[:space:]]+as[[:space:]]+r[[:space:]]+join[[:space:]]+public\.serenity_orders[[:space:]]+as[[:space:]]+o[[:space:]]+on[[:space:]]+o\.id[[:space:]]+=[[:space:]]+r\.order_id[[:space:]]+where[[:space:]]+r\.coupon_id[[:space:]]+=[[:space:]]+v_coupon\.id[[:space:]]+and[[:space:]]+\([[:space:]]+p_request[[:space:]]+is[[:space:]]+null[[:space:]]+or[[:space:]]+r\.order_id[[:space:]]+<>[[:space:]]+p_request[[:space:]]+\)[[:space:]]+and[[:space:]]+\([[:space:]]+r\.state[[:space:]]+=[[:space:]]+'used'[[:space:]]+or[[:space:]]+\([[:space:]]+r\.state[[:space:]]+=[[:space:]]+'reserved'[[:space:]]+and[[:space:]]+\([[:space:]]+o\.status[[:space:]]+=[[:space:]]+'paid'[[:space:]]+or[[:space:]]+\([[:space:]]+o\.status[[:space:]]+=[[:space:]]+'pending'[[:space:]]+and[[:space:]]+r\.reserved_until[[:space:]]+>[[:space:]]+now\(\)[[:space:]]+\)[[:space:]]+\)[[:space:]]+\)[[:space:]]+\);$pattern$;
begin
  select prosrc, pg_get_functiondef(oid)
  into source, definition
  from pg_proc
  where oid = 'public.serenity_checkout_coupon_quote(jsonb,text,text,uuid)'::regprocedure;

  if position('serenity_coupon_capacity_v2' in source) > 0 then
    return;
  end if;

  if md5(regexp_replace(source, '[[:space:]]', '', 'g')) <> '8f6c21879592445ec373e18582c89aa4' then
    raise exception 'A função de cupom mudou desde a conferência. Nenhuma alteração foi aplicada.';
  end if;

  modified := regexp_replace(definition, pattern,
    'select global_uses, customer_uses
     into v_global_uses, v_customer_uses
     from public.serenity_coupon_capacity_v2(v_coupon.id, p_customer_key, p_request);');

  if modified = definition or position('serenity_coupon_capacity_v2' in modified) = 0 then
    raise exception 'Não foi possível atualizar a conferência de limites do cupom.';
  end if;

  execute modified;
end;
$migration$;

create or replace function public.serenity_checkout_reserve_coupon_v2(
  p_checkout uuid,
  p_customer_key text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  checkout public.serenity_checkout_sessions_v2%rowtype;
  quote jsonb;
  code text;
  discount bigint;
begin
  perform pg_advisory_xact_lock(7391542026);

  if coalesce(p_customer_key, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'COUPON_INVALID';
  end if;

  select * into checkout
  from public.serenity_checkout_sessions_v2
  where id = p_checkout
  for update;

  if not found then
    raise exception 'CHECKOUT_SESSION_INVALID';
  end if;

  if checkout.state <> 'pending'
    or checkout.order_id is not null
    or exists(select 1 from public.serenity_orders where id = p_checkout)
    or exists(select 1 from public.serenity_checkout_payments_v2
      where checkout_id = p_checkout and blocks_new_attempt)
  then
    raise exception 'CHECKOUT_SESSION_NOT_RESERVABLE';
  end if;

  if checkout.expires_at <= now() + interval '1 minute' then
    raise exception 'CHECKOUT_RESERVATION_EXPIRED';
  end if;

  code := coalesce(checkout.pricing_snapshot->'coupon'->>'code', '');

  if checkout.pricing_mode = 'wholesale' then
    if code <> '' or checkout.discount_cents <> 0 then
      raise exception 'WHOLESALE_COUPON';
    end if;
  elsif code <> '' then
    quote := public.serenity_checkout_coupon_quote(
      checkout.cart_items, code, p_customer_key, checkout.id
    );

    if (quote->>'subtotal_cents')::bigint is distinct from checkout.subtotal_cents
      or (quote->>'discount_cents')::bigint is distinct from checkout.discount_cents
      or (quote->>'total_cents')::bigint + checkout.shipping_cents is distinct from checkout.total_cents
      or quote->'coupon' is distinct from checkout.pricing_snapshot->'coupon'
      or quote->'items' is distinct from checkout.pricing_snapshot->'items'
    then
      raise exception 'PRICE_CHANGED';
    end if;
  elsif checkout.discount_cents <> 0 then
    raise exception 'COUPON_INVALID';
  end if;

  discount := checkout.discount_cents;

  update public.serenity_checkout_coupon_v2
  set state = 'released'
  where checkout_id = checkout.id;

  if discount > 0 then
    insert into public.serenity_checkout_coupon_v2 (
      checkout_id, coupon_id, customer_key,
      discount_cents, coupon_snapshot, state, expires_at
    ) values (
      checkout.id, (quote->'coupon'->>'id')::uuid, p_customer_key,
      discount, quote->'coupon', 'reserved', checkout.expires_at
    )
    on conflict(checkout_id) do update set
      coupon_id = excluded.coupon_id,
      customer_key = excluded.customer_key,
      discount_cents = excluded.discount_cents,
      coupon_snapshot = excluded.coupon_snapshot,
      state = 'reserved',
      expires_at = excluded.expires_at;
  end if;

  return jsonb_build_object('discount_cents', discount);
end;
$function$;

revoke all on function public.serenity_checkout_reserve_coupon_v2(uuid, text)
  from public, anon, authenticated;
grant execute on function public.serenity_checkout_reserve_coupon_v2(uuid, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
