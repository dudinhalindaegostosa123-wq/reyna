CREATE OR REPLACE FUNCTION public.serenity_checkout_start_v2(p_id uuid, p_fingerprint text, p_access_hash text, p_environment text, p_user uuid, p_items jsonb, p_customer jsonb, p_address jsonb, p_expected bigint, p_cart_hash text, p_shipping uuid, p_coupon text, p_customer_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  existing public.serenity_checkout_sessions_v2%rowtype;
  delivery public.serenity_shipping_quotes%rowtype;
  context jsonb;
  quote jsonb;
  customer jsonb;
  address jsonb;
  mode text := 'retail';
  code text := upper(btrim(coalesce(p_coupon, '')));
  subtotal bigint;
  discount bigint;
  amount bigint;
  previous_user text;
  field text;
begin
  perform pg_advisory_xact_lock(7391542026);

  if p_id is null
    or p_shipping is null
    or coalesce(p_fingerprint, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_access_hash, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_cart_hash, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_customer_key, '') !~ '^[a-f0-9]{64}$'
    or p_environment is null
    or p_environment not in ('test', 'production')
    or p_expected is null
    or p_expected not between 1 and 9007199254740991
  then
    raise exception 'INVALID_REQUEST';
  end if;

  if jsonb_typeof(p_customer) is distinct from 'object'
    or jsonb_typeof(p_address) is distinct from 'object'
  then
    raise exception 'INVALID_CUSTOMER';
  end if;

  foreach field in array array[
    'name',
    'email',
    'phone',
    'document'
  ]
  loop
    if jsonb_typeof(p_customer->field)
        is distinct from 'string'
      or (p_customer->>field) ~ '[[:cntrl:]]'
    then
      raise exception 'INVALID_CUSTOMER';
    end if;
  end loop;

  foreach field in array array[
    'cep',
    'street',
    'number',
    'complement',
    'district',
    'city',
    'state'
  ]
  loop
    if jsonb_typeof(p_address->field)
        is distinct from 'string'
      or (p_address->>field) ~ '[[:cntrl:]]'
    then
      raise exception 'INVALID_CUSTOMER';
    end if;
  end loop;

  if length(btrim(p_customer->>'name'))
      not between 1 and 180
    or length(p_customer->>'email')
      not between 3 and 254
    or (p_customer->>'email')
      !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or (p_customer->>'phone')
      !~ '^[0-9]{10,11}$'
    or public.serenity_checkout_document_valid(
      p_customer->>'document'
    ) is distinct from true
    or (p_address->>'cep') !~ '^[0-9]{8}$'
    or (p_address->>'state') not in (
      'AC','AL','AP','AM','BA','CE','DF','ES','GO',
      'MA','MT','MS','MG','PA','PB','PR','PE','PI',
      'RJ','RN','RS','RO','RR','SC','SP','SE','TO'
    )
    or length(btrim(p_address->>'street'))
      not between 1 and 180
    or length(btrim(p_address->>'number'))
      not between 1 and 30
    or length(btrim(p_address->>'district'))
      not between 1 and 100
    or length(btrim(p_address->>'city'))
      not between 1 and 100
    or length(p_address->>'complement') > 180
  then
    raise exception 'INVALID_CUSTOMER';
  end if;

  customer := jsonb_build_object(
    'name', btrim(p_customer->>'name'),
    'email', lower(p_customer->>'email'),
    'phone', p_customer->>'phone',
    'document', p_customer->>'document'
  );

  address := jsonb_build_object(
    'cep', p_address->>'cep',
    'street', btrim(p_address->>'street'),
    'number', btrim(p_address->>'number'),
    'complement', btrim(p_address->>'complement'),
    'district', btrim(p_address->>'district'),
    'city', btrim(p_address->>'city'),
    'state', p_address->>'state'
  );

  select *
  into existing
  from public.serenity_checkout_sessions_v2
  where id = p_id
  for update;

  if found then
    if existing.fingerprint is distinct from p_fingerprint
      or existing.access_hash is distinct from p_access_hash
      or existing.environment is distinct from p_environment
      or existing.account_user_id is distinct from p_user
      or existing.cart_items is distinct from p_items
      or existing.customer_snapshot is distinct from customer
      or existing.delivery_address is distinct from address
      or existing.total_cents is distinct from p_expected
      or existing.shipping_quote_id is distinct from p_shipping
      or coalesce(
        existing.pricing_snapshot->'coupon'->>'code',
        ''
      ) is distinct from code
    then
      raise exception 'REQUEST_CHANGED';
    end if;

    return public.serenity_checkout_context_v2(
      p_id,
      p_access_hash
    );
  end if;

  if exists (
    select 1
    from public.serenity_orders
    where id = p_id
  ) then
    raise exception 'REQUEST_CHANGED';
  end if;

  if p_user is not null then
    if not exists (
      select 1
      from auth.users
      where id = p_user
        and email_confirmed_at is not null
    ) then
      raise exception 'CUSTOMER_ACCOUNT_UNAVAILABLE';
    end if;

    context := public.serenity_wholesale_context(p_user);

    if (context->>'active')::boolean is true then
      mode := 'wholesale';
    end if;
  end if;

  previous_user := current_setting(
    'serenity.wholesale_user',
    true
  );

  if mode = 'wholesale' then
    if code <> '' then
      raise exception 'WHOLESALE_COUPON';
    end if;

    quote := public.serenity_wholesale_stock_review_v2(
      p_user,
      p_items,
      p_id
    );

    if (quote->'wholesale'->>'minimum_met')::boolean
      is distinct from true
    then
      raise exception 'WHOLESALE_MINIMUM';
    end if;
  else
    perform set_config(
      'serenity.wholesale_user',
      '',
      true
    );

    quote := public.serenity_checkout_coupon_quote_v2(
      p_items,
      code,
      p_customer_key,
      p_id
    );
  end if;

  perform set_config(
    'serenity.wholesale_user',
    coalesce(previous_user, ''),
    true
  );

  subtotal := (quote->>'subtotal_cents')::bigint;
  discount := (quote->>'discount_cents')::bigint;

  select *
  into delivery
  from public.serenity_shipping_quotes
  where id = p_shipping
  for update;

  if not found
    or delivery.request_id is distinct from p_id
    or delivery.cart_hash is distinct from p_cart_hash
    or delivery.destination
      is distinct from address->>'cep'
    or delivery.expires_at <= now()
    or not isfinite(delivery.expires_at)
    or delivery.consumed_by is not null
    or delivery.settings_version is distinct from (
      select version
      from public.serenity_shipping_settings
      where singleton
    )
    or exists (
      select 1
      from public.serenity_checkout_sessions_v2
      where shipping_quote_id = p_shipping
    )
  then
    raise exception 'SHIPPING_QUOTE_EXPIRED';
  end if;

  if mode = 'wholesale' then
    if delivery.snapshot->>'pricing_mode'
        is distinct from 'wholesale'
      or delivery.snapshot->'wholesale'->>'user_id'
        is distinct from p_user::text
      or delivery.snapshot->'wholesale'->>'settings_version'
        is distinct from context->>'settings_version'
      or delivery.snapshot->'wholesale'->>'account_version'
        is distinct from context->>'account_version'
      or delivery.snapshot->'wholesale'->>'discount_percent'
        is distinct from context->>'discount_percent'
    then
      raise exception 'SHIPPING_QUOTE_EXPIRED';
    end if;
  elsif coalesce(
    delivery.snapshot->>'pricing_mode',
    'retail'
  ) <> 'retail' then
    raise exception 'SHIPPING_QUOTE_EXPIRED';
  end if;

  amount :=
    (quote->>'total_cents')::bigint
    + delivery.amount_cents;

  if subtotal is null
    or discount is null
    or amount is distinct from p_expected
    or delivery.subtotal_cents is distinct from subtotal
  then
    raise exception 'PRICE_CHANGED';
  end if;

  insert into public.serenity_checkout_sessions_v2 (
    id,
    fingerprint,
    access_hash,
    environment,
    account_user_id,
    pricing_mode,
    customer_snapshot,
    delivery_address,
    cart_items,
    order_items,
    pricing_snapshot,
    shipping_quote_id,
    shipping_snapshot,
    shipping_pending,
    subtotal_cents,
    discount_cents,
    shipping_cents,
    total_cents,
    expires_at,
    access_expires_at
  )
  values (
    p_id,
    p_fingerprint,
    p_access_hash,
    p_environment,
    p_user,
    mode,
    customer,
    address,
    p_items,
    quote->'items',
    quote,
    delivery.id,
    delivery.snapshot || jsonb_build_object(
      'manual', delivery.manual,
      'quote_id', delivery.id,
      'amount_cents', delivery.amount_cents,
      'quoted_at', delivery.created_at,
      'quote_expires_at', delivery.expires_at
    ),
    delivery.manual,
    subtotal,
    discount,
    delivery.amount_cents,
    amount,
    now() + interval '30 minutes',
    now() + interval '24 hours'
  );

  perform public.serenity_checkout_reserve_stock_v2(
    p_id
  );

  perform public.serenity_checkout_reserve_coupon_v2(
    p_id,
    p_customer_key
  );

  return public.serenity_checkout_context_v2(
    p_id,
    p_access_hash
  );
end;
$function$
;
