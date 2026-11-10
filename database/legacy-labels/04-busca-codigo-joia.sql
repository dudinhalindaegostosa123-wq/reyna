begin;
-- Pesquisa os itens preservados no pedido, inclusive códigos nos nomes antigos.
create or replace view public.serenity_admin_label_center_v3
with(security_barrier=true) as
select c.*,
  case when c.source_kind='current' then coalesce((
    select string_agg(concat_ws(' ',item->>'sku',item->>'name'),' ')
    from public.serenity_orders o
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(o.items)='array' then o.items else '[]'::jsonb end
    ) item
    where o.id=c.order_id
  ),'') else coalesce((
    select string_agg(concat_ws(' ',i.name,i.payload->>'sku',i.payload->>'codigo'),' ')
    from public.serenity_legacy_items_v1 i
    where i.order_id=c.legacy_id and i.kind='line_item'
  ),'') end as jewelry_search
from public.serenity_admin_label_center_v2 c;
revoke all on public.serenity_admin_label_center_v3 from public,anon,authenticated;
grant select on public.serenity_admin_label_center_v3 to service_role;
notify pgrst,'reload schema';
commit;
