CREATE OR REPLACE FUNCTION public.serenity_stock_review(p_items jsonb, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform pg_advisory_xact_lock(7391542026);

  perform set_config(
    'serenity.stock_quote_order',
    coalesce(
      (
        select id::text
        from public.serenity_orders
        where id=p_request
          and source='site'
          and status='pending'
      ),
      ''
    ),
    true
  );

  return public.serenity_checkout_quote(p_items);
end
$function$
