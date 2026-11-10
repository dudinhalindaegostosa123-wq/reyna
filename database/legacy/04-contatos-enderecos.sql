begin;
select pg_advisory_xact_lock(7391542031);
-- Complemento privado para logística. Não altera pedidos, pagamentos ou etiquetas.
create table if not exists public.serenity_legacy_contacts_v1 (
  order_id bigint primary key references public.serenity_legacy_orders_v1(old_id),
  billing jsonb not null, shipping jsonb not null,
  imported_by uuid not null, imported_at timestamptz not null default now()
);
alter table public.serenity_legacy_contacts_v1 enable row level security;
revoke all on public.serenity_legacy_contacts_v1 from public,anon,authenticated;
grant all on public.serenity_legacy_contacts_v1 to service_role;
create or replace function public.serenity_legacy_import_contacts_v1(p_rows jsonb,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r jsonb; previous public.serenity_legacy_contacts_v1%rowtype; imported integer:=0; ignored integer:=0;
begin
 perform pg_advisory_xact_lock(7391542031);
 if p_actor is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 10000 then raise exception 'LEGACY_CONTACT_INVALID'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x group by x->>'order_id' having count(*)>1) then raise exception 'LEGACY_CONTACT_DUPLICATE'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if coalesce(r->>'order_id','') !~ '^[1-9][0-9]{0,14}$' or jsonb_typeof(r->'billing') is distinct from 'object' or jsonb_typeof(r->'shipping') is distinct from 'object' then raise exception 'LEGACY_CONTACT_INVALID'; end if;
  if exists(select 1 from jsonb_each((r->'billing')||(r->'shipping')) f where f.key not in('name','email','phone','cep','street','complement','city','state','number','district') or jsonb_typeof(f.value)<>'string' or length(f.value#>>'{}')>1000) then raise exception 'LEGACY_CONTACT_INVALID'; end if;
  if not exists(select 1 from public.serenity_legacy_orders_v1 where old_id=(r->>'order_id')::bigint and kind='shop_order' and visible) then ignored:=ignored+1; continue; end if;
  select * into previous from public.serenity_legacy_contacts_v1 where order_id=(r->>'order_id')::bigint;
  if found then
   if previous.billing is distinct from r->'billing' or previous.shipping is distinct from r->'shipping' then raise exception 'LEGACY_CONTACT_CONFLICT'; end if;
  else
   insert into public.serenity_legacy_contacts_v1(order_id,billing,shipping,imported_by) values((r->>'order_id')::bigint,r->'billing',r->'shipping',p_actor);
  end if;
  imported:=imported+1;
 end loop;
 return jsonb_build_object('imported',imported,'ignored',ignored);
end $$;
revoke all on function public.serenity_legacy_import_contacts_v1(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.serenity_legacy_import_contacts_v1(jsonb,uuid) to service_role;
commit;
