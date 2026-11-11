-- Somente leitura: executar no SQL Editor do projeto Supabase da loja.
select signature as requisito,
  case when kind='table' then to_regclass(signature) is not null
    else to_regprocedure(signature) is not null end as instalado
from (values
 ('table','public.serenity_orders'),
 ('table','public.serenity_shipping_quotes'),
 ('table','public.serenity_checkout_sessions_v2'),
 ('table','public.serenity_checkout_payments_v2'),
 ('table','public.serenity_checkout_stock_v2'),
 ('table','public.serenity_checkout_coupon_v2'),
 ('function','public.serenity_checkout_limit(text,integer)'),
 ('function','public.serenity_checkout_start_v2(uuid,text,text,text,uuid,jsonb,jsonb,jsonb,bigint,text,uuid,text,text)'),
 ('function','public.serenity_checkout_context_v2(uuid,text)'),
 ('function','public.serenity_checkout_payment_ready_v3()'),
 ('function','public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text)'),
 ('function','public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)'),
 ('function','public.serenity_checkout_observe_payment_v2(uuid,jsonb,text)'),
 ('function','public.serenity_checkout_complete_order_v2(uuid)'),
 ('function','public.serenity_asaas_ready_v1()')
) as required(kind,signature);
