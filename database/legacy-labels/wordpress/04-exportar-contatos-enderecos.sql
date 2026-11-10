-- Hostinger / phpMyAdmin do site antigo (MySQL). Exportar TODO o resultado como CSV.
-- Consulta de leitura: dados de endereço e metadados de contato, número e bairro.
select o.id as pedido_antigo,
       a.address_type as tipo_endereco,
       a.first_name as primeiro_nome,
       a.last_name as sobrenome,
       o.billing_email as email_pedido,
       a.email as email_endereco,
       a.phone as telefone,
       a.address_1 as endereco,
       a.address_2 as complemento,
       a.city as cidade,
       a.state as estado,
       a.postcode as cep,
       a.country as pais,
       coalesce((
         select json_arrayagg(json_object('campo',m.meta_key,'valor',m.meta_value))
         from wp_wc_orders_meta m
         where m.order_id=o.id
           and lower(m.meta_key) regexp '(billing|shipping).*(phone|cell|tel|number|numero|bairro|neigh|district|address|endereco|street|rua)'
       ),json_array()) as campos_adicionais
from wp_wc_orders o
join wp_wc_order_addresses a on a.order_id=o.id
where o.type='shop_order'
  and a.address_type in('billing','shipping')
order by o.id,a.address_type;
