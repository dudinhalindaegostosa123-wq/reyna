begin;
create or replace view public.serenity_admin_label_center_v2 with(security_barrier=true) as
select c.*,'current'::text source_kind,null::bigint legacy_id,null::text legacy_intent from public.serenity_admin_label_center_v1 c
union all
select o.id,o.number,o.created_at,coalesce(nullif(o.customer_snapshot->>'name',''),'Cliente não informado'),o.shipping_pending,
  coalesce(o.shipping_details->>'company',''),coalesce(o.shipping_details->>'service',''),coalesce(j.state,'empty'),coalesce(p.phase,'empty'),
  case when j.state in('creating','uncertain') or p.phase in('buying','uncertain','blocked') then 'review'
    when o.intent='existing' and j.order_id is null then 'unverified'
    when p.phase in('paid','generating','ready') and p.carrier_status in('posted','delivered') then 'shipped'
    when p.phase in('paid','generating','ready') then 'purchased' else 'to_buy' end,
  'Conferir envio'::text,''::text,'Pedido do site antigo'::text,'legacy'::text,o.legacy_id,o.intent
from public.serenity_legacy_shipping_orders_v1 o
left join public.serenity_legacy_label_jobs_v1 j on j.order_id=o.id
left join public.serenity_legacy_label_purchases_v1 p on p.order_id=o.id
union all
select md5('serenity-legacy-label:'||h.old_id::text)::uuid,h.old_id,h.created_at,
  coalesce(nullif(concat_ws(' ',nullif(h.payload->>'primeiro_nome','NULL'),nullif(h.payload->>'sobrenome','NULL')),''),'Cliente não informado'),
  true,''::text,''::text,'empty'::text,'empty'::text,'unverified'::text,'Conferir etiqueta antiga'::text,''::text,'A importação não informa se a etiqueta já foi comprada.'::text,'legacy'::text,h.old_id,null::text
from public.serenity_legacy_orders_v1 h
where h.kind='shop_order' and h.visible and not h.needs_review and h.original_status in('wc-processing','wc-completed')
  and not exists(select 1 from public.serenity_legacy_shipping_orders_v1 where legacy_id=h.old_id)
  and not exists(select 1 from public.serenity_legacy_orders_v1 where parent_id=h.old_id and kind='shop_order_refund');
revoke all on public.serenity_admin_label_center_v2 from public,anon,authenticated;
grant select on public.serenity_admin_label_center_v2 to service_role;
notify pgrst,'reload schema';
commit;
