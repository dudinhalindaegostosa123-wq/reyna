begin;
select pg_advisory_xact_lock(7391542031);

-- Histórico isolado: não escreve em orders, checkout, estoque, cupons ou notificações.
create table if not exists public.serenity_legacy_imports_v1 (
  id text primary key, fingerprint text not null, summary jsonb not null,
  imported_at timestamptz not null default now()
);
create table if not exists public.serenity_legacy_customers_v1 (
  old_id bigint primary key, email text not null unique,
  name text not null, phone text not null default '', profile jsonb not null
);
create table if not exists public.serenity_legacy_owners_v1 (
  email text primary key, user_id uuid not null, linked_at timestamptz not null default now()
);
create table if not exists public.serenity_legacy_orders_v1 (
  old_id bigint primary key, parent_id bigint, kind text not null,
  original_status text not null, created_at timestamptz not null,
  total numeric not null, currency text not null, payload jsonb not null,
  owner_email text, account_user_id uuid,
  needs_review boolean not null default false, visible boolean not null default false
);
create table if not exists public.serenity_legacy_items_v1 (
  old_id bigint primary key, order_id bigint not null references public.serenity_legacy_orders_v1(old_id),
  kind text not null, name text not null, payload jsonb not null
);
create index if not exists serenity_legacy_owner_v1 on public.serenity_legacy_orders_v1(account_user_id,created_at desc,old_id desc);
create index if not exists serenity_legacy_owner_email_v1 on public.serenity_legacy_orders_v1(owner_email) where account_user_id is null;
create index if not exists serenity_legacy_items_order_v1 on public.serenity_legacy_items_v1(order_id,old_id);

do $$ declare name text; begin
  foreach name in array array['imports','customers','owners','orders','items'] loop
    execute format('alter table public.serenity_legacy_%s_v1 enable row level security',name);
    execute format('revoke all on public.serenity_legacy_%s_v1 from anon, authenticated',name);
    execute format('grant all on public.serenity_legacy_%s_v1 to service_role',name);
  end loop;
end $$;
grant select on public.serenity_legacy_orders_v1,public.serenity_legacy_items_v1 to authenticated;
drop policy if exists serenity_legacy_owned_orders_v1 on public.serenity_legacy_orders_v1;
create policy serenity_legacy_owned_orders_v1 on public.serenity_legacy_orders_v1 for select to authenticated
using (account_user_id=(select auth.uid()) and not needs_review and visible and kind='shop_order');
drop policy if exists serenity_legacy_owned_items_v1 on public.serenity_legacy_items_v1;
create policy serenity_legacy_owned_items_v1 on public.serenity_legacy_items_v1 for select to authenticated
using (exists(select 1 from public.serenity_legacy_orders_v1 o where o.old_id=order_id and o.account_user_id=(select auth.uid()) and not o.needs_review and o.visible and o.kind='shop_order'));

