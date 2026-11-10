CREATE OR REPLACE FUNCTION public.serenity_wholesale_stock_review(p_user uuid, p_items jsonb, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  context jsonb;
  quote jsonb;
  products_cents bigint;
  previous_user text;
begin
  perform pg_advisory_xact_lock(7391542026);

  if p_user is null then
    raise exception 'WHOLESALE_UNAVAILABLE';
  end if;

  context := public.serenity_wholesale_context(p_user);

  if (context->>'active')::boolean is distinct from true then
    raise exception 'WHOLESALE_UNAVAILABLE';
  end if;

  previous_user := current_setting(
    'serenity.wholesale_user',
    true
  );

  perform set_config(
    'serenity.wholesale_user',
    p_user::text,
    true
  );

  quote := public.serenity_stock_review(
    p_items,
    p_request
  );

  perform set_config(
    'serenity.wholesale_user',
    coalesce(previous_user, ''),
    true
  );

  -- Soma somente os produtos após o desconto.
  -- Não inclui anodização nem frete.

  select coalesce(
    sum(
      round(
        (item->>'unit_price')::numeric * 100
      )::bigint
      * (item->>'quantity')::integer
    ),
    0
  )
  into products_cents
  from jsonb_array_elements(quote->'items') as rows(item);

  return quote || jsonb_build_object(
    'pricing_mode', 'wholesale',
    'wholesale',
    context || jsonb_build_object(
      'products_cents', products_cents,
      'minimum_met',
      products_cents >=
        (context->>'minimum_products_cents')::bigint
    ),
    'coupon', null,
    'discount_cents', 0,
    'subtotal_cents', (quote->>'total_cents')::bigint
  );
end;
$function$
