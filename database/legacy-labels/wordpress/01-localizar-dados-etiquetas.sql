-- Executar no phpMyAdmin do site antigo (MySQL), não no Supabase.
-- Somente nomes de tabelas/chaves e contagens; não altera dados.
select 'tabela' as origem, table_name as campo, null as quantidade
from information_schema.tables
where table_schema = database()
  and lower(table_name) regexp 'melhor|envio|shipment|tracking|rastre|label|etiqueta|frenet|correio|jadlog'
union all
select 'pedido_hpos', meta_key, count(*)
from wp_wc_orders_meta
where lower(meta_key) regexp 'melhor|envio|shipment|tracking|rastre|label|etiqueta|frenet|correio|jadlog|(^|_)me(_|$)|shipping.*(id|status|code|label)'
group by meta_key
union all
select 'item_pedido', meta_key, count(*)
from wp_woocommerce_order_itemmeta
where lower(meta_key) regexp 'melhor|envio|shipment|tracking|rastre|label|etiqueta|frenet|correio|jadlog|(^|_)me(_|$)|shipping.*(id|status|code|label)'
group by meta_key
union all
select 'pedido_wordpress', meta_key, count(*)
from wp_postmeta
where lower(meta_key) regexp 'melhor|envio|shipment|tracking|rastre|label|etiqueta|frenet|correio|jadlog|(^|_)me(_|$)|shipping.*(id|status|code|label)'
group by meta_key
order by origem, campo;
