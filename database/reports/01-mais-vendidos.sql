begin;
create or replace function public.serenity_bestsellers_v1(p_days integer default 30,p_offset integer default 0,p_limit integer default 50)
returns table(product_id text,name text,sku text,quantity bigint,orders bigint,total_products bigint)
language plpgsql security definer set search_path='' as $$
begin
 if p_days not in(0,7,30,90,365) or p_days is null or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'BESTSELLERS_INPUT';end if;
 return query with lines as (
  select o.id as order_id,i.value as item from public.serenity_orders o cross join lateral jsonb_array_elements(case when jsonb_typeof(o.items)='array' then o.items else '[]'::jsonb end) i
  where o.status='paid' and (p_days=0 or coalesce(o.paid_at,o.created_at)>=now()-make_interval(days=>p_days))
   and not exists(select 1 from public.serenity_checkout_payments_v2 pay where pay.checkout_id=o.id and (pay.environment='sandbox' or pay.refunded_cents>0))
 ), ranked as (
  select coalesce(p.id::text,nullif(l.item->>'product_id',''),'legacy:'||md5(coalesce(l.item->>'name','')||coalesce(l.item->>'sku',''))) as pid,
   max(coalesce(p.name,nullif(l.item->>'name',''),'Produto removido')) as title,max(coalesce(p.sku,l.item->>'sku','')) as reference,
   sum(case when l.item->>'quantity' ~ '^[0-9]{1,6}$' then (l.item->>'quantity')::bigint else 0 end)::bigint as units,count(distinct l.order_id)::bigint as purchases
  from lines l left join public.products p on p.id::text=l.item->>'product_id'
  group by 1
 ) select r.pid,r.title,r.reference,r.units,r.purchases,count(*) over() from ranked r where r.units>0
 order by r.units desc,r.purchases desc,r.title,r.pid offset p_offset limit p_limit;
end $$;
revoke all on function public.serenity_bestsellers_v1(integer,integer,integer) from public,anon,authenticated;
grant execute on function public.serenity_bestsellers_v1(integer,integer,integer) to service_role;
notify pgrst,'reload schema';
commit;
