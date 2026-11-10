-- Somente leitura. Não inclui nomes, documentos, endereços ou segredos.
select p.provider_payment_id as mercado_pago,
 p.state as situacao_salva,p.application_state as processamento,
 p.last_error_code as erro,p.amount_cents/100.0 as valor,
 p.created_at,p.last_reconciled_at,
 c.state as checkout,c.order_id,
 o.number as pedido,o.status as situacao_pedido
from public.serenity_checkout_payments_v2 p
join public.serenity_checkout_sessions_v2 c on c.id=p.checkout_id
left join public.serenity_orders o on o.id=c.order_id
where p.environment='production'
 and p.created_at>=(date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
order by p.created_at desc;
