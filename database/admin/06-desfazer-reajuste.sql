begin;
-- Apply after 02-precos-por-material.sql and 03-precos-por-categoria.sql.
create table if not exists public.serenity_price_undos_v1 (
 kind text not null check(kind in ('material','category')),
 batch uuid not null, actor uuid not null, undone_at timestamptz not null default now(),
 primary key(kind,batch)
);
alter table public.serenity_price_undos_v1 enable row level security;
revoke all on public.serenity_price_undos_v1 from public,anon,authenticated;
grant all on public.serenity_price_undos_v1 to service_role;
create or replace function public.serenity_undo_prices_v1(p_kind text,p_batch uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; adjustment numeric; item jsonb; current_regular numeric; current_sale numeric; multiplier numeric;
begin
 if p_kind is null or p_kind not in ('material','category') or p_batch is null or p_actor is null then raise exception 'PRICE_UNDO_INPUT';end if;
 perform pg_advisory_xact_lock(7391542026);
 lock table public.products,public.product_variants in share row exclusive mode;
 if p_kind='material' then
  select backup,percent into snapshot,adjustment from public.serenity_material_price_batches_v1 where id=p_batch;
 else
  select backup,percent into snapshot,adjustment from public.serenity_category_price_batches_v1 where id=p_batch;
 end if;
 if snapshot is null then raise exception 'PRICE_UNDO_NOT_FOUND';end if;
 if exists(select 1 from public.serenity_price_undos_v1 where kind=p_kind and batch=p_batch) then
  return jsonb_build_object('count',jsonb_array_length(snapshot));
 end if;
 multiplier:=1+adjustment/100;
 -- Check every row before restoring anything, including NULL promotional prices.
 for item in select value from jsonb_array_elements(snapshot) loop
  if item->>'entity'='products' then
   select regular_price,sale_price into current_regular,current_sale from public.products where id=(item->>'id')::uuid;
  elsif item->>'entity'='product_variants' then
   select regular_price,sale_price into current_regular,current_sale from public.product_variants where id=(item->>'id')::uuid;
  else raise exception 'PRICE_UNDO_INPUT';end if;
  if not found or current_regular is distinct from round((item->>'regular_price')::numeric*multiplier,2)
   or current_sale is distinct from round((item->>'sale_price')::numeric*multiplier,2) then raise exception 'PRICE_UNDO_CHANGED';end if;
 end loop;
 update public.products p set regular_price=(x->>'regular_price')::numeric,sale_price=(x->>'sale_price')::numeric
 from jsonb_array_elements(snapshot) x where x->>'entity'='products' and p.id=(x->>'id')::uuid;
 update public.product_variants v set regular_price=(x->>'regular_price')::numeric,sale_price=(x->>'sale_price')::numeric
 from jsonb_array_elements(snapshot) x where x->>'entity'='product_variants' and v.id=(x->>'id')::uuid;
 insert into public.serenity_price_undos_v1(kind,batch,actor) values(p_kind,p_batch,p_actor);
 return jsonb_build_object('count',jsonb_array_length(snapshot));
end $$;
revoke all on function public.serenity_undo_prices_v1(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.serenity_undo_prices_v1(text,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