create or replace function public.serenity_legacy_import_v1(p_bundle jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare previous public.serenity_legacy_imports_v1%rowtype; result jsonb; fingerprint text:=md5(p_bundle::text);
begin
  perform pg_advisory_xact_lock(7391542031);
  if p_bundle->>'source' is distinct from 'serenity-woocommerce-hpos-v1'
    or jsonb_typeof(p_bundle->'customers') is distinct from 'array'
    or jsonb_typeof(p_bundle->'orders') is distinct from 'array'
    or jsonb_typeof(p_bundle->'items') is distinct from 'array'
    or jsonb_array_length(p_bundle->'customers')>10000 or jsonb_array_length(p_bundle->'orders')>20000 or jsonb_array_length(p_bundle->'items')>100000
  then raise exception 'LEGACY_BUNDLE_INVALID'; end if;
  select * into previous from public.serenity_legacy_imports_v1 where id=p_bundle->>'source';
  if found then
    if previous.fingerprint is distinct from fingerprint then raise exception 'LEGACY_IMPORT_DIFFERENT_DATA'; end if;
    return previous.summary || jsonb_build_object('already_imported',true);
  end if;
  insert into public.serenity_legacy_customers_v1(old_id,email,name,phone,profile)
  select (r->>'old_id')::bigint,lower(trim(r->>'email')),r->>'name',coalesce(r->>'phone',''),r->'profile'
  from jsonb_array_elements(p_bundle->'customers') r;
  if exists(select 1 from public.serenity_legacy_customers_v1 where old_id<=0 or length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or profile->>'perfil_antigo' like '%"administrator"%' or profile->>'perfil_antigo' like '%"shop_manager"%') then raise exception 'LEGACY_CUSTOMER_INVALID'; end if;
  insert into public.serenity_legacy_orders_v1(old_id,parent_id,kind,original_status,created_at,total,currency,payload,owner_email,needs_review,visible)
  select (r->>'old_id')::bigint,(r->>'parent_id')::bigint,r->>'kind',r->>'status',(r->>'created_at')::timestamptz,(r->>'total')::numeric,r->>'currency',r->'payload',nullif(lower(trim(r->>'owner_email')),''),(r->>'needs_review')::boolean,(r->>'visible')::boolean
  from jsonb_array_elements(p_bundle->'orders') r;
  if exists(select 1 from public.serenity_legacy_orders_v1 o where old_id<=0 or kind not in ('shop_order','shop_order_refund') or total::text in ('NaN','Infinity','-Infinity') or currency<>'BRL' or (needs_review and owner_email is not null) or (kind='shop_order_refund' and not exists(select 1 from public.serenity_legacy_orders_v1 p where p.old_id=o.parent_id and p.kind='shop_order'))) then raise exception 'LEGACY_ORDER_INVALID'; end if;
  insert into public.serenity_legacy_items_v1(old_id,order_id,kind,name,payload)
  select (r->>'old_id')::bigint,(r->>'order_id')::bigint,r->>'kind',r->>'name',r->'payload'
  from jsonb_array_elements(p_bundle->'items') r;
  if exists(select 1 from public.serenity_legacy_items_v1 where old_id<=0 or kind not in ('line_item','shipping','coupon','fee','tax')) then raise exception 'LEGACY_ITEM_INVALID'; end if;
  -- Exibe os estornos junto ao pedido original, sem liberar registros de outras contas.
  update public.serenity_legacy_orders_v1 o set payload=jsonb_set(o.payload,'{refunds}',coalesce((
    select jsonb_agg(jsonb_build_object('old_id',r.old_id,'total',r.total,'status',r.original_status) order by r.old_id)
    from public.serenity_legacy_orders_v1 r where r.parent_id=o.old_id and r.kind='shop_order_refund'
  ),'[]'::jsonb)) where o.kind='shop_order';
  result:=jsonb_build_object('customers',(select count(*) from public.serenity_legacy_customers_v1),'orders',(select count(*) from public.serenity_legacy_orders_v1 where visible and kind='shop_order'),'refunds',(select count(*) from public.serenity_legacy_orders_v1 where kind='shop_order_refund'),'items',(select count(*) from public.serenity_legacy_items_v1),'needs_review',(select count(*) from public.serenity_legacy_orders_v1 where visible and needs_review),'already_imported',false);
  if (result->>'customers')::int is distinct from jsonb_array_length(p_bundle->'customers')
    or (select count(*) from public.serenity_legacy_orders_v1) is distinct from jsonb_array_length(p_bundle->'orders')::bigint
    or (result->>'items')::int is distinct from jsonb_array_length(p_bundle->'items') then raise exception 'LEGACY_IMPORT_COUNT'; end if;
  insert into public.serenity_legacy_imports_v1(id,fingerprint,summary) values(p_bundle->>'source',fingerprint,result);
  return result;
end $$;

create or replace function public.serenity_legacy_link_my_history_v1()
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare identity uuid:=auth.uid(); v_email text; linked integer;
begin
  if identity is null then raise exception 'LEGACY_AUTH_REQUIRED'; end if;
  select lower(trim(u.email)) into v_email from auth.users u where u.id=identity and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'LEGACY_EMAIL_REQUIRED'; end if;
  -- Vínculo permanente: trocar o e-mail não transfere o histórico para outra conta.
  perform pg_advisory_xact_lock(7391542031);
  if not exists(select 1 from public.serenity_legacy_orders_v1 o where o.owner_email=v_email and not o.needs_review and o.visible) then return 0; end if;
  insert into public.serenity_legacy_owners_v1(email,user_id) values(v_email,identity) on conflict do nothing;
  if not exists(select 1 from public.serenity_legacy_owners_v1 l where l.email=v_email and l.user_id=identity) then return 0; end if;
  update public.serenity_legacy_orders_v1 o set account_user_id=identity where o.owner_email=v_email and o.account_user_id is null and not o.needs_review;
  get diagnostics linked=row_count;
  return linked;
end $$;

create or replace function public.serenity_legacy_account_context_v1()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare identity uuid:=auth.uid(); v_email text; contact public.serenity_legacy_customers_v1%rowtype;
begin
  if identity is null then return jsonb_build_object('eligible',false); end if;
  select lower(trim(u.email)) into v_email from auth.users u where u.id=identity and u.email_confirmed_at is not null;
  if v_email is null then return jsonb_build_object('eligible',false); end if;
  select * into contact from public.serenity_legacy_customers_v1 c where c.email=v_email;
  if not found or exists(select 1 from public.serenity_legacy_owners_v1 l where l.email=v_email and l.user_id<>identity) then return jsonb_build_object('eligible',false); end if;
  return jsonb_build_object('eligible',true,'name',contact.name,'phone',contact.phone,'needs_profile',not exists(select 1 from public.serenity_customer_accounts a where a.user_id=identity and a.customer_id is not null));
end $$;

revoke all on function public.serenity_legacy_import_v1(jsonb) from public,anon,authenticated;
revoke all on function public.serenity_legacy_link_my_history_v1() from public,anon;
revoke all on function public.serenity_legacy_account_context_v1() from public,anon;
grant execute on function public.serenity_legacy_import_v1(jsonb) to service_role;
grant execute on function public.serenity_legacy_link_my_history_v1(),public.serenity_legacy_account_context_v1() to authenticated;
commit;
