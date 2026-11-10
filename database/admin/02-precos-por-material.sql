begin;
create table if not exists public.serenity_material_price_batches_v1 (
 id uuid primary key,actor uuid not null,material text not null,percent numeric not null,
 applied_at timestamptz not null default now(),backup jsonb not null,result jsonb not null
);
alter table public.serenity_material_price_batches_v1 enable row level security;
revoke all on public.serenity_material_price_batches_v1 from public,anon,authenticated;
grant all on public.serenity_material_price_batches_v1 to service_role;
create or replace function public.serenity_material_prices_v1(p_material text,p_percent numeric,p_actor uuid default null,p_batch uuid default null,p_expected text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; fingerprint text; result jsonb; previous public.serenity_material_price_batches_v1%rowtype; multiplier numeric;
begin
 if p_material is null or length(p_material)>180 or p_percent is null or p_percent=0 or p_percent< -90 or p_percent>500 or p_percent<>round(p_percent,2) then raise exception 'MATERIAL_PRICE_INPUT';end if;
 if p_batch is not null then
  if p_actor is null or p_expected is null then raise exception 'MATERIAL_PRICE_CONFIRM';end if;
  perform pg_advisory_xact_lock(7391542026);
  lock table public.products,public.product_variants in share row exclusive mode;
  select * into previous from public.serenity_material_price_batches_v1 where id=p_batch;
  if found then
   if previous.actor<>p_actor or previous.material<>p_material or previous.percent<>p_percent then raise exception 'MATERIAL_PRICE_BATCH';end if;
   return previous.result;
  end if;
 end if;
 multiplier:=1+p_percent/100;
 select coalesce(jsonb_agg(x order by x->>'entity',x->>'id'),'[]'::jsonb) into snapshot from (
  select jsonb_build_object('entity','products','id',p.id,'name',p.name,'regular_price',p.regular_price,'sale_price',p.sale_price) x
   from public.products p where p.material=p_material and p.status='published' and p.visibility<>'hidden'
    and p.product_type='simple' and public.serenity_commerce_jewel_v1(p.id) and p.regular_price>0
  union all
  select jsonb_build_object('entity','product_variants','id',v.id,'name',p.name||' — '||coalesce(v.name,''),'regular_price',v.regular_price,'sale_price',v.sale_price)
   from public.product_variants v join public.products p on p.id=v.product_id
   where p.material=p_material and p.status='published' and p.visibility<>'hidden' and p.product_type='variable'
    and public.serenity_commerce_jewel_v1(p.id) and v.enabled and v.regular_price>0
 ) source;
 if jsonb_array_length(snapshot)=0 then raise exception 'MATERIAL_PRICE_EMPTY';end if;
 if exists(select 1 from jsonb_array_elements(snapshot) x where round((x->>'regular_price')::numeric*multiplier,2)<=0) then raise exception 'MATERIAL_PRICE_ZERO';end if;
 fingerprint:=md5(snapshot::text||p_material||p_percent::text);
 result:=jsonb_build_object('material',p_material,'percent',p_percent,'fingerprint',fingerprint,'count',jsonb_array_length(snapshot),
 'examples',(select jsonb_agg(jsonb_build_object('name',x->>'name','before',x->'regular_price','after',round((x->>'regular_price')::numeric*multiplier,2))) from (select value x from jsonb_array_elements(snapshot) limit 5) examples));
 if p_batch is null then return result;end if;
 if p_expected<>fingerprint then raise exception 'MATERIAL_PRICE_STALE';end if;
 -- Snapshot is immutable audit evidence; requests are idempotent by batch UUID.
 update public.products p set regular_price=round(p.regular_price*multiplier,2),sale_price=case when p.sale_price is null then null else round(p.sale_price*multiplier,2) end
  where p.id in(select (x->>'id')::uuid from jsonb_array_elements(snapshot) x where x->>'entity'='products');
 update public.product_variants v set regular_price=round(v.regular_price*multiplier,2),sale_price=case when v.sale_price is null then null else round(v.sale_price*multiplier,2) end
  where v.id in(select (x->>'id')::uuid from jsonb_array_elements(snapshot) x where x->>'entity'='product_variants');
 insert into public.serenity_material_price_batches_v1(id,actor,material,percent,backup,result) values(p_batch,p_actor,p_material,p_percent,snapshot,result);
 return result;
end $$;
revoke all on function public.serenity_material_prices_v1(text,numeric,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.serenity_material_prices_v1(text,numeric,uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
