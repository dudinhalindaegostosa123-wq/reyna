-- Executar na aba SQL do phpMyAdmin da Hostinger, não no Supabase.
-- Exportar o resultado completo como CSV. Não altera dados.
select i.order_id as pedido_antigo,
       i.order_item_id as item_antigo,
       m.meta_key as atributo,
       m.meta_value as valor
from wp_woocommerce_order_items i
join wp_woocommerce_order_itemmeta m on m.order_item_id=i.order_item_id
where i.order_item_type='line_item'
  and (
    left(m.meta_key,1)<>'_'
    or lower(m.meta_key) regexp 'attribute|comprimento|tamanho|espessura|diametro|diâmetro|length|haste|medida'
  )
order by i.order_id,i.order_item_id,m.meta_id;
