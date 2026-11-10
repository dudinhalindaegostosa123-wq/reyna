begin;

-- Busca apenas dados salvos no pedido. Não altera vendas ou produtos.
create or replace view public.serenity_admin_order_search_v1
with (security_invoker = true) as
select w.*,
  coalesce((
    select string_agg(concat_ws(' ', item->>'name', item->>'sku'), ' ')
    from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) item
  ), '') as jewelry_search
from public.serenity_admin_order_workflow w
join public.serenity_orders o on o.id = w.id;

revoke all on public.serenity_admin_order_search_v1
from public, anon, authenticated;
grant select on public.serenity_admin_order_search_v1 to service_role;

notify pgrst, 'reload schema';
commit;
