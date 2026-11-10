-- Somente consulta. Não altera contatos, pagamentos ou pedidos.
-- A comparação por e-mail é uma pista para análise; não vincula registros automaticamente.
with pedido as (
 select id,number,status,lower(btrim(customer_snapshot->>'email')) email
 from public.serenity_orders where number=88
)
select p.number numero_pedido,p.status situacao_pedido,p.id pedido_id,
 c.id contato_id,c.created_at contato_criado_em,c.updated_at ultima_atividade,
 c.id=p.id contato_usa_mesmo_id_do_pedido,
 s.state estado_checkout_do_contato,s.order_id pedido_vinculado_ao_contato,
 outro.number numero_pedido_vinculado_ao_contato
from pedido p
left join public.serenity_checkout_contacts_v1 c on lower(btrim(c.email))=p.email
left join public.serenity_checkout_sessions_v2 s on s.id=c.id
left join public.serenity_orders outro on outro.id=s.order_id
order by c.updated_at desc nulls last;
