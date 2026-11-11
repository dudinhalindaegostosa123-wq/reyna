-- LUNARITY: instalação inicial de contas, pedidos, frete, checkout e Asaas.
-- Gerado por scripts/build-lunarity-installer.py; editar os módulos, não este arquivo.
-- Não contém clientes, pedidos, credenciais, preços ou dimensões da loja original.
-- Preserva catálogo e configurações existentes. Frete e atacado começam desativados.
-- Executar inteiro no SQL Editor do Supabase da Lunarity.
begin;
select pg_advisory_xact_lock(7391542026);
do $lunarity_install$
declare name text;
begin
 if current_setting('server_version_num')::integer<150000 then
  raise exception 'LUNARITY_POSTGRES_15_REQUIRED';
 end if;
 if to_regclass('public.serenity_lunarity_installation_v1') is not null then
  if exists(select 1 from public.serenity_lunarity_installation_v1 where version=1) then
   raise notice 'Lunarity: base já instalada; nenhuma rotina ou configuração foi substituída.';
   return;
  end if;
  raise exception 'LUNARITY_INSTALLATION_VERSION_UNKNOWN';
 end if;
 foreach name in array array['serenity_orders','serenity_customers','serenity_customer_accounts',
  'serenity_wholesale_settings','serenity_shipping_settings','serenity_shipping_quotes',
  'serenity_coupons','serenity_coupon_products','serenity_coupon_redemptions','serenity_stock_reservations',
  'serenity_stock_events','serenity_checkout_sessions_v2','serenity_checkout_payments_v2',
  'serenity_checkout_stock_v2','serenity_checkout_coupon_v2','serenity_checkout_payment_events_v2','serenity_checkout_rate_limits'] loop
  if to_regclass('public.'||name) is not null then
   raise exception 'LUNARITY_EXISTING_INSTALLATION: % já existe. Não executar um instalador inicial sobre dados existentes.',name;
  end if;
 end loop;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname ~ '^serenity_(checkout|stock|wholesale|customer_account|asaas|collection_)') then
  raise exception 'LUNARITY_EXISTING_FUNCTIONS: conferir instalação anterior antes de continuar.';
 end if;
 if to_regclass('public.products') is null or to_regclass('public.product_variants') is null
  or to_regclass('public.serenity_product_commercial') is null
  or to_regclass('public.serenity_commerce_settings_v1') is null
  or to_regclass('public.serenity_collection_settings') is null
  or to_regclass('public.serenity_pix_discount_settings_v4') is null
  or to_regprocedure('public.serenity_target_effective_price(uuid,uuid,numeric,numeric,timestamptz,timestamptz)') is null then
  raise exception 'LUNARITY_CATALOG_REQUIRED: este instalador exige o catálogo e configurações identificados no inventário.';
 end if;
 if (select atttypid from pg_attribute where attrelid='public.products'::regclass and attname='id' and not attisdropped)<>'uuid'::regtype
  or (select atttypid from pg_attribute where attrelid='public.product_variants'::regclass and attname='id' and not attisdropped)<>'uuid'::regtype then
  raise exception 'LUNARITY_CATALOG_UUID_REQUIRED';
 end if;


 -- database/lunarity-base/01-tabelas.sql SHA256 5feda7e68348c7fd66570cc5a131c9601d6fc87476979e1cd22a7eb48592ac5e
 execute $lunarity_component_0$
-- Instalação inicial para um catálogo existente. Sem dados da loja original.
-- Executado apenas pelo instalador transacional 03-instalar-base-lunarity.sql.
create table public.serenity_customers (
 id uuid primary key default gen_random_uuid(),name text not null,email text not null default '',
 phone text not null default '',notes text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.serenity_customer_accounts (
 user_id uuid primary key references auth.users(id),customer_id uuid not null unique references public.serenity_customers(id),
 document text not null,wholesale_requested boolean not null default false,
 wholesale_status text not null default 'not_requested' check(wholesale_status in('not_requested','pending','approved','rejected','suspended')),
 wholesale_requested_at timestamptz,wholesale_reviewed_at timestamptz,wholesale_reviewed_by uuid references auth.users(id),
 version bigint not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.serenity_wholesale_settings (
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 discount_percent numeric not null default 0 check(discount_percent>=0 and discount_percent<=99.99),
 minimum_products_cents bigint not null default 0 check(minimum_products_cents>=0),version bigint not null default 1 check(version>0)
);
insert into public.serenity_wholesale_settings(singleton) values(true);
create table public.serenity_shipping_settings (
 singleton boolean primary key default true check(singleton),origin text not null default '',
 weight_g integer check(weight_g>0),height numeric check(height>0),width numeric check(width>0),length numeric check(length>0),
 max_units integer check(max_units>0),enabled boolean not null default false,contact_email text,
 manual_slugs text[] not null default '{}',version bigint not null default 1 check(version>0),
 check(not enabled or (origin ~ '^[0-9]{8}$' and weight_g is not null and height is not null and width is not null and length is not null and max_units is not null))
);
-- Sem peso, dimensões, endereço ou tarifa inventados. Admin → Frete para configurar.
insert into public.serenity_shipping_settings(singleton) values(true);
create table public.serenity_coupons (
 id uuid primary key default gen_random_uuid(),code text not null unique check(code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
 status text not null default 'inactive' check(status in('active','inactive')),starts_at timestamptz,ends_at timestamptz,
 scope text not null default 'all' check(scope in('all','products')),minimum_subtotal numeric not null default 0 check(minimum_subtotal>=0),
 discount_type text not null check(discount_type in('percent','fixed')),discount_value numeric not null check(discount_value>0),
 max_uses bigint check(max_uses>0),max_uses_per_customer bigint check(max_uses_per_customer>0),version bigint not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(discount_type<>'percent' or discount_value<=100),check(ends_at is null or starts_at is null or ends_at>starts_at)
);
create table public.serenity_coupon_products (
 coupon_id uuid not null references public.serenity_coupons(id),product_id uuid not null references public.products(id),primary key(coupon_id,product_id)
);
create table public.serenity_orders (
 id uuid primary key default gen_random_uuid(),number bigint generated by default as identity unique,
 customer_id uuid not null references public.serenity_customers(id),customer_snapshot jsonb not null,
 items jsonb not null check(jsonb_typeof(items)='array'),subtotal numeric not null check(subtotal>=0),
 discount numeric not null default 0 check(discount>=0),shipping numeric not null default 0 check(shipping>=0),
 expenses numeric not null default 0 check(expenses>=0),total numeric not null check(total>=0),cost numeric,missing_costs integer not null default 0,
 status text not null check(status in('pending','paid','cancelled','refunded')),notes text not null default '',
 created_by uuid,paid_at timestamptz,source text not null default 'manual' check(source in('manual','site')),
 shipping_pending boolean not null default false,delivery_address jsonb,checkout_fingerprint text,
 shipping_details jsonb,account_user_id uuid references auth.users(id),
 stock_state text not null default 'none' check(stock_state in('none','reserved','released','debited','returned')),
 stock_reserved_until timestamptz,stock_untracked integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(total=round(subtotal-discount+shipping,2)),check(jsonb_typeof(customer_snapshot)='object')
);
create index serenity_orders_account_idx on public.serenity_orders(account_user_id,created_at desc,id);
create table public.serenity_shipping_quotes (
 id uuid primary key,request_id uuid not null,cart_hash text not null check(cart_hash ~ '^[a-f0-9]{64}$'),destination text not null check(destination ~ '^[0-9]{8}$'),
 subtotal_cents bigint not null check(subtotal_cents>=0),amount_cents bigint not null check(amount_cents>=0),manual boolean not null,
 settings_version bigint not null,snapshot jsonb not null,created_at timestamptz not null default now(),expires_at timestamptz not null,
 consumed_by uuid references public.serenity_orders(id),check(expires_at>created_at)
);
create table public.serenity_stock_reservations (
 order_id uuid not null references public.serenity_orders(id),entity_key text not null,product_id uuid not null references public.products(id),
 variant_id uuid references public.product_variants(id),quantity integer not null check(quantity>0),
 state text not null check(state in('active','released','consumed')),expires_at timestamptz not null,primary key(order_id,entity_key)
);
create table public.serenity_stock_events (
 id bigint generated always as identity primary key,order_id uuid not null references public.serenity_orders(id),kind text not null,
 changes jsonb not null default '[]',actor uuid,created_at timestamptz not null default now()
);
create table public.serenity_coupon_redemptions (
 order_id uuid primary key references public.serenity_orders(id),coupon_id uuid not null references public.serenity_coupons(id),customer_key text not null,
 state text not null check(state in('reserved','used','released')),discount_cents bigint not null default 0,coupon_snapshot jsonb not null default '{}',
 reserved_until timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.serenity_checkout_rate_limits (
 key text primary key check(key ~ '^[a-f0-9]{64}$'),window_started_at timestamptz not null,hits integer not null check(hits>0)
);
$lunarity_component_0$;


 -- database/lunarity-base/02-contas-frete.sql SHA256 54b20fba4cf3dfe1c316a9ec196575a116eb80537114d8be3e248adf4c465586
 execute $lunarity_component_1$
create or replace function public.serenity_checkout_document_valid(document text)
returns boolean language plpgsql immutable set search_path='' as $$
declare size integer; i integer; n integer; weight integer; remainder integer;
begin
 if document is null or document ~ '^(.)\1+$' then return false; end if;
 if document ~ '^[0-9]{11}$' then
  for size in 9..10 loop
   n:=0;
   for i in 1..size loop n:=n+substring(document,i,1)::integer*(size+2-i); end loop;
   if (n*10%11)%10<>substring(document,size+1,1)::integer then return false; end if;
  end loop;
  return true;
 elsif document ~ '^[A-Z0-9]{12}[0-9]{2}$' then
  for size in 12..13 loop
   n:=0;weight:=2;
   for i in reverse size..1 loop
    n:=n+(ascii(substring(document,i,1))-48)*weight;
    weight:=case when weight=9 then 2 else weight+1 end;
   end loop;
   remainder:=n%11;
   if (case when remainder<2 then 0 else 11-remainder end)<>substring(document,size+1,1)::integer then return false;end if;
  end loop;
  return true;
 end if;
 return false;
end $$;

create or replace function public.serenity_checkout_limit(p_key text,p_max integer)
returns boolean language plpgsql set search_path='' as $$
declare n integer;
begin
 if coalesce(p_key,'') !~ '^[a-f0-9]{64}$' or p_max is null or p_max not between 1 and 120 then return false;end if;
 insert into public.serenity_checkout_rate_limits as limits(key,window_started_at,hits) values(p_key,now(),1)
 on conflict(key) do update set
  hits=case when limits.window_started_at<=now()-interval '1 minute' then 1 else least(limits.hits+1,1000000) end,
  window_started_at=case when limits.window_started_at<=now()-interval '1 minute' then now() else limits.window_started_at end
 returning hits into n;
 return n<=p_max;
end $$;

create or replace function public.serenity_wholesale_context(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare settings public.serenity_wholesale_settings%rowtype;account public.serenity_customer_accounts%rowtype;confirmed boolean;
begin
 select * into settings from public.serenity_wholesale_settings where singleton;
 select * into account from public.serenity_customer_accounts where user_id=p_user;
 select exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) into confirmed;
 return jsonb_build_object('active',coalesce(settings.enabled and account.wholesale_status='approved' and confirmed,false),
 'discount_percent',settings.discount_percent,'minimum_products_cents',settings.minimum_products_cents,
 'settings_version',settings.version,'account_version',account.version);
end $$;

create or replace function public.serenity_wholesale_unit_price(p_regular numeric,p_current numeric)
returns numeric language plpgsql stable set search_path='' as $$
declare rules jsonb;who uuid;
begin
 who:=nullif(current_setting('serenity.wholesale_user',true),'')::uuid;
 rules:=public.serenity_wholesale_context(who);
 if rules->>'active' is distinct from 'true' then raise exception 'WHOLESALE_UNAVAILABLE';end if;
 return least(p_current,round(p_regular*(100-(rules->>'discount_percent')::numeric)/100,2));
end $$;

create or replace function public.serenity_customer_account_register(
 p_user uuid,p_email text,p_name text,p_phone text,p_document text,p_wholesale boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare customer uuid;existing public.serenity_customer_accounts%rowtype;
begin
 perform pg_advisory_xact_lock(7391542026);
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and lower(email)=lower(p_email))
  or coalesce(p_name,'')='' or length(p_name)>180 or p_name ~ '[[:cntrl:]]'
  or coalesce(p_phone,'') !~ '^[0-9]{10,11}$' or not public.serenity_checkout_document_valid(p_document)
  or p_wholesale is null then raise exception 'CUSTOMER_ACCOUNT_UNAVAILABLE';end if;
 select * into existing from public.serenity_customer_accounts where user_id=p_user;
 if found then return jsonb_build_object('user_id',existing.user_id,'customer_id',existing.customer_id);end if;
 customer:=gen_random_uuid();
 insert into public.serenity_customers(id,name,email,phone) values(customer,btrim(p_name),lower(p_email),p_phone);
 insert into public.serenity_customer_accounts(user_id,customer_id,document,wholesale_requested,wholesale_status,wholesale_requested_at)
 values(p_user,customer,p_document,p_wholesale,case when p_wholesale then 'pending' else 'not_requested' end,case when p_wholesale then now() end);
 return jsonb_build_object('user_id',p_user,'customer_id',customer);
end $$;

create or replace function public.serenity_shipping_settings_save(p_data jsonb,p_version bigint)
returns bigint language plpgsql set search_path='' as $$
declare next_version bigint;
begin
 if jsonb_typeof(p_data)<>'object' or coalesce(p_data->>'origin','') !~ '^[0-9]{8}$'
  or coalesce(p_data->>'weight_g','') !~ '^[0-9]+$' or (p_data->>'weight_g')::integer not between 1 and 1000000
  or coalesce((p_data->>'height')::numeric,-1) not between 0.1 and 1000 or coalesce((p_data->>'width')::numeric,-1) not between 0.1 and 1000
  or coalesce((p_data->>'length')::numeric,-1) not between 0.1 and 1000 or jsonb_typeof(p_data->'enabled') is distinct from 'boolean'
  or jsonb_typeof(p_data->'manual_slugs') is distinct from 'array'
  or jsonb_array_length(p_data->'manual_slugs')>200
  or exists(select 1 from jsonb_array_elements_text(p_data->'manual_slugs') slug where slug !~ '^[a-zA-Z0-9_-]{1,180}$')
 then raise exception 'SHIPPING_CONFIGURATION';end if;
 update public.serenity_shipping_settings set
  origin=p_data->>'origin',weight_g=(p_data->>'weight_g')::integer,height=(p_data->>'height')::numeric,
  width=(p_data->>'width')::numeric,length=(p_data->>'length')::numeric,max_units=(p_data->>'max_units')::integer,
  enabled=(p_data->>'enabled')::boolean,contact_email=nullif(p_data->>'contact_email',''),
  manual_slugs=array(select jsonb_array_elements_text(p_data->'manual_slugs')),version=version+1
 where singleton and version=p_version returning version into next_version;
 if not found then raise exception 'SHIPPING_SETTINGS_CHANGED';end if;
 return next_version;
end $$;

create or replace function public.serenity_customer_profile_update(p_user uuid,p_name text,p_phone text,p_expected_name text,p_expected_phone text)
returns jsonb language plpgsql set search_path='' as $$
declare customer uuid;
begin
 if coalesce(btrim(p_name),'')='' or length(p_name)>180 or p_name ~ '[[:cntrl:]]'
  or coalesce(p_phone,'') !~ '^[0-9]{10,11}$' then raise exception 'CUSTOMER_PROFILE_UNAVAILABLE';end if;
 select customer_id into customer from public.serenity_customer_accounts where user_id=p_user;
 if customer is null then raise exception 'CUSTOMER_PROFILE_UNAVAILABLE';end if;
 update public.serenity_customers set name=btrim(p_name),phone=p_phone,updated_at=now()
 where id=customer and name is not distinct from p_expected_name and phone is not distinct from p_expected_phone;
 if not found then raise exception 'CUSTOMER_PROFILE_STALE';end if;
 return jsonb_build_object('name',btrim(p_name),'phone',p_phone);
end $$;

create or replace function public.serenity_admin_wholesale_settings_save(p_actor uuid,p_version bigint,p_enabled boolean,p_discount_percent numeric,p_minimum_products_cents bigint)
returns jsonb language plpgsql set search_path='' as $$
declare v bigint;
begin
 if p_actor is null or p_enabled is null or p_discount_percent is null or p_discount_percent not between 0 and 99.99
  or p_minimum_products_cents is null or p_minimum_products_cents not between 0 and 999999999 then raise exception 'WHOLESALE_INVALID';end if;
 update public.serenity_wholesale_settings set enabled=p_enabled,discount_percent=p_discount_percent,
  minimum_products_cents=p_minimum_products_cents,version=version+1 where singleton and version=p_version returning version into v;
 if not found then raise exception 'WHOLESALE_STALE';end if;
 return jsonb_build_object('version',v);
end $$;

create or replace function public.serenity_admin_wholesale_review(p_user uuid,p_actor uuid,p_version bigint,p_decision text)
returns jsonb language plpgsql set search_path='' as $$
declare account public.serenity_customer_accounts%rowtype;
begin
 perform pg_advisory_xact_lock(7391542026);
 if p_actor is null or p_decision not in('approved','rejected','suspended') or p_decision is null then raise exception 'WHOLESALE_INVALID';end if;
 select * into account from public.serenity_customer_accounts where user_id=p_user for update;
 if not found then raise exception 'WHOLESALE_ACCOUNT_NOT_FOUND';end if;
 if account.version<>p_version then raise exception 'WHOLESALE_STALE';end if;
 if account.wholesale_status='not_requested' then raise exception 'WHOLESALE_NOT_REQUESTED';end if;
 if p_decision='suspended' and account.wholesale_status<>'approved' then raise exception 'WHOLESALE_TRANSITION';end if;
 if not public.serenity_checkout_document_valid(account.document) then raise exception 'WHOLESALE_ACCOUNT_INVALID';end if;
 update public.serenity_customer_accounts set wholesale_status=p_decision,wholesale_reviewed_at=now(),wholesale_reviewed_by=p_actor,
  version=version+1,updated_at=now() where user_id=p_user;
 return jsonb_build_object('version',p_version+1,'status',p_decision);
end $$;
$lunarity_component_1$;


 -- database/lunarity-base/04-sessoes-tabelas.sql SHA256 7c26052bd6f546ecd29f9f4732db0d37435c088bf7673127c3824c08e598ff83
 execute $lunarity_component_2$
-- Rotinas completas revisadas do snapshot de checkout existente; sem fixtures de dados.

create table if not exists public.serenity_checkout_sessions_v2 (
  id uuid primary key,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  access_hash text not null unique check (access_hash ~ '^[a-f0-9]{64}$'),
  environment text not null check (environment in ('test', 'production')),
  account_user_id uuid references auth.users(id),
  pricing_mode text not null check (pricing_mode in ('retail', 'wholesale')),
  customer_snapshot jsonb not null check (jsonb_typeof(customer_snapshot) = 'object'),
  delivery_address jsonb not null check (jsonb_typeof(delivery_address) = 'object'),
  cart_items jsonb not null check (jsonb_typeof(cart_items) = 'array'),
  order_items jsonb not null check (jsonb_typeof(order_items) = 'array'),
  pricing_snapshot jsonb not null check (jsonb_typeof(pricing_snapshot) = 'object'),
  shipping_quote_id uuid not null unique references public.serenity_shipping_quotes(id),
  shipping_snapshot jsonb not null check (jsonb_typeof(shipping_snapshot) = 'object'),
  shipping_pending boolean not null,
  subtotal_cents bigint not null check (subtotal_cents between 1 and 9007199254740991),
  discount_cents bigint not null check (discount_cents between 0 and subtotal_cents),
  shipping_cents bigint not null check (shipping_cents between 0 and 9007199254740991),
  total_cents bigint not null check (total_cents between 1 and 9007199254740991),
  state text not null default 'pending'
    check (state in ('pending', 'payment_pending', 'converted', 'expired', 'cancelled', 'review')),
  order_id uuid unique references public.serenity_orders(id),
  created_at timestamptz not null default now() check (isfinite(created_at)),
  expires_at timestamptz not null check (isfinite(expires_at)),
  access_expires_at timestamptz not null check (isfinite(access_expires_at)),
  updated_at timestamptz not null default now() check (isfinite(updated_at)),
  check (total_cents = subtotal_cents - discount_cents + shipping_cents),
  check (expires_at > created_at and expires_at <= created_at + interval '60 minutes'),
  check (access_expires_at > created_at and access_expires_at <= created_at + interval '24 hours'),
  check ((state = 'converted') = (order_id is not null)),
  check (order_id is null or order_id = id),
  check (environment <> 'test' or order_id is null),
  check (pricing_mode <> 'wholesale' or account_user_id is not null)
);

create table if not exists public.serenity_checkout_stock_v2 (
  checkout_id uuid not null references public.serenity_checkout_sessions_v2(id),
  entity_key text not null,
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  quantity integer not null check (quantity > 0),
  state text not null default 'active' check (state in ('active', 'released', 'converted')),
  expires_at timestamptz not null check (isfinite(expires_at)),
  primary key (checkout_id, entity_key),
  check (entity_key = coalesce(variant_id::text, 'product:' || product_id::text))
);

create index if not exists serenity_checkout_stock_v2_product_idx
  on public.serenity_checkout_stock_v2(product_id, expires_at)
  where state = 'active';

create index if not exists serenity_checkout_stock_v2_variant_idx
  on public.serenity_checkout_stock_v2(variant_id, expires_at)
  where state = 'active' and variant_id is not null;

create table if not exists public.serenity_checkout_coupon_v2 (
  checkout_id uuid primary key references public.serenity_checkout_sessions_v2(id),
  coupon_id uuid not null references public.serenity_coupons(id),
  customer_key text not null check (customer_key ~ '^[a-f0-9]{64}$'),
  discount_cents bigint not null check (discount_cents between 1 and 9007199254740991),
  coupon_snapshot jsonb not null check (jsonb_typeof(coupon_snapshot) = 'object'),
  state text not null default 'reserved' check (state in ('reserved', 'released', 'converted')),
  expires_at timestamptz not null check (isfinite(expires_at))
);

create index if not exists serenity_checkout_coupon_v2_capacity_idx
  on public.serenity_checkout_coupon_v2(coupon_id, customer_key, expires_at)
  where state = 'reserved';

create table if not exists public.serenity_checkout_payments_v2 (
  id uuid primary key,
  checkout_id uuid not null references public.serenity_checkout_sessions_v2(id),
  environment text not null check (environment in ('test', 'production')),
  merchant_id text not null check (merchant_id ~ '^[0-9]{1,40}$'),
  method text not null check (method in ('pix', 'card')),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  amount_cents bigint not null check (amount_cents between 1 and 9007199254740991),
  currency text not null default 'BRL' check (currency = 'BRL'),
  state text not null default 'created'
    check (state in ('created', 'submitting', 'pending', 'approved', 'rejected', 'cancelled', 'refunded', 'uncertain', 'charged_back')),
  blocks_new_attempt boolean not null default true,
  provider_payment_id text check (provider_payment_id ~ '^[0-9]{1,40}$'),
  provider_status text not null default '' check (length(provider_status) <= 40),
  provider_status_detail text not null default '' check (length(provider_status_detail) <= 120),
  provider_updated_at timestamptz check (isfinite(provider_updated_at)),
  refunded_cents bigint not null default 0 check (refunded_cents between 0 and amount_cents),
  application_state text not null default 'pending' check (application_state in ('pending', 'applied', 'review', 'test_approved')),
  last_error_code text not null default '' check (length(last_error_code) <= 80),
  pix_code text check (length(pix_code) <= 4096),
  pix_qr_base64 text check (length(pix_qr_base64) <= 300000),
  expires_at timestamptz check (isfinite(expires_at)),
  lease_id uuid,
  lease_expires_at timestamptz check (isfinite(lease_expires_at)),
  created_at timestamptz not null default now() check (isfinite(created_at)),
  updated_at timestamptz not null default now() check (isfinite(updated_at)),
  unique (environment, merchant_id, provider_payment_id),
  check ((lease_id is null) = (lease_expires_at is null)),
  check (state <> 'uncertain' or blocks_new_attempt),
  check (application_state <> 'test_approved' or (environment = 'test' and state = 'approved'))
);

create unique index if not exists serenity_checkout_payments_v2_blocker_idx
  on public.serenity_checkout_payments_v2(checkout_id)
  where blocks_new_attempt;

create table if not exists public.serenity_checkout_payment_events_v2 (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references public.serenity_checkout_payments_v2(id),
  source text not null check (source in ('create', 'webhook', 'poll', 'reconcile', 'admin')),
  event_key text not null check (event_key ~ '^[a-f0-9]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique (attempt_id, event_key)
);

alter table public.serenity_checkout_sessions_v2 enable row level security;
alter table public.serenity_checkout_stock_v2 enable row level security;
alter table public.serenity_checkout_coupon_v2 enable row level security;
alter table public.serenity_checkout_payments_v2 enable row level security;
alter table public.serenity_checkout_payment_events_v2 enable row level security;

revoke all on table
  public.serenity_checkout_sessions_v2,
  public.serenity_checkout_stock_v2,
  public.serenity_checkout_coupon_v2,
  public.serenity_checkout_payments_v2,
  public.serenity_checkout_payment_events_v2
from public, anon, authenticated;

grant select, insert, update on table
  public.serenity_checkout_sessions_v2,
  public.serenity_checkout_stock_v2,
  public.serenity_checkout_coupon_v2,
  public.serenity_checkout_payments_v2
  to service_role;

grant select, insert on table
  public.serenity_checkout_payment_events_v2
  to service_role;

revoke all on sequence public.serenity_checkout_payment_events_v2_id_seq
  from public, anon, authenticated;
grant usage, select on sequence public.serenity_checkout_payment_events_v2_id_seq
  to service_role;

notify pgrst, 'reload schema';
$lunarity_component_2$;


 -- database/lunarity-base/05-reservas-estoque.sql SHA256 93c9a159308d9d9132d96e31b53b9a45f90a12927f28281671171ccbf8c1d5e3
 execute $lunarity_component_3$
-- Rotinas completas revisadas do snapshot de checkout existente; sem fixtures de dados.

CREATE OR REPLACE FUNCTION public.serenity_stock_assert(p_order uuid, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  row record;
  p public.products%rowtype;
  v public.product_variants%rowtype;
  held bigint;
begin
  perform pg_advisory_xact_lock(7391542026);

  for row in
    select
      (x->>'product_id')::uuid as product_id,
      sum((x->>'quantity')::integer) as quantity
    from jsonb_array_elements(p_items) x
    group by 1
    order by 1
  loop
    select *
    into p
    from public.products
    where id=row.product_id
    for update;

    if not found or p.stock_status is distinct from 'instock' then
      raise exception 'STOCK_UNAVAILABLE';
    end if;

    select coalesce(sum(quantity),0)
    into held
    from public.serenity_stock_reservations
    where product_id=p.id
      and state='active'
      and expires_at>now()
      and order_id is distinct from p_order;

    select held + coalesce(sum(r.quantity), 0)
    into held
    from public.serenity_checkout_stock_v2 r
    join public.serenity_checkout_sessions_v2 c on c.id = r.checkout_id
    where r.product_id = p.id
      and r.state = 'active'
      and r.expires_at > now()
      and c.expires_at > now()
      and c.state in ('pending', 'payment_pending')
      and r.checkout_id is distinct from p_order;

    if p.stock_quantity is not null
      and row.quantity+held>p.stock_quantity
    then
      raise exception 'STOCK_RESERVED';
    end if;

    if p.sold_individually and row.quantity>1 then
      raise exception 'STOCK_UNAVAILABLE';
    end if;
  end loop;

  for row in
    select
      (x->>'product_id')::uuid as product_id,
      nullif(x->>'variant_id','')::uuid as variant_id,
      sum((x->>'quantity')::integer) as quantity
    from jsonb_array_elements(p_items) x
    group by 1,2
    order by 1,2
  loop
    select *
    into p
    from public.products
    where id=row.product_id;

    if row.variant_id is null then
      if p.product_type='variable' then
        raise exception 'VARIANT_REQUIRED';
      end if;
    else
      select *
      into v
      from public.product_variants
      where id=row.variant_id and product_id=p.id
      for update;

      if not found
        or v.enabled is distinct from true
        or v.stock_status is distinct from 'instock'
      then
        raise exception 'STOCK_UNAVAILABLE';
      end if;

      select coalesce(sum(quantity),0)
      into held
      from public.serenity_stock_reservations
      where variant_id=v.id
        and state='active'
        and expires_at>now()
        and order_id is distinct from p_order;

      select held + coalesce(sum(r.quantity), 0)
      into held
      from public.serenity_checkout_stock_v2 r
      join public.serenity_checkout_sessions_v2 c on c.id = r.checkout_id
      where r.variant_id = v.id
        and r.state = 'active'
        and r.expires_at > now()
        and c.expires_at > now()
        and c.state in ('pending', 'payment_pending')
        and r.checkout_id is distinct from p_order;

      if v.stock_quantity is not null
        and row.quantity+held>v.stock_quantity
      then
        raise exception 'STOCK_RESERVED';
      end if;
    end if;
  end loop;
end
$function$;

create or replace function public.serenity_checkout_reserve_stock_v2(p_checkout uuid)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  checkout public.serenity_checkout_sessions_v2%rowtype;
  item jsonb;
  line record;
  units bigint := 0;
begin
  perform pg_advisory_xact_lock(7391542026);

  select * into checkout
  from public.serenity_checkout_sessions_v2
  where id = p_checkout
  for update;

  if not found then
    raise exception 'CHECKOUT_SESSION_INVALID';
  end if;

  if checkout.state not in ('pending', 'payment_pending')
    or checkout.order_id is not null
    or exists(select 1 from public.serenity_orders where id = p_checkout)
  then
    raise exception 'CHECKOUT_SESSION_NOT_RESERVABLE';
  end if;

  if checkout.expires_at <= now() + interval '1 minute' then
    raise exception 'CHECKOUT_RESERVATION_EXPIRED';
  end if;

  if jsonb_array_length(checkout.order_items) not between 1 and 200 then
    raise exception 'INVALID_ITEMS';
  end if;

  for item in select value from jsonb_array_elements(checkout.order_items)
  loop
    if jsonb_typeof(item) is distinct from 'object'
      or coalesce(item->>'product_id', '') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or (coalesce(item->>'variant_id', '') <> '' and
        (item->>'variant_id') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
      or coalesce(item->>'quantity', '') !~ '^[1-9][0-9]{0,5}$'
    then
      raise exception 'INVALID_ITEMS';
    end if;
  end loop;

  perform public.serenity_stock_assert(checkout.id, checkout.order_items);

  update public.serenity_checkout_stock_v2
  set state = 'released'
  where checkout_id = checkout.id and state = 'active';

  for line in
    select
      (x->>'product_id')::uuid as product_id,
      nullif(x->>'variant_id', '')::uuid as variant_id,
      sum((x->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(checkout.order_items) x
    group by 1, 2
    order by 1, 2
  loop
    insert into public.serenity_checkout_stock_v2 (
      checkout_id, entity_key, product_id, variant_id,
      quantity, state, expires_at
    ) values (
      checkout.id,
      coalesce(line.variant_id::text, 'product:' || line.product_id::text),
      line.product_id, line.variant_id,
      line.quantity, 'active', checkout.expires_at
    )
    on conflict (checkout_id, entity_key)
    do update set
      quantity = excluded.quantity,
      state = 'active',
      expires_at = excluded.expires_at;

    units := units + line.quantity;
  end loop;

  return jsonb_build_object(
    'checkout_id', checkout.id,
    'reserved_until', checkout.expires_at,
    'units', units
  );
end;
$function$;

revoke all on function public.serenity_checkout_reserve_stock_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.serenity_checkout_reserve_stock_v2(uuid)
  to service_role;

notify pgrst, 'reload schema';

select
  p.proname as funcao,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  pg_get_functiondef(p.oid) as definicao
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and p.proname in (
    'serenity_checkout_quote',
    'serenity_checkout_stock_review',
    'serenity_checkout_coupon_quote',
    'serenity_wholesale_stock_review'
  )
order by p.proname;
$lunarity_component_3$;


 -- database/lunarity-base/06-rotinas-estoque-cupons.sql SHA256 f9507b9ef7cd9406fcff21a63927f35f200186bc2cea8095e3984397cab2f760
 execute $lunarity_component_4$
-- Rotinas completas de estoque/cupons, sem dados nem implementações simuladas.

CREATE OR REPLACE FUNCTION public.serenity_stock_reserve(p_order uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  o public.serenity_orders%rowtype;
  row record;
  until_at timestamptz:=now()+interval '30 minutes';
  missing integer;
begin
  perform pg_advisory_xact_lock(7391542026);

  select *
  into o
  from public.serenity_orders
  where id=p_order
  for update;

  if not found or o.status<>'pending' then
    raise exception 'INVALID_STOCK_STATUS';
  end if;

  if o.stock_state='reserved' and o.stock_reserved_until>now() then
    return;
  end if;

  if o.stock_state in ('debited','returned') then
    raise exception 'INVALID_STOCK_STATUS';
  end if;

  perform public.serenity_stock_assert(o.id,o.items);

  for row in
    select
      (x->>'product_id')::uuid as product_id,
      nullif(x->>'variant_id','')::uuid as variant_id,
      sum((x->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(o.items) x
    group by 1,2
    order by 1,2
  loop
    insert into public.serenity_stock_reservations(
      order_id,entity_key,product_id,variant_id,
      quantity,expires_at,state
    )
    values(
      o.id,
      coalesce(row.variant_id::text,'product:'||row.product_id::text),
      row.product_id,
      row.variant_id,
      row.quantity,
      until_at,
      'active'
    )
    on conflict(order_id,entity_key)
    do update set
      quantity=excluded.quantity,
      expires_at=excluded.expires_at,
      state='active';
  end loop;

  select coalesce(sum((x->>'quantity')::integer),0)::integer
  into missing
  from jsonb_array_elements(o.items) x
  join public.products pp
    on pp.id::text=x->>'product_id'
  left join public.product_variants vv
    on vv.id::text=x->>'variant_id'
  where pp.stock_quantity is null
    and vv.stock_quantity is null;

  update public.serenity_orders
  set
    stock_state='reserved',
    stock_reserved_until=until_at,
    stock_untracked=missing,
    updated_at=now()
  where id=o.id;

  insert into public.serenity_stock_events(
    order_id,kind,changes,actor
  )
  values(
    o.id,
    'reserved',
    jsonb_build_object('until',until_at,'untracked',missing),
    p_actor
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.serenity_stock_debit(p_order uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  o public.serenity_orders%rowtype;
  row record;
  p public.products%rowtype;
  v public.product_variants%rowtype;
  movements jsonb:='[]'::jsonb;
  missing integer;
begin
  perform pg_advisory_xact_lock(7391542026);

  select *
  into o
  from public.serenity_orders
  where id=p_order
  for update;

  if not found or o.status<>'paid' then
    raise exception 'INVALID_STOCK_STATUS';
  end if;

  if o.stock_state='debited' then
    return;
  end if;

  if o.stock_state='returned' then
    raise exception 'INVALID_STOCK_STATUS';
  end if;

  perform public.serenity_stock_assert(o.id,o.items);

  update public.serenity_stock_reservations
  set state='consumed'
  where order_id=o.id and state='active';

  for row in
    select
      (x->>'product_id')::uuid as product_id,
      sum((x->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(o.items) x
    group by 1
    order by 1
  loop
    select *
    into p
    from public.products
    where id=row.product_id
    for update;

    if p.product_type<>'variable' and p.stock_quantity is not null then -- Serenity variant stock v2

      update public.products
      set
        stock_quantity=p.stock_quantity-row.quantity,
        stock_status=case
          when p.stock_quantity-row.quantity=0 then 'outofstock'
          else p.stock_status
        end
      where id=p.id;

      movements:=movements||jsonb_build_array(
        jsonb_build_object(
          'entity','product',
          'id',p.id,
          'name',p.name,
          'quantity',row.quantity,
          'before',p.stock_quantity,
          'after',p.stock_quantity-row.quantity
        )
      );
    end if;
  end loop;

  for row in
    select
      nullif(x->>'variant_id','')::uuid as variant_id,
      sum((x->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(o.items) x
    where nullif(x->>'variant_id','') is not null
    group by 1
    order by 1
  loop
    select *
    into v
    from public.product_variants
    where id=row.variant_id
    for update;

    if v.stock_quantity is not null then
      update public.product_variants
      set
        stock_quantity=v.stock_quantity-row.quantity,
        stock_status=case
          when v.stock_quantity-row.quantity=0 then 'outofstock'
          else v.stock_status
        end
      where id=v.id;

      movements:=movements||jsonb_build_array(
        jsonb_build_object(
          'entity','variant',
          'id',v.id,
          'name',v.name,
          'quantity',row.quantity,
          'before',v.stock_quantity,
          'after',v.stock_quantity-row.quantity
        )
      );
    end if;
  end loop;

  select coalesce(sum((x->>'quantity')::integer),0)::integer
  into missing
  from jsonb_array_elements(o.items) x
  join public.products pp
    on pp.id::text=x->>'product_id'
  left join public.product_variants vv
    on vv.id::text=x->>'variant_id'
  where pp.stock_quantity is null
    and vv.stock_quantity is null;

  update public.serenity_orders
  set
    stock_state='debited',
    stock_reserved_until=null,
    stock_untracked=missing,
    updated_at=now()
  where id=o.id;

  insert into public.serenity_stock_events(
    order_id,kind,changes,actor
  )
  values(o.id,'debited',movements,p_actor);
end
$function$;

CREATE OR REPLACE FUNCTION public.serenity_stock_release(p_order uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  o public.serenity_orders%rowtype;
begin
  perform pg_advisory_xact_lock(7391542026);

  select *
  into o
  from public.serenity_orders
  where id=p_order
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if o.stock_state in ('released','debited','returned') then
    return;
  end if;

  update public.serenity_stock_reservations
  set state='released'
  where order_id=o.id and state='active';

  update public.serenity_orders
  set
    stock_state='released',
    stock_reserved_until=null,
    updated_at=now()
  where id=o.id;

  insert into public.serenity_stock_events(order_id,kind,actor)
  values(o.id,'released',p_actor);
end
$function$;

CREATE OR REPLACE FUNCTION public.serenity_stock_order_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op='INSERT' then
    if new.status='pending' then
      perform public.serenity_stock_reserve(
        new.id,
        case
          when new.created_by=new.id and new.customer_id=new.id
          then null
          else new.created_by
        end
      );
    elsif new.status='paid' then
      perform public.serenity_stock_debit(new.id,new.created_by);
    end if;
  elsif new.status is distinct from old.status then
    if new.status='paid' then
      perform public.serenity_stock_debit(new.id,null);
    elsif new.status='cancelled' then
      perform public.serenity_stock_release(new.id,null);
    end if;
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.serenity_admin_order_status(p_id uuid, p_expected text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  current_status text;
begin
  perform pg_advisory_xact_lock(7391542026); -- Serenity stock mutex v1

  select status
  into current_status
  from public.serenity_orders
  where id = p_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if current_status is distinct from p_expected then
    raise exception 'STALE_ORDER';
  end if;

  if not (
    (current_status = 'pending' and p_status in ('paid','cancelled'))
    or
    (current_status = 'paid' and p_status = 'refunded')
  ) then
    raise exception 'INVALID_STATUS';
  end if;

  update public.serenity_orders
  set
    status = p_status,
    updated_at = now(),
    paid_at = case
      when p_status = 'paid' then now()
      else paid_at
    end
  where id = p_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.serenity_coupon_order_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_use public.serenity_coupon_redemptions%rowtype;
  v_coupon public.serenity_coupons%rowtype;
  v_global bigint;
  v_customer bigint;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  perform pg_advisory_xact_lock(7391542026);

  select *
  into v_use
  from public.serenity_coupon_redemptions
  where order_id = new.id
  for update;

  if not found then
    return new;
  end if;

  if
    new.status = 'cancelled'
    and v_use.state = 'reserved'
  then
    update public.serenity_coupon_redemptions
    set
      state = 'released',
      updated_at = now()
    where order_id = new.id;

    return new;
  end if;

  if new.status <> 'paid' or v_use.state = 'used' then
    return new;
  end if;

  select *
  into v_coupon
  from public.serenity_coupons
  where id = v_use.coupon_id
  for update;

  if not found then
    raise exception 'COUPON_UNAVAILABLE';
  end if;

  select
    count(*),

    count(*) filter (
      where r.customer_key = v_use.customer_key
    )

  into v_global, v_customer

  from public.serenity_coupon_redemptions as r

  join public.serenity_orders as o
    on o.id = r.order_id

  where
    r.coupon_id = v_use.coupon_id
    and r.order_id <> new.id

    and (
      r.state = 'used'

      or (
        r.state = 'reserved'

        and (
          o.status = 'paid'

          or (
            o.status = 'pending'
            and r.reserved_until > now()
          )
        )
      )
    );

  if
    v_coupon.max_uses is not null
    and v_global >= v_coupon.max_uses
  then
    raise exception 'COUPON_LIMIT';
  end if;

  if
    v_coupon.max_uses_per_customer is not null
    and v_customer >= v_coupon.max_uses_per_customer
  then
    raise exception 'COUPON_CUSTOMER_LIMIT';
  end if;

  update public.serenity_coupon_redemptions
  set
    state = 'used',
    reserved_until = null,
    updated_at = now()
  where order_id = new.id;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.serenity_stock_review(p_items jsonb, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform pg_advisory_xact_lock(7391542026);

  perform set_config(
    'serenity.stock_quote_order',
    coalesce(
      (
        select id::text
        from public.serenity_orders
        where id=p_request
          and source='site'
          and status='pending'
      ),
      ''
    ),
    true
  );

  return public.serenity_checkout_quote(p_items);
end
$function$;

CREATE OR REPLACE FUNCTION public.serenity_checkout_coupon_quote(p_items jsonb, p_code text DEFAULT NULL::text, p_customer_key text DEFAULT NULL::text, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_quote jsonb;
  v_coupon public.serenity_coupons%rowtype;

  v_code text;
  v_item jsonb;

  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;

  v_regular numeric;
  v_quantity integer;

  v_current_cents bigint;
  v_regular_cents bigint;

  v_subtotal bigint := 0;
  v_eligible_current bigint := 0;
  v_eligible_regular bigint := 0;

  v_existing_discount bigint;
  v_nominal_discount bigint;
  v_extra_discount bigint;
  v_total bigint;

  v_global_uses bigint;
  v_customer_uses bigint;

  v_eligible boolean;
begin
  v_quote := public.serenity_stock_review(
    p_items,
    p_request
  );

  v_total := (v_quote->>'total_cents')::bigint;
  v_code := upper(trim(coalesce(p_code, '')));

  if v_code = '' then
    return v_quote || jsonb_build_object(
      'subtotal_cents', v_total,
      'discount_cents', 0,
      'coupon', null
    );
  end if;

  if
    v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'
    or (
      p_customer_key is not null
      and p_customer_key !~ '^[a-f0-9]{64}$'
    )
  then
    raise exception 'COUPON_INVALID';
  end if;

  select *
  into v_coupon
  from public.serenity_coupons
  where code = v_code
  for share;

  if not found or v_coupon.status <> 'active' then
    raise exception 'COUPON_UNAVAILABLE';
  end if;

  if
    v_coupon.starts_at is not null
    and v_coupon.starts_at > now()
  then
    raise exception 'COUPON_NOT_STARTED';
  end if;

  if
    v_coupon.ends_at is not null
    and v_coupon.ends_at <= now()
  then
    raise exception 'COUPON_EXPIRED';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(v_quote->'items')
  loop
    v_quantity := (v_item->>'quantity')::integer;

    v_current_cents :=
      round(
        (v_item->>'unit_price')::numeric * 100
      )::bigint * v_quantity;

    v_subtotal := v_subtotal + v_current_cents;

    v_eligible :=
      v_coupon.scope = 'all'
      or exists (
        select 1
        from public.serenity_coupon_products
        where coupon_id = v_coupon.id
          and product_id =
            (v_item->>'product_id')::uuid
      );

    if not v_eligible then
      continue;
    end if;

    select *
    into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid;

    if not found then
      raise exception 'PRODUCT_UNAVAILABLE';
    end if;

    if nullif(v_item->>'variant_id', '') is not null then
      select *
      into v_variant
      from public.product_variants
      where id = (v_item->>'variant_id')::uuid
        and product_id = v_product.id;

      if not found then
        raise exception 'VARIANT_UNAVAILABLE';
      end if;

      v_regular := v_variant.regular_price;
    else
      v_regular := v_product.regular_price;
    end if;

    if
      v_regular is null
      or v_regular < 0
      or v_regular::text in (
        'NaN',
        'Infinity',
        '-Infinity'
      )
    then
      raise exception 'PRICE_UNAVAILABLE';
    end if;

    v_regular_cents :=
      round(v_regular * 100)::bigint
      * v_quantity;

    v_eligible_regular :=
      v_eligible_regular + v_regular_cents;

    v_eligible_current :=
      v_eligible_current + v_current_cents;
  end loop;

  if
    v_subtotal <
    round(v_coupon.minimum_subtotal * 100)::bigint
  then
    raise exception 'COUPON_MINIMUM';
  end if;

  if v_eligible_regular <= 0 then
    raise exception 'COUPON_NO_PRODUCTS';
  end if;

  if v_coupon.discount_type = 'percent' then
    v_nominal_discount := round(
      v_eligible_regular
      * v_coupon.discount_value
      / 100
    )::bigint;
  else
    v_nominal_discount := round(
      v_coupon.discount_value * 100
    )::bigint;
  end if;

  v_nominal_discount := least(
    v_eligible_regular,
    v_nominal_discount
  );

  v_existing_discount := greatest(
    0,
    v_eligible_regular - v_eligible_current
  );

  v_extra_discount := least(
    v_eligible_current,
    greatest(
      0,
      v_nominal_discount - v_existing_discount
    )
  );

  if v_extra_discount > 0 then
    select
      count(*),
      count(*) filter (
        where r.customer_key = p_customer_key
      )
    into
      v_global_uses,
      v_customer_uses
    from public.serenity_coupon_redemptions as r
    join public.serenity_orders as o
      on o.id = r.order_id
    where r.coupon_id = v_coupon.id
      and (
        p_request is null
        or r.order_id <> p_request
      )
      and (
        r.state = 'used'
        or (
          r.state = 'reserved'
          and (
            o.status = 'paid'
            or (
              o.status = 'pending'
              and r.reserved_until > now()
            )
          )
        )
      );

    if
      v_coupon.max_uses is not null
      and v_global_uses >= v_coupon.max_uses
    then
      raise exception 'COUPON_LIMIT';
    end if;

    if
      p_customer_key is not null
      and v_coupon.max_uses_per_customer is not null
      and v_customer_uses >=
        v_coupon.max_uses_per_customer
    then
      raise exception 'COUPON_CUSTOMER_LIMIT';
    end if;
  end if;

  return v_quote || jsonb_build_object(
    'subtotal_cents', v_total,
    'discount_cents', v_extra_discount,
    'total_cents', v_total - v_extra_discount,
    'total', (v_total - v_extra_discount) / 100.0,
    'coupon', jsonb_build_object(
      'id', v_coupon.id,
      'code', v_coupon.code,
      'version', v_coupon.version,
      'applied', v_extra_discount > 0,
      'discount_cents', v_extra_discount,
      'nominal_discount_cents', v_nominal_discount,
      'existing_discount_cents', v_existing_discount,
      'customer_check_required',
        v_coupon.max_uses_per_customer is not null
        and p_customer_key is null
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.serenity_wholesale_stock_review(p_user uuid, p_items jsonb, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  context jsonb;
  quote jsonb;
  products_cents bigint;
  previous_user text;
begin
  perform pg_advisory_xact_lock(7391542026);

  if p_user is null then
    raise exception 'WHOLESALE_UNAVAILABLE';
  end if;

  context := public.serenity_wholesale_context(p_user);

  if (context->>'active')::boolean is distinct from true then
    raise exception 'WHOLESALE_UNAVAILABLE';
  end if;

  previous_user := current_setting(
    'serenity.wholesale_user',
    true
  );

  perform set_config(
    'serenity.wholesale_user',
    p_user::text,
    true
  );

  quote := public.serenity_stock_review(
    p_items,
    p_request
  );

  perform set_config(
    'serenity.wholesale_user',
    coalesce(previous_user, ''),
    true
  );

  -- Soma somente os produtos após o desconto.
  -- Não inclui anodização nem frete.

  select coalesce(
    sum(
      round(
        (item->>'unit_price')::numeric * 100
      )::bigint
      * (item->>'quantity')::integer
    ),
    0
  )
  into products_cents
  from jsonb_array_elements(quote->'items') as rows(item);

  return quote || jsonb_build_object(
    'pricing_mode', 'wholesale',
    'wholesale',
    context || jsonb_build_object(
      'products_cents', products_cents,
      'minimum_met',
      products_cents >=
        (context->>'minimum_products_cents')::bigint
    ),
    'coupon', null,
    'discount_cents', 0,
    'subtotal_cents', (quote->>'total_cents')::bigint
  );
end;
$function$;
$lunarity_component_4$;


 -- database/lunarity-base/03-cotacao.sql SHA256 44f5a5d9a83d2099ee2b6dce1741b9968294cbb80e3e033f0cbaf39f90bd3c42
 execute $lunarity_component_5$
-- Cálculo pelo catálogo real e pelas configurações existentes. Nunca aceita preços do navegador.
create or replace function public.serenity_lunarity_policy_v1()
returns jsonb language plpgsql stable set search_path='' as $$
declare policy jsonb;
begin
 select to_jsonb(s) into policy from public.serenity_commerce_settings_v1 s where singleton;
 if policy is null or coalesce((policy->>'version')::bigint,0)<1
  or coalesce((policy->>'anodization_fee')::numeric,-1) not in(0,15)
  or jsonb_typeof(policy->'included_stems') is distinct from 'boolean'
  or jsonb_typeof(policy->'free_shipping_after_discounts') is distinct from 'boolean'
  or coalesce((policy->>'retail_free_shipping_minimum_cents')::bigint,-1)<0 then
  return jsonb_build_object('version',0,'anodization_fee',15,'included_stems',false,
   'preparation_options',false,'sterilization_all_products',false,'stem_fee',0,'sterilization_fee',0);
 end if;
 return policy || jsonb_build_object(
  'preparation_options',coalesce(policy->>'preparation_options','false')='true',
  'sterilization_all_products',coalesce(policy->>'sterilization_all_products','false')='true',
  'stem_fee',case when (policy->>'stem_fee')::numeric=5 then 5 else 0 end,
  'sterilization_fee',case when (policy->>'sterilization_fee')::numeric in(5,10) then (policy->>'sterilization_fee')::numeric else 0 end);
end $$;

create or replace function public.serenity_checkout_quote(p_items jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 p public.products%rowtype;v public.product_variants%rowtype;item jsonb;entries jsonb:='[]';
 quantity integer;grouped integer;regular numeric;price numeric;fee numeric;total numeric:=0;
 label text;policy jsonb;is_top boolean;is_micro boolean;is_tool boolean;
 stem text;locked_stem text;sterilized boolean;sterilization_fee numeric;stem_fee numeric;
begin
 perform pg_advisory_xact_lock(7391542026);
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'INVALID_CART';end if;
 policy:=public.serenity_lunarity_policy_v1();
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item) is distinct from 'object'
   or coalesce(item->>'quantity','') !~ '^[1-9][0-9]{0,2}$'
   or coalesce(item->>'slug','') !~ '^[a-zA-Z0-9_-]{1,180}$'
   or coalesce(item->>'variant','') !~ '^(|[0-9]{1,12}|[a-fA-F0-9-]{36})$'
   or coalesce(item->>'color','') !~ '^(|[0-9]{2,3})$'
   or (item ? 'sterilized' and jsonb_typeof(item->'sterilized') is distinct from 'boolean')
   or coalesce(item->>'stem','') not in('','4','6','8','10') then raise exception 'INVALID_CART';end if;
 end loop;
 for item in select value from jsonb_array_elements(p_items) loop
  select * into p from public.products where slug=item->>'slug' for share;
  if not found or p.status<>'published' or p.visibility='hidden' or p.product_type not in('simple','variable') then raise exception 'PRODUCT_UNAVAILABLE';end if;
  quantity:=(item->>'quantity')::integer;
  select sum((x->>'quantity')::integer) into grouped from jsonb_array_elements(p_items) x where x->>'slug'=p.slug;
  if p.sold_individually and grouped>1 then raise exception 'STOCK_CHANGED';end if;
  v:=null;label:=null;
  if p.product_type='variable' then
   select * into v from public.product_variants where product_id=p.id and enabled and (id::text=item->>'variant' or woo_id::text=item->>'variant') for share;
   if not found then raise exception 'VARIANT_UNAVAILABLE';end if;
   regular:=v.regular_price;
   price:=public.serenity_target_effective_price(p.id,v.id,regular,v.sale_price,v.sale_starts_at,v.sale_ends_at);
   select string_agg(a.key||' '||a.value,' / ' order by a.key) into label from jsonb_each_text(v.attributes) a where a.value<>'';
   label:=coalesce(label,v.name);
   -- Same unit-only rule as individualVariations; do not relabel or edit existing SKUs.
   if (p.name||' '||array_to_string(p.categories,' ')) ~* '(push[[:space:]_-]*pin|threadless|mamilos?|nipples?)'
     and exists(select 1 from jsonb_each_text(v.attributes) a where
       a.key ~* '(quantidade|apresenta|unidade.*venda|venda.*por|quantity|packaging)'
       and a.key !~* '(pedra|cristal|navete|esfera|pontos)' and a.value ~* '^(par|pares|pair|2[[:space:]]*(unidades|peças|pecas))$') then raise exception 'UNIT_SALE_REQUIRED';end if;
  else
   if coalesce(item->>'variant','')<>'' then raise exception 'VARIANT_UNAVAILABLE';end if;
   regular:=p.regular_price;
   price:=public.serenity_target_effective_price(p.id,null,regular,p.sale_price,p.sale_starts_at,p.sale_ends_at);
  end if;
  if regular is null or regular<0 or regular::text in('NaN','Infinity','-Infinity')
   or price is null or price<0 or price::text in('NaN','Infinity','-Infinity') then raise exception 'PRICE_UNAVAILABLE';end if;
  if nullif(current_setting('serenity.wholesale_user',true),'') is not null then price:=public.serenity_wholesale_unit_price(regular,price);end if;
  fee:=0;
  if coalesce(item->>'color','')<>'' then
   if item->>'color' not in('12','15','18','20','22','25','28','30','33','36','40','42','48','55','61','64','70','72','75','80','85','90','92','95','103','105')
    or not exists(select 1 from unnest(p.tags) tag where btrim(translate(lower(tag),'áàãâéêíóôõúç','aaaaeeiooouc'))
      in('anodizavel','anodizaveis','permite anodizacao','aceita anodizacao')) then raise exception 'INVALID_ANODIZATION';end if;
   fee:=(policy->>'anodization_fee')::numeric;
  end if;
  is_tool:=p.name ~* '(after.?care|soro|limpeza|higieni|pin[çc]a|porta.?joia|estojo|mostru[aá]rio|expositor|luvas?|alicate|instrumental|autoclave|esteriliz|agulha|cateter)';
  is_top:=not is_tool and (p.name ~* '\mtopos?\M' or exists(select 1 from unnest(p.categories) c where lower(btrim(c)) in('topo','topos')));
  is_micro:=p.name ~* 'microdermal';
  stem:='';locked_stem:=null;stem_fee:=0;sterilization_fee:=0;sterilized:=null;
  if coalesce((policy->>'included_stems')::boolean,false) and is_top
   and not(is_micro and (policy->>'preparation_options')::boolean) then
   select substring(value from '(4|6|8|10)') into locked_stem from jsonb_each_text(coalesce(v.attributes,'{}'))
    where key ~* 'comprimento' and key !~* '(pedra|topo|cristal|zirc)'
      and value ~* '^[[:space:]]*(4|6|8|10)([.,]0)?[[:space:]]*mm[[:space:]]*$' order by key limit 1;
   if locked_stem is not null then
    if coalesce(item->>'stem','') not in('',locked_stem) then raise exception 'INVALID_STEM';end if;
    stem:=locked_stem;
   elsif (policy->>'preparation_options')::boolean then
    stem:=coalesce(item->>'stem','');
    if stem not in('','6','8') then raise exception 'INVALID_STEM';end if;
   else
    stem:=coalesce(item->>'stem','');
    if stem not in('4','6','8','10') then raise exception 'TOP_STEM_REQUIRED';end if;
   end if;
   if stem<>'' then
    stem_fee:=(policy->>'stem_fee')::numeric;
    label:=concat_ws(' · ',nullif(label,''),'Haste: '||stem||' mm');
   end if;
  elsif coalesce(item->>'stem','')<>'' then raise exception 'INVALID_STEM';end if;
  if item ? 'sterilized' then
   if not (policy->>'preparation_options')::boolean then raise exception 'INVALID_STERILIZATION';end if;
   sterilized:=(item->>'sterilized')::boolean;
   if sterilized and is_tool and not (policy->>'sterilization_all_products')::boolean then raise exception 'INVALID_STERILIZATION';end if;
   if sterilized then sterilization_fee:=(policy->>'sterilization_fee')::numeric;end if;
   label:=concat_ws(' · ',nullif(label,''),'Esterilização: '||case when sterilized then 'Sim' else 'Não' end);
  end if;
  price:=round(price,2);total:=total+(price+fee+stem_fee+sterilization_fee)*quantity;
  entries:=entries||jsonb_build_array(jsonb_build_object('product_id',p.id,'variant_id',v.id,'cart_variant',item->>'variant',
   'slug',p.slug,'name',p.name,'variation',label,'quantity',quantity,'unit_price',price,'color',coalesce(item->>'color',''),
   'fee',fee,'stem',stem,'stem_locked',locked_stem is not null,'stem_fee',stem_fee,'sterilized',sterilized,
   'sterilization_fee',sterilization_fee,'line_total',(price+fee+stem_fee+sterilization_fee)*quantity));
 end loop;
 perform public.serenity_stock_assert(nullif(current_setting('serenity.stock_quote_order',true),'')::uuid,entries);
 return jsonb_build_object('items',entries,'total',total,'total_cents',round(total*100)::bigint);
end $$;
$lunarity_component_5$;


 -- database/lunarity-base/07-reservas-cupons.sql SHA256 0d53c3c224a1f12586e7c2bdf778cf0621979ffe88030e67bd7903f5e660f68e
 execute $lunarity_component_6$
-- Rotinas completas revisadas do snapshot de checkout existente; sem fixtures de dados.

create or replace function public.serenity_coupon_capacity_v2(
  p_coupon uuid,
  p_customer_key text,
  p_exclude uuid default null
)
returns table(global_uses bigint, customer_uses bigint)
language plpgsql
set search_path = ''
as $function$
begin
  perform pg_advisory_xact_lock(7391542026);

  return query
  select count(*), count(*) filter (where usage.customer_key = p_customer_key)
  from (
    select r.customer_key
    from public.serenity_coupon_redemptions r
    join public.serenity_orders o on o.id = r.order_id
    where r.coupon_id = p_coupon
      and r.order_id is distinct from p_exclude
      and (
        r.state = 'used'
        or (
          r.state = 'reserved'
          and (o.status = 'paid' or (o.status = 'pending' and r.reserved_until > now()))
        )
      )

    union all

    select r.customer_key
    from public.serenity_checkout_coupon_v2 r
    join public.serenity_checkout_sessions_v2 c on c.id = r.checkout_id
    where r.coupon_id = p_coupon
      and r.checkout_id is distinct from p_exclude
      and r.state = 'reserved'
      and r.expires_at > now()
      and c.expires_at > now()
      and c.state in ('pending', 'payment_pending')
  ) as usage;
end;
$function$;

revoke all on function public.serenity_coupon_capacity_v2(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.serenity_coupon_capacity_v2(uuid, text, uuid)
  to service_role;

do $migration$
declare
  source text;
  definition text;
  modified text;
  pattern text := $pattern$select[[:space:]]+count\(\*\),[[:space:]]+count\(\*\)[[:space:]]+filter[[:space:]]+\([[:space:]]+where[[:space:]]+r\.customer_key[[:space:]]+=[[:space:]]+p_customer_key[[:space:]]+\)[[:space:]]+into[[:space:]]+v_global_uses,[[:space:]]+v_customer_uses[[:space:]]+from[[:space:]]+public\.serenity_coupon_redemptions[[:space:]]+as[[:space:]]+r[[:space:]]+join[[:space:]]+public\.serenity_orders[[:space:]]+as[[:space:]]+o[[:space:]]+on[[:space:]]+o\.id[[:space:]]+=[[:space:]]+r\.order_id[[:space:]]+where[[:space:]]+r\.coupon_id[[:space:]]+=[[:space:]]+v_coupon\.id[[:space:]]+and[[:space:]]+\([[:space:]]+p_request[[:space:]]+is[[:space:]]+null[[:space:]]+or[[:space:]]+r\.order_id[[:space:]]+<>[[:space:]]+p_request[[:space:]]+\)[[:space:]]+and[[:space:]]+\([[:space:]]+r\.state[[:space:]]+=[[:space:]]+'used'[[:space:]]+or[[:space:]]+\([[:space:]]+r\.state[[:space:]]+=[[:space:]]+'reserved'[[:space:]]+and[[:space:]]+\([[:space:]]+o\.status[[:space:]]+=[[:space:]]+'paid'[[:space:]]+or[[:space:]]+\([[:space:]]+o\.status[[:space:]]+=[[:space:]]+'pending'[[:space:]]+and[[:space:]]+r\.reserved_until[[:space:]]+>[[:space:]]+now\(\)[[:space:]]+\)[[:space:]]+\)[[:space:]]+\)[[:space:]]+\);$pattern$;
begin
  select prosrc, pg_get_functiondef(oid)
  into source, definition
  from pg_proc
  where oid = 'public.serenity_checkout_coupon_quote(jsonb,text,text,uuid)'::regprocedure;

  if position('serenity_coupon_capacity_v2' in source) > 0 then
    return;
  end if;

  if md5(regexp_replace(source, '[[:space:]]', '', 'g')) <> '8f6c21879592445ec373e18582c89aa4' then
    raise exception 'A função de cupom mudou desde a conferência. Nenhuma alteração foi aplicada.';
  end if;

  modified := regexp_replace(definition, pattern,
    'select global_uses, customer_uses
     into v_global_uses, v_customer_uses
     from public.serenity_coupon_capacity_v2(v_coupon.id, p_customer_key, p_request);');

  if modified = definition or position('serenity_coupon_capacity_v2' in modified) = 0 then
    raise exception 'Não foi possível atualizar a conferência de limites do cupom.';
  end if;

  execute modified;
end;
$migration$;

create or replace function public.serenity_checkout_reserve_coupon_v2(
  p_checkout uuid,
  p_customer_key text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  checkout public.serenity_checkout_sessions_v2%rowtype;
  quote jsonb;
  code text;
  discount bigint;
begin
  perform pg_advisory_xact_lock(7391542026);

  if coalesce(p_customer_key, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'COUPON_INVALID';
  end if;

  select * into checkout
  from public.serenity_checkout_sessions_v2
  where id = p_checkout
  for update;

  if not found then
    raise exception 'CHECKOUT_SESSION_INVALID';
  end if;

  if checkout.state <> 'pending'
    or checkout.order_id is not null
    or exists(select 1 from public.serenity_orders where id = p_checkout)
    or exists(select 1 from public.serenity_checkout_payments_v2
      where checkout_id = p_checkout and blocks_new_attempt)
  then
    raise exception 'CHECKOUT_SESSION_NOT_RESERVABLE';
  end if;

  if checkout.expires_at <= now() + interval '1 minute' then
    raise exception 'CHECKOUT_RESERVATION_EXPIRED';
  end if;

  code := coalesce(checkout.pricing_snapshot->'coupon'->>'code', '');

  if checkout.pricing_mode = 'wholesale' then
    if code <> '' or checkout.discount_cents <> 0 then
      raise exception 'WHOLESALE_COUPON';
    end if;
  elsif code <> '' then
    quote := public.serenity_checkout_coupon_quote(
      checkout.cart_items, code, p_customer_key, checkout.id
    );

    if (quote->>'subtotal_cents')::bigint is distinct from checkout.subtotal_cents
      or (quote->>'discount_cents')::bigint is distinct from checkout.discount_cents
      or (quote->>'total_cents')::bigint + checkout.shipping_cents is distinct from checkout.total_cents
      or quote->'coupon' is distinct from checkout.pricing_snapshot->'coupon'
      or quote->'items' is distinct from checkout.pricing_snapshot->'items'
    then
      raise exception 'PRICE_CHANGED';
    end if;
  elsif checkout.discount_cents <> 0 then
    raise exception 'COUPON_INVALID';
  end if;

  discount := checkout.discount_cents;

  update public.serenity_checkout_coupon_v2
  set state = 'released'
  where checkout_id = checkout.id;

  if discount > 0 then
    insert into public.serenity_checkout_coupon_v2 (
      checkout_id, coupon_id, customer_key,
      discount_cents, coupon_snapshot, state, expires_at
    ) values (
      checkout.id, (quote->'coupon'->>'id')::uuid, p_customer_key,
      discount, quote->'coupon', 'reserved', checkout.expires_at
    )
    on conflict(checkout_id) do update set
      coupon_id = excluded.coupon_id,
      customer_key = excluded.customer_key,
      discount_cents = excluded.discount_cents,
      coupon_snapshot = excluded.coupon_snapshot,
      state = 'reserved',
      expires_at = excluded.expires_at;
  end if;

  return jsonb_build_object('discount_cents', discount);
end;
$function$;

revoke all on function public.serenity_checkout_reserve_coupon_v2(uuid, text)
  from public, anon, authenticated;
grant execute on function public.serenity_checkout_reserve_coupon_v2(uuid, text)
  to service_role;

notify pgrst, 'reload schema';
$lunarity_component_6$;


 -- database/lunarity-base/08-sessoes.sql SHA256 87abef923e250c0ccccd302bdf12dd030434579a5c1ef7c954a027c545aba821
 execute $lunarity_component_7$
-- Rotinas completas revisadas do snapshot de checkout existente; sem fixtures de dados.

create or replace function public.serenity_checkout_stock_review_v2(
  p_items jsonb, p_request uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  previous_request text;
  result jsonb;
begin
  perform pg_advisory_xact_lock(7391542026);
  previous_request := current_setting('serenity.stock_quote_order', true);
  perform set_config('serenity.stock_quote_order', coalesce(p_request::text, ''), true);
  result := public.serenity_checkout_quote(p_items);
  perform set_config('serenity.stock_quote_order', coalesce(previous_request, ''), true);
  return result;
end;
$function$;

-- Reutilizar os cálculos instalados, mudando somente o contexto da reserva.
do $migration$
declare
  original text;
  replacement text;
  source_signature text;
  source_name text;
  target_name text;
begin
  for source_signature, source_name, target_name in
    select * from (values
      ('public.serenity_checkout_coupon_quote(jsonb,text,text,uuid)',
       'serenity_checkout_coupon_quote', 'serenity_checkout_coupon_quote_v2'),
      ('public.serenity_wholesale_stock_review(uuid,jsonb,uuid)',
       'serenity_wholesale_stock_review', 'serenity_wholesale_stock_review_v2')
    ) as functions(signature, source_function, target_function)
  loop
    original := pg_get_functiondef(source_signature::regprocedure);
    if position('public.serenity_stock_review(' in original) = 0 then
      raise exception 'A função % mudou. Nenhuma alteração foi aplicada.', source_name;
    end if;
    if source_name = 'serenity_checkout_coupon_quote'
      and position('serenity_coupon_capacity_v2' in original) = 0 then
      raise exception 'A etapa de reserva de cupons precisa estar instalada.';
    end if;
    replacement := replace(original,
      'FUNCTION public.' || source_name || '(',
      'FUNCTION public.' || target_name || '(');
    replacement := replace(replacement,
      'public.serenity_stock_review(', 'public.serenity_checkout_stock_review_v2(');
    if replacement = original or
      position('FUNCTION public.' || target_name || '(' in replacement) = 0 then
      raise exception 'Não foi possível preparar os cálculos do checkout.';
    end if;
    execute replacement;
  end loop;

  original := pg_get_functiondef(
    'public.serenity_checkout_reserve_coupon_v2(uuid,text)'::regprocedure);
  if position('public.serenity_checkout_coupon_quote(' in original) > 0 then
    execute replace(original, 'public.serenity_checkout_coupon_quote(',
      'public.serenity_checkout_coupon_quote_v2(');
  elsif position('public.serenity_checkout_coupon_quote_v2(' in original) = 0 then
    raise exception 'A função de reserva de cupom está diferente da esperada.';
  end if;
end;
$migration$;

create or replace function public.serenity_checkout_context_v2(
  p_checkout uuid, p_access_hash text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  checkout public.serenity_checkout_sessions_v2%rowtype;
  attempts jsonb;
  number bigint;
begin
  if p_checkout is null or coalesce(p_access_hash, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'CHECKOUT_ACCESS_INVALID';
  end if;
  select * into checkout
  from public.serenity_checkout_sessions_v2
  where id = p_checkout and access_hash = p_access_hash
    and access_expires_at > now();
  if not found then
    raise exception 'CHECKOUT_ACCESS_INVALID';
  end if;

  select coalesce(jsonb_agg(a.snapshot order by a.created_at desc, a.id), '[]'::jsonb)
  into attempts
  from (
    select id, created_at, jsonb_build_object(
      'id', id, 'method', method, 'state', state,
      'application_state', application_state,
      'blocks_new_attempt', blocks_new_attempt,
      'pix_code', case when state = 'pending' then pix_code end,
      'pix_qr_base64', case when state = 'pending' then pix_qr_base64 end,
      'expires_at', expires_at
    ) as snapshot
    from public.serenity_checkout_payments_v2
    where checkout_id = checkout.id
    order by created_at desc, id
    limit 10
  ) a;

  if checkout.order_id is not null then
    select o.number into number
    from public.serenity_orders o where o.id = checkout.order_id;
  end if;

  return jsonb_build_object(
    'checkout_id', checkout.id, 'state', checkout.state,
    'environment', checkout.environment, 'pricing_mode', checkout.pricing_mode,
    'total_cents', checkout.total_cents,
    'shipping_pending', checkout.shipping_pending,
    'reserved_until', checkout.expires_at,
    'order_id', checkout.order_id, 'order_number', number,
    'attempts', attempts
  );
end;
$function$;

create or replace function public.serenity_checkout_start_v2(
  p_id uuid, p_fingerprint text, p_access_hash text, p_environment text,
  p_user uuid, p_items jsonb, p_customer jsonb, p_address jsonb,
  p_expected bigint, p_cart_hash text, p_shipping uuid,
  p_coupon text, p_customer_key text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  existing public.serenity_checkout_sessions_v2%rowtype;
  delivery public.serenity_shipping_quotes%rowtype;
  context jsonb;
  quote jsonb;
  customer jsonb;
  address jsonb;
  mode text := 'retail';
  code text := upper(btrim(coalesce(p_coupon, '')));
  subtotal bigint;
  discount bigint;
  amount bigint;
  previous_user text;
  field text;
begin
  perform pg_advisory_xact_lock(7391542026);

  if p_id is null or p_shipping is null
    or coalesce(p_fingerprint, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_access_hash, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_cart_hash, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_customer_key, '') !~ '^[a-f0-9]{64}$'
    or p_environment is null or p_environment not in ('test', 'production')
    or p_expected is null or p_expected not between 1 and 9007199254740991
  then
    raise exception 'INVALID_REQUEST';
  end if;

  if jsonb_typeof(p_customer) is distinct from 'object'
    or jsonb_typeof(p_address) is distinct from 'object' then
    raise exception 'INVALID_CUSTOMER';
  end if;

  foreach field in array array['name', 'email', 'phone', 'document']
  loop
    if jsonb_typeof(p_customer->field) is distinct from 'string'
      or (p_customer->>field) ~ '[[:cntrl:]]' then
      raise exception 'INVALID_CUSTOMER';
    end if;
  end loop;

  foreach field in array array['cep', 'street', 'number', 'complement', 'district', 'city', 'state']
  loop
    if jsonb_typeof(p_address->field) is distinct from 'string'
      or (p_address->>field) ~ '[[:cntrl:]]' then
      raise exception 'INVALID_CUSTOMER';
    end if;
  end loop;

  if length(btrim(p_customer->>'name')) not between 1 and 180
    or length(p_customer->>'email') not between 3 and 254
    or (p_customer->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or (p_customer->>'phone') !~ '^[0-9]{10,11}$'
    or public.serenity_checkout_document_valid(p_customer->>'document') is distinct from true
    or (p_address->>'cep') !~ '^[0-9]{8}$'
    or (p_address->>'state') not in (
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
      'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')
    or length(btrim(p_address->>'street')) not between 1 and 180
    or length(btrim(p_address->>'number')) not between 1 and 30
    or length(btrim(p_address->>'district')) not between 1 and 100
    or length(btrim(p_address->>'city')) not between 1 and 100
    or length(p_address->>'complement') > 180
  then
    raise exception 'INVALID_CUSTOMER';
  end if;

  customer := jsonb_build_object(
    'name', btrim(p_customer->>'name'), 'email', lower(p_customer->>'email'),
    'phone', p_customer->>'phone', 'document', p_customer->>'document');
  address := jsonb_build_object(
    'cep', p_address->>'cep', 'street', btrim(p_address->>'street'),
    'number', btrim(p_address->>'number'), 'complement', btrim(p_address->>'complement'),
    'district', btrim(p_address->>'district'), 'city', btrim(p_address->>'city'),
    'state', p_address->>'state');

  select * into existing from public.serenity_checkout_sessions_v2
  where id = p_id for update;
  if found then
    if existing.fingerprint is distinct from p_fingerprint
      or existing.access_hash is distinct from p_access_hash
      or existing.environment is distinct from p_environment
      or existing.account_user_id is distinct from p_user
      or existing.cart_items is distinct from p_items
      or existing.customer_snapshot is distinct from customer
      or existing.delivery_address is distinct from address
      or existing.total_cents is distinct from p_expected
      or existing.shipping_quote_id is distinct from p_shipping
      or coalesce(existing.pricing_snapshot->'coupon'->>'code', '') is distinct from code
    then
      raise exception 'REQUEST_CHANGED';
    end if;
    return public.serenity_checkout_context_v2(p_id, p_access_hash);
  end if;

  if exists(select 1 from public.serenity_orders where id = p_id) then
    raise exception 'REQUEST_CHANGED';
  end if;

  if p_user is not null then
    if not exists(select 1 from auth.users where id = p_user and email_confirmed_at is not null) then
      raise exception 'CUSTOMER_ACCOUNT_UNAVAILABLE';
    end if;
    context := public.serenity_wholesale_context(p_user);
    if (context->>'active')::boolean is true then mode := 'wholesale'; end if;
  end if;

  previous_user := current_setting('serenity.wholesale_user', true);
  if mode = 'wholesale' then
    if code <> '' then raise exception 'WHOLESALE_COUPON'; end if;
    quote := public.serenity_wholesale_stock_review_v2(p_user, p_items, p_id);
    if (quote->'wholesale'->>'minimum_met')::boolean is distinct from true then
      raise exception 'WHOLESALE_MINIMUM';
    end if;
  else
    perform set_config('serenity.wholesale_user', '', true);
    quote := public.serenity_checkout_coupon_quote_v2(p_items, code, p_customer_key, p_id);
  end if;
  perform set_config('serenity.wholesale_user', coalesce(previous_user, ''), true);

  subtotal := (quote->>'subtotal_cents')::bigint;
  discount := (quote->>'discount_cents')::bigint;

  select * into delivery from public.serenity_shipping_quotes
  where id = p_shipping for update;
  if not found
    or delivery.request_id is distinct from p_id
    or delivery.cart_hash is distinct from p_cart_hash
    or delivery.destination is distinct from address->>'cep'
    or delivery.expires_at <= now() or not isfinite(delivery.expires_at)
    or delivery.consumed_by is not null
    or delivery.settings_version is distinct from (
      select version from public.serenity_shipping_settings where singleton)
    or exists(select 1 from public.serenity_checkout_sessions_v2 where shipping_quote_id = p_shipping)
  then
    raise exception 'SHIPPING_QUOTE_EXPIRED';
  end if;

  if mode = 'wholesale' then
    if delivery.snapshot->>'pricing_mode' is distinct from 'wholesale'
      or delivery.snapshot->'wholesale'->>'user_id' is distinct from p_user::text
      or delivery.snapshot->'wholesale'->>'settings_version' is distinct from context->>'settings_version'
      or delivery.snapshot->'wholesale'->>'account_version' is distinct from context->>'account_version'
      or delivery.snapshot->'wholesale'->>'discount_percent' is distinct from context->>'discount_percent'
    then raise exception 'SHIPPING_QUOTE_EXPIRED'; end if;
  elsif coalesce(delivery.snapshot->>'pricing_mode', 'retail') <> 'retail' then
    raise exception 'SHIPPING_QUOTE_EXPIRED';
  end if;

  amount := (quote->>'total_cents')::bigint + delivery.amount_cents;
  if subtotal is null or discount is null or amount is distinct from p_expected
    or delivery.subtotal_cents is distinct from subtotal then
    raise exception 'PRICE_CHANGED';
  end if;

  insert into public.serenity_checkout_sessions_v2 (
    id, fingerprint, access_hash, environment, account_user_id, pricing_mode,
    customer_snapshot, delivery_address, cart_items, order_items, pricing_snapshot,
    shipping_quote_id, shipping_snapshot, shipping_pending,
    subtotal_cents, discount_cents, shipping_cents, total_cents,
    expires_at, access_expires_at
  ) values (
    p_id, p_fingerprint, p_access_hash, p_environment, p_user, mode,
    customer, address, p_items, quote->'items', quote,
    delivery.id, delivery.snapshot || jsonb_build_object(
      'manual', delivery.manual, 'quote_id', delivery.id,
      'amount_cents', delivery.amount_cents, 'quoted_at', delivery.created_at,
      'quote_expires_at', delivery.expires_at), delivery.manual,
    subtotal, discount, delivery.amount_cents, amount,
    now() + interval '30 minutes', now() + interval '24 hours'
  );

  perform public.serenity_checkout_reserve_stock_v2(p_id);
  perform public.serenity_checkout_reserve_coupon_v2(p_id, p_customer_key);
  return public.serenity_checkout_context_v2(p_id, p_access_hash);
end;
$function$;

revoke all on function public.serenity_checkout_stock_review_v2(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.serenity_checkout_coupon_quote_v2(jsonb, text, text, uuid) from public, anon, authenticated;
revoke all on function public.serenity_wholesale_stock_review_v2(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.serenity_checkout_context_v2(uuid, text) from public, anon, authenticated;
revoke all on function public.serenity_checkout_start_v2(uuid, text, text, text, uuid, jsonb, jsonb, jsonb, bigint, text, uuid, text, text) from public, anon, authenticated;

grant execute on function public.serenity_checkout_stock_review_v2(jsonb, uuid) to service_role;
grant execute on function public.serenity_checkout_coupon_quote_v2(jsonb, text, text, uuid) to service_role;
grant execute on function public.serenity_wholesale_stock_review_v2(uuid, jsonb, uuid) to service_role;
grant execute on function public.serenity_checkout_context_v2(uuid, text) to service_role;
grant execute on function public.serenity_checkout_start_v2(uuid, text, text, text, uuid, jsonb, jsonb, jsonb, bigint, text, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
$lunarity_component_7$;


 -- database/lunarity-base/09-tentativas.sql SHA256 fdfa903e016ae03082a1d9caabadc9ac9fe8c09434923d0d83c20d867c5cb7e4
 execute $lunarity_component_8$
-- Rotinas completas revisadas do snapshot de checkout existente; sem fixtures de dados.

-- Uma resposta incerta mantém a reserva até o prazo já concedido.
do $migration$
declare
  signature text;
  definition text;
  modified text;
  matches integer;
  expected integer;
  pattern text := $pattern$c[.]state[[:space:]]+in[[:space:]]*\('pending',[[:space:]]*'payment_pending'\)$pattern$;
begin
  for signature, expected in
    select * from (values
      ('public.serenity_stock_assert(uuid,jsonb)', 2),
      ('public.serenity_coupon_capacity_v2(uuid,text,uuid)', 1)
    ) as functions(signature, expected_matches)
  loop
    definition := pg_get_functiondef(signature::regprocedure);
    if position('c.state in (''pending'', ''payment_pending'', ''review'')' in definition) > 0 then
      continue;
    end if;
    select count(*) into matches from regexp_matches(definition, pattern, 'gi');
    if matches <> expected then
      raise exception 'A conferência de reservas mudou. Nenhuma alteração foi aplicada.';
    end if;
    modified := regexp_replace(definition, pattern,
      'c.state in (''pending'', ''payment_pending'', ''review'')', 'gi');
    execute modified;
  end loop;
end;
$migration$;

create or replace function public.serenity_checkout_claim_pix_v2(
  p_checkout uuid,
  p_access_hash text,
  p_attempt uuid,
  p_merchant text,
  p_request_hash text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  checkout public.serenity_checkout_sessions_v2%rowtype;
  attempt public.serenity_checkout_payments_v2%rowtype;
  coupon_hold public.serenity_checkout_coupon_v2%rowtype;
  coupon public.serenity_coupons%rowtype;
  capacity record;
  context jsonb;
  lease uuid;
  payment_expires timestamptz;
  reserve_expires timestamptz;
  snapshot jsonb;
begin
  perform pg_advisory_xact_lock(7391542026);
  perform public.serenity_checkout_context_v2(p_checkout, p_access_hash);

  if p_attempt is null
    or coalesce(p_merchant, '') !~ '^[0-9]{1,40}$'
    or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'PAYMENT_REQUEST_INVALID';
  end if;

  select * into checkout
  from public.serenity_checkout_sessions_v2
  where id = p_checkout for update;

  select * into attempt
  from public.serenity_checkout_payments_v2
  where id = p_attempt for update;

  if found then
    if attempt.checkout_id is distinct from checkout.id
      or attempt.environment is distinct from checkout.environment
      or attempt.merchant_id is distinct from p_merchant
      or attempt.method is distinct from 'pix'
      or attempt.request_hash is distinct from p_request_hash
      or attempt.amount_cents is distinct from checkout.total_cents then
      raise exception 'PAYMENT_REQUEST_CHANGED';
    end if;

    if attempt.state = 'submitting'
      and (attempt.lease_expires_at is null or attempt.lease_expires_at <= now()) then
      update public.serenity_checkout_payments_v2
      set state = 'uncertain', application_state = 'review',
        last_error_code = 'MP_SUBMISSION_UNCERTAIN',
        lease_id = null, lease_expires_at = null, updated_at = now()
      where id = attempt.id;
      update public.serenity_checkout_sessions_v2
      set state = 'review', updated_at = now()
      where id = checkout.id and state in ('pending', 'payment_pending');
      return jsonb_build_object('submit', false, 'state', 'uncertain');
    end if;

    if attempt.state <> 'created' then
      return jsonb_build_object('submit', false, 'state', attempt.state);
    end if;
    if not attempt.blocks_new_attempt or attempt.application_state <> 'pending' then
      raise exception 'PAYMENT_ATTEMPT_UNAVAILABLE';
    end if;
  end if;

  if checkout.state not in ('pending', 'payment_pending')
    or checkout.order_id is not null
    or checkout.shipping_pending
    or exists(select 1 from public.serenity_orders where id = checkout.id) then
    raise exception 'PAYMENT_CHECKOUT_UNAVAILABLE';
  end if;
  if checkout.expires_at <= now() + interval '1 minute' then
    raise exception 'PAYMENT_RESERVATION_EXPIRED';
  end if;
  if exists (
    select 1 from public.serenity_checkout_payments_v2
    where checkout_id = checkout.id and id <> p_attempt
      and (blocks_new_attempt or application_state = 'review'
        or state in ('approved', 'refunded', 'charged_back'))
  ) then
    raise exception 'PAYMENT_ALREADY_STARTED';
  end if;

  if checkout.pricing_mode = 'wholesale' then
    context := public.serenity_wholesale_context(checkout.account_user_id);
    if (context->>'active')::boolean is distinct from true
      or context->>'settings_version' is distinct from checkout.pricing_snapshot->'wholesale'->>'settings_version'
      or context->>'account_version' is distinct from checkout.pricing_snapshot->'wholesale'->>'account_version'
      or context->>'discount_percent' is distinct from checkout.pricing_snapshot->'wholesale'->>'discount_percent'
      or context->>'minimum_products_cents' is distinct from checkout.pricing_snapshot->'wholesale'->>'minimum_products_cents' then
      raise exception 'WHOLESALE_UNAVAILABLE';
    end if;
  end if;

  select * into coupon_hold
  from public.serenity_checkout_coupon_v2
  where checkout_id = checkout.id for update;

  if checkout.discount_cents > 0 then
    if coupon_hold.checkout_id is null or coupon_hold.state <> 'reserved'
      or coupon_hold.expires_at <= now()
      or coupon_hold.discount_cents is distinct from checkout.discount_cents
      or coupon_hold.coupon_snapshot is distinct from checkout.pricing_snapshot->'coupon' then
      raise exception 'COUPON_RESERVATION';
    end if;

    select * into coupon from public.serenity_coupons
    where id = coupon_hold.coupon_id for update;
    if not found or coupon.status <> 'active'
      or (coupon.starts_at is not null and coupon.starts_at > now())
      or (coupon.ends_at is not null and coupon.ends_at <= now()) then
      raise exception 'COUPON_UNAVAILABLE';
    end if;

    select * into capacity from public.serenity_coupon_capacity_v2(
      coupon.id, coupon_hold.customer_key, checkout.id);
    if coupon.max_uses is not null and capacity.global_uses >= coupon.max_uses then
      raise exception 'COUPON_LIMIT';
    end if;
    if coupon.max_uses_per_customer is not null
      and capacity.customer_uses >= coupon.max_uses_per_customer then
      raise exception 'COUPON_CUSTOMER_LIMIT';
    end if;
  end if;

  if attempt.id is null then
    payment_expires := now() + interval '32 minutes';
    reserve_expires := least(
      greatest(checkout.expires_at, now() + interval '35 minutes'),
      checkout.created_at + interval '60 minutes');
    if reserve_expires <= payment_expires + interval '1 minute' then
      raise exception 'PAYMENT_RESERVATION_EXPIRED';
    end if;
  else
    payment_expires := attempt.expires_at;
    reserve_expires := checkout.expires_at;
    if payment_expires is null or payment_expires <= now() + interval '1 minute'
      or reserve_expires <= payment_expires + interval '1 minute' then
      raise exception 'PAYMENT_RESERVATION_EXPIRED';
    end if;
  end if;

  perform public.serenity_checkout_reserve_stock_v2(checkout.id);

  update public.serenity_checkout_sessions_v2
  set state = 'payment_pending', expires_at = reserve_expires, updated_at = now()
  where id = checkout.id;
  update public.serenity_checkout_stock_v2
  set expires_at = reserve_expires
  where checkout_id = checkout.id and state = 'active';
  update public.serenity_checkout_coupon_v2
  set expires_at = reserve_expires
  where checkout_id = checkout.id and state = 'reserved';

  lease := gen_random_uuid();
  if attempt.id is null then
    insert into public.serenity_checkout_payments_v2 (
      id, checkout_id, environment, merchant_id, method,
      request_hash, amount_cents, state, expires_at,
      lease_id, lease_expires_at
    ) values (
      p_attempt, checkout.id, checkout.environment, p_merchant, 'pix',
      p_request_hash, checkout.total_cents, 'submitting', payment_expires,
      lease, now() + interval '45 seconds'
    );
  else
    update public.serenity_checkout_payments_v2
    set state = 'submitting', lease_id = lease,
      lease_expires_at = now() + interval '45 seconds', updated_at = now()
    where id = attempt.id;
  end if;

  snapshot := jsonb_build_object('state', 'submitting', 'expires_at', payment_expires);
  insert into public.serenity_checkout_payment_events_v2 (
    attempt_id, source, event_key, snapshot
  ) values (
    p_attempt, 'create', encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex'), snapshot
  ) on conflict(attempt_id, event_key) do nothing;

  -- Contém dados do pagador. Usar somente no servidor.
  return jsonb_build_object(
    'submit', true, 'state', 'submitting', 'lease_id', lease,
    'checkout_id', checkout.id, 'attempt_id', p_attempt,
    'environment', checkout.environment, 'merchant_id', p_merchant,
    'amount_cents', checkout.total_cents, 'currency', 'BRL', 'method', 'pix',
    'expires_at', payment_expires, 'reserved_until', reserve_expires,
    'customer', checkout.customer_snapshot
  );
end;
$function$;

create or replace function public.serenity_checkout_pix_uncertain_v2(
  p_attempt uuid, p_lease uuid, p_request_hash text, p_code text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  attempt public.serenity_checkout_payments_v2%rowtype;
  snapshot jsonb;
begin
  perform pg_advisory_xact_lock(7391542026);
  if p_attempt is null or p_lease is null
    or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_code, '') !~ '^MP_[A-Z0-9_]{1,70}$' then
    raise exception 'PAYMENT_REQUEST_INVALID';
  end if;
  select * into attempt from public.serenity_checkout_payments_v2
  where id = p_attempt for update;
  if not found or attempt.request_hash is distinct from p_request_hash then
    raise exception 'PAYMENT_REQUEST_CHANGED';
  end if;
  if attempt.state <> 'submitting' then
    return jsonb_build_object('state', attempt.state);
  end if;
  if attempt.lease_id is distinct from p_lease
    or attempt.provider_payment_id is not null then
    raise exception 'PAYMENT_LEASE_INVALID';
  end if;

  update public.serenity_checkout_payments_v2
  set state = 'uncertain', blocks_new_attempt = true, application_state = 'review',
    last_error_code = p_code, lease_id = null, lease_expires_at = null, updated_at = now()
  where id = attempt.id;
  update public.serenity_checkout_sessions_v2
  set state = 'review', updated_at = now()
  where id = attempt.checkout_id and state in ('pending', 'payment_pending');

  snapshot := jsonb_build_object('state', 'uncertain', 'error_code', p_code);
  insert into public.serenity_checkout_payment_events_v2 (
    attempt_id, source, event_key, snapshot
  ) values (
    attempt.id, 'create', encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex'), snapshot
  ) on conflict(attempt_id, event_key) do nothing;
  return jsonb_build_object('state', 'uncertain');
end;
$function$;

revoke all on function public.serenity_checkout_claim_pix_v2(uuid, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.serenity_checkout_pix_uncertain_v2(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.serenity_checkout_claim_pix_v2(uuid, text, uuid, text, text)
  to service_role;
grant execute on function public.serenity_checkout_pix_uncertain_v2(uuid, uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';
$lunarity_component_8$;


 -- database/lunarity-base/10-confirmacao.sql SHA256 e2b74c20240b437501040af6a9db3825827d771b1e129f00e7f687eb83e0ea2a
 execute $lunarity_component_9$
-- Rotinas completas revisadas do snapshot de checkout existente; sem fixtures de dados.

create or replace function public.serenity_checkout_complete_order_v2(p_attempt uuid)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  attempt public.serenity_checkout_payments_v2%rowtype;
  checkout public.serenity_checkout_sessions_v2%rowtype;
  existing public.serenity_orders%rowtype;
  coupon_hold public.serenity_checkout_coupon_v2%rowtype;
  coupon public.serenity_coupons%rowtype;
  product public.products%rowtype;
  variant public.product_variants%rowtype;
  capacity record;
  customer_id uuid;
  item jsonb;
  entries jsonb := '[]'::jsonb;
  wanted jsonb;
  held jsonb;
  qty integer;
  unit numeric;
  fee numeric;
  unit_cost numeric;
  supplier text;
  color text;
  color_name text;
  subtotal numeric := 0;
  costs numeric := 0;
  missing integer := 0;
  shipping_snapshot jsonb;
begin
  perform pg_advisory_xact_lock(7391542026);
  select * into attempt from public.serenity_checkout_payments_v2
  where id = p_attempt for update;
  if not found or attempt.state <> 'approved'
    or attempt.provider_status <> 'approved' or attempt.environment <> 'production'
    or attempt.provider_payment_id is null or attempt.refunded_cents <> 0 then
    raise exception 'PAYMENT_APPROVAL_REQUIRED';
  end if;

  select * into checkout from public.serenity_checkout_sessions_v2
  where id = attempt.checkout_id for update;
  if not found or checkout.environment <> 'production'
    or checkout.total_cents is distinct from attempt.amount_cents
    or checkout.shipping_pending then
    raise exception 'PAYMENT_CHECKOUT_UNAVAILABLE';
  end if;

  if checkout.order_id is not null then
    select * into existing from public.serenity_orders where id = checkout.order_id;
    if not found or existing.source <> 'site' or existing.status is distinct from 'paid'
      or existing.checkout_fingerprint is distinct from checkout.fingerprint
      or existing.total * 100 is distinct from checkout.total_cents::numeric
      or existing.shipping_details->'payment'->>'attempt_id' is distinct from attempt.id::text then
      raise exception 'PAYMENT_ORDER_CONFLICT';
    end if;
    return existing.id;
  end if;

  if checkout.state not in ('pending', 'payment_pending', 'review')
    or checkout.expires_at <= now()
    or exists(select 1 from public.serenity_orders where id = checkout.id) then
    raise exception 'PAYMENT_RESERVATION_EXPIRED';
  end if;
  if exists(select 1 from public.serenity_checkout_payments_v2
    where checkout_id = checkout.id and id <> attempt.id
      and (blocks_new_attempt or application_state = 'review'
        or state in ('approved', 'refunded', 'charged_back'))) then
    raise exception 'PAYMENT_ORDER_CONFLICT';
  end if;

  select jsonb_object_agg(entity_key, quantity) into wanted
  from (
    select coalesce(nullif(x->>'variant_id', ''), 'product:' || (x->>'product_id')) as entity_key,
      sum((x->>'quantity')::integer) as quantity
    from jsonb_array_elements(checkout.order_items) x group by 1
  ) expected;
  select jsonb_object_agg(entity_key, quantity) into held
  from public.serenity_checkout_stock_v2
  where checkout_id = checkout.id and state = 'active';
  if wanted is null or wanted is distinct from held
    or exists(select 1 from public.serenity_checkout_stock_v2
      where checkout_id = checkout.id and state = 'active' and expires_at <= now()) then
    raise exception 'PAYMENT_RESERVATION_EXPIRED';
  end if;
  perform public.serenity_stock_assert(checkout.id, checkout.order_items);

  if checkout.discount_cents > 0 then
    select * into coupon_hold from public.serenity_checkout_coupon_v2
    where checkout_id = checkout.id for update;
    if not found or coupon_hold.state <> 'reserved' or coupon_hold.expires_at <= now()
      or coupon_hold.discount_cents is distinct from checkout.discount_cents
      or coupon_hold.coupon_snapshot is distinct from checkout.pricing_snapshot->'coupon' then
      raise exception 'COUPON_RESERVATION';
    end if;
    select * into coupon from public.serenity_coupons where id = coupon_hold.coupon_id for update;
    if not found then raise exception 'COUPON_UNAVAILABLE'; end if;
    select * into capacity from public.serenity_coupon_capacity_v2(
      coupon.id, coupon_hold.customer_key, checkout.id);
    if coupon.max_uses is not null and capacity.global_uses >= coupon.max_uses then
      raise exception 'COUPON_LIMIT';
    end if;
    if coupon.max_uses_per_customer is not null
      and capacity.customer_uses >= coupon.max_uses_per_customer then
      raise exception 'COUPON_CUSTOMER_LIMIT';
    end if;
  end if;

  if checkout.account_user_id is not null then
    select a.customer_id into customer_id from public.serenity_customer_accounts a
    where a.user_id = checkout.account_user_id;
    if customer_id is null then raise exception 'CUSTOMER_ACCOUNT_UNAVAILABLE'; end if;
  else
    customer_id := checkout.id;
    insert into public.serenity_customers(id, name, email, phone)
    values(customer_id, checkout.customer_snapshot->>'name',
      checkout.customer_snapshot->>'email', checkout.customer_snapshot->>'phone');
  end if;

  for item in select value from jsonb_array_elements(checkout.order_items)
  loop
    select * into product from public.products where id = (item->>'product_id')::uuid;
    if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    variant := null;
    if nullif(item->>'variant_id', '') is not null then
      select * into variant from public.product_variants
      where id = (item->>'variant_id')::uuid and product_id = product.id;
      if not found then raise exception 'VARIANT_UNAVAILABLE'; end if;
    end if;
    qty := (item->>'quantity')::integer;
    unit := (item->>'unit_price')::numeric;
    fee := (item->>'fee')::numeric;
    if qty is null or qty <= 0 or unit is null or fee is null
      or unit::text in ('NaN', 'Infinity', '-Infinity')
      or fee not in (0, 15) or unit < 0 or unit <> round(unit, 2) then
      raise exception 'PAYMENT_AMOUNT_CHANGED';
    end if;
    if coalesce((item->>'sterilization_fee')::numeric,0) not in(0,5,10)
      or coalesce((item->>'stem_fee')::numeric,0) not in(0,5)
      or (coalesce((item->>'stem_fee')::numeric,0)>0 and coalesce(item->>'stem','') not in('4','6','8','10'))
      or (coalesce((item->>'sterilization_fee')::numeric,0)>0 and item->>'sterilized' is distinct from 'true')
    then raise exception 'PAYMENT_AMOUNT_CHANGED';end if;
    color := coalesce(item->>'color', '');
    color_name := ('{"12":"Bronze Claro","15":"Bronze Escuro","18":"Berinjela","20":"Roxo Escuro","22":"Roxo","25":"Azul Escuro","28":"Azul","30":"Azul Médio","33":"Azul Céu","36":"Azul Claro","40":"Azul Gelo","42":"Azul Prateado","48":"Amarelo Pálido","55":"Amarelo Claro","61":"Amarelo","64":"Dourado","70":"Rose Gold","72":"Rosa Claro","75":"Rosa","80":"Fúcsia","85":"Fúcsia Escuro","90":"Roxo Vibrante","92":"Roxo Azulado","95":"Roxo Petróleo","103":"Verde Azulado","105":"Verde"}'::jsonb)->>color;
    if (color = '' and fee <> 0) or (color <> '' and (color_name is null or fee not in (0,15))) then
      raise exception 'INVALID_ANODIZATION';
    end if;

    unit_cost := null;
    supplier := null;
    -- Optional costs: read known JSON keys without assuming an older commercial schema.
    select nullif(to_jsonb(c)->>'unit_cost','')::numeric,to_jsonb(c)->>'supplier_name'
    into unit_cost,supplier from public.serenity_product_commercial c
    where to_jsonb(c)->>'entity_key' in ('product:'||product.id::text,'variant:'||variant.id::text)
    order by (to_jsonb(c)->>'variant_id' is not null and to_jsonb(c)->>'unit_cost' is not null) desc,
      (to_jsonb(c)->>'unit_cost' is not null) desc limit 1;
    if unit_cost is null then missing := missing + qty;
    elsif unit_cost::text in ('NaN', 'Infinity', '-Infinity') or unit_cost < 0 then
      raise exception 'INVALID_COST';
    else costs := costs + unit_cost * qty;
    end if;
    subtotal := subtotal + (unit + fee + coalesce((item->>'sterilization_fee')::numeric,0) + coalesce((item->>'stem_fee')::numeric,0)) * qty;
    entries := entries || jsonb_build_array(jsonb_build_object(
      'product_id', product.id, 'variant_id', variant.id,
      'name', coalesce(item->>'name', product.name), 'variation', item->>'variation',
      'sku', coalesce(variant.sku, product.sku), 'quantity', qty,
      'base_price', unit, 'anodization', color_name, 'voltage', nullif(color, ''),
      'anodization_fee', fee,
      'stem_length_mm',nullif(item->>'stem',''),'stem_fee',coalesce((item->>'stem_fee')::numeric,0),
      'sterilized',item->'sterilized','sterilization_fee',coalesce((item->>'sterilization_fee')::numeric,0), 'unit_price', unit + fee + coalesce((item->>'sterilization_fee')::numeric,0) + coalesce((item->>'stem_fee')::numeric,0),
      'unit_cost', unit_cost, 'supplier', supplier
    ));
  end loop;
  if subtotal * 100 is distinct from checkout.subtotal_cents::numeric then
    raise exception 'PAYMENT_AMOUNT_CHANGED';
  end if;

  shipping_snapshot := checkout.shipping_snapshot || jsonb_build_object(
    'pricing_mode', checkout.pricing_mode,
    'payment', jsonb_build_object('provider', 'mercado_pago',
      'attempt_id', attempt.id, 'payment_id', attempt.provider_payment_id));
  if checkout.pricing_mode = 'wholesale' then
    shipping_snapshot := shipping_snapshot || jsonb_build_object('wholesale',
      checkout.pricing_snapshot->'wholesale' || jsonb_build_object('user_id', checkout.account_user_id));
  end if;

  insert into public.serenity_orders (
    id, customer_id, customer_snapshot, items, subtotal, discount, shipping,
    expenses, total, cost, missing_costs, status, notes, created_by, paid_at,
    source, shipping_pending, delivery_address, checkout_fingerprint,
    shipping_details, account_user_id
  ) values (
    checkout.id, customer_id, checkout.customer_snapshot, entries,
    subtotal, checkout.discount_cents / 100.0, checkout.shipping_cents / 100.0,
    0, checkout.total_cents / 100.0, case when missing = 0 then costs end,
    missing, 'paid', 'Pagamento confirmado pelo Mercado Pago.', null, now(),
    'site', false, checkout.delivery_address, checkout.fingerprint,
    shipping_snapshot, checkout.account_user_id
  );

  -- A função existente é idempotente, inclusive quando chamada pelo trigger.
  perform public.serenity_stock_debit(checkout.id, null);

  if checkout.discount_cents > 0 then
    insert into public.serenity_coupon_redemptions (
      order_id, coupon_id, customer_key, state, discount_cents,
      coupon_snapshot, reserved_until
    ) values (
      checkout.id, coupon_hold.coupon_id, coupon_hold.customer_key, 'used',
      checkout.discount_cents, coupon_hold.coupon_snapshot, null
    );
  end if;
  update public.serenity_shipping_quotes set consumed_by = checkout.id
  where id = checkout.shipping_quote_id and request_id = checkout.id and consumed_by is null;
  if not found then raise exception 'SHIPPING_QUOTE_EXPIRED'; end if;

  update public.serenity_checkout_stock_v2 set state = 'converted'
  where checkout_id = checkout.id and state = 'active';
  update public.serenity_checkout_coupon_v2 set state = 'converted'
  where checkout_id = checkout.id and state = 'reserved';
  update public.serenity_checkout_sessions_v2
  set state = 'converted', order_id = checkout.id, updated_at = now()
  where id = checkout.id;
  return checkout.id;
end;
$function$;

-- Aceita somente fatos normalizados após consulta autenticada ao Mercado Pago.
-- Nunca passar diretamente o corpo recebido de um webhook ou do navegador.
create or replace function public.serenity_checkout_observe_payment_v2(
  p_attempt uuid, p_observation jsonb, p_source text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  attempt public.serenity_checkout_payments_v2%rowtype;
  checkout public.serenity_checkout_sessions_v2%rowtype;
  provider_time timestamptz;
  expiration timestamptz;
  payment_id text;
  status text;
  detail text;
  next_state text;
  amount bigint;
  refunded bigint;
  snapshot jsonb;
  application text := 'pending';
  error_code text := '';
  code text;
  result_order uuid;
  order_status text;
  order_attempt text;
  review boolean := false;
  regressed boolean := false;
  blocker_available boolean;
begin
  perform pg_advisory_xact_lock(7391542026);
  if p_attempt is null or jsonb_typeof(p_observation) is distinct from 'object'
    or p_source is null or p_source not in ('create', 'webhook', 'poll', 'reconcile', 'admin')
    or coalesce(p_observation->>'provider_payment_id', '') !~ '^[0-9]{1,40}$'
    or coalesce(p_observation->>'amount_cents', '') !~ '^[0-9]{1,16}$'
    or coalesce(p_observation->>'refunded_cents', '') !~ '^[0-9]{1,16}$'
    or coalesce(p_observation->>'status', '') !~ '^[a-z_]{1,40}$'
    or length(coalesce(p_observation->>'status_detail', '')) > 120
    or length(coalesce(p_observation->>'pix_code', '')) > 4096
    or length(coalesce(p_observation->>'pix_qr_base64', '')) > 300000
    or coalesce(p_observation->>'pix_qr_base64', '') !~ '^[A-Za-z0-9+/]*={0,2}$' then
    raise exception 'PAYMENT_OBSERVATION_INVALID';
  end if;
  begin
    provider_time := (p_observation->>'updated_at')::timestamptz;
    expiration := nullif(p_observation->>'expires_at', '')::timestamptz;
    if provider_time is null or not isfinite(provider_time)
      or (expiration is not null and not isfinite(expiration)) then
      raise exception 'PAYMENT_OBSERVATION_INVALID';
    end if;
  exception when others then raise exception 'PAYMENT_OBSERVATION_INVALID';
  end;

  select * into attempt from public.serenity_checkout_payments_v2
  where id = p_attempt for update;
  if not found then raise exception 'PAYMENT_ATTEMPT_INVALID'; end if;
  select * into checkout from public.serenity_checkout_sessions_v2
  where id = attempt.checkout_id for update;

  blocker_available := not exists(
    select 1 from public.serenity_checkout_payments_v2
    where checkout_id = checkout.id and id <> attempt.id and blocks_new_attempt
  );

  payment_id := p_observation->>'provider_payment_id';
  amount := (p_observation->>'amount_cents')::bigint;
  refunded := (p_observation->>'refunded_cents')::bigint;
  status := p_observation->>'status';
  detail := coalesce(p_observation->>'status_detail', '');
  if p_observation->>'environment' is distinct from attempt.environment
    or p_observation->>'merchant_id' is distinct from attempt.merchant_id
    or p_observation->>'external_reference' is distinct from checkout.id::text
    or p_observation->>'attempt_id' is distinct from attempt.id::text
    or p_observation->>'method' is distinct from attempt.method
    or p_observation->>'currency' is distinct from attempt.currency
    or amount is distinct from attempt.amount_cents or refunded > amount
    or exists(select 1 from public.serenity_checkout_payments_v2
      where id <> attempt.id and environment = attempt.environment
        and merchant_id = attempt.merchant_id and provider_payment_id = payment_id) then
    raise exception 'PAYMENT_OBSERVATION_MISMATCH';
  end if;

  snapshot := jsonb_build_object(
    'provider_payment_id', payment_id, 'status', status, 'status_detail', detail,
    'amount_cents', amount, 'refunded_cents', refunded,
    'updated_at', provider_time, 'expires_at', expiration);
  insert into public.serenity_checkout_payment_events_v2(attempt_id, source, event_key, snapshot)
  values(attempt.id, p_source, encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex'), snapshot)
  on conflict(attempt_id, event_key) do nothing;

  if attempt.provider_payment_id is not null and attempt.provider_payment_id <> payment_id then
    update public.serenity_checkout_payments_v2
    set application_state = 'review', blocks_new_attempt = blocker_available,
      last_error_code = 'PAYMENT_PROVIDER_CONFLICT', updated_at = now()
    where id = attempt.id;
    update public.serenity_checkout_sessions_v2 set state = 'review', updated_at = now()
    where id = checkout.id and order_id is null;
    return jsonb_build_object('state', attempt.state, 'application_state', 'review');
  end if;
  if attempt.provider_updated_at is not null and provider_time < attempt.provider_updated_at then
    return jsonb_build_object('state', attempt.state, 'application_state', attempt.application_state);
  end if;

  next_state := case
    when status = 'charged_back' then 'charged_back'
    when refunded = amount then 'refunded'
    when status = 'approved' then 'approved'
    when status = 'rejected' then 'rejected'
    when status in ('cancelled', 'canceled') then 'cancelled'
    when status in ('pending', 'in_process', 'authorized', 'in_mediation') then 'pending'
    else 'uncertain' end;
  refunded := greatest(refunded, attempt.refunded_cents);
  if refunded = amount and next_state <> 'charged_back' then next_state := 'refunded'; end if;

  if (attempt.state = 'approved' and next_state in ('pending', 'rejected', 'cancelled', 'uncertain'))
    or (attempt.state = 'refunded' and next_state not in ('refunded', 'charged_back'))
    or (attempt.state = 'charged_back' and next_state <> 'charged_back') then
    next_state := attempt.state;
    regressed := true;
  end if;
  if regressed or (p_observation->>'refunded_cents')::bigint < attempt.refunded_cents then
    review := true; error_code := 'PAYMENT_STATE_REGRESSION';
  elsif status = 'in_mediation' or next_state in ('charged_back', 'uncertain')
    or (refunded > 0 and refunded < amount) then
    review := true; error_code := 'PAYMENT_FINANCIAL_REVIEW';
  end if;
  if next_state = 'pending' and attempt.method = 'pix'
    and (expiration is null or expiration > checkout.expires_at - interval '1 minute'
      or expiration <= now()) then
    review := true; error_code := 'PAYMENT_EXPIRY_UNSAFE';
  end if;

  if next_state = 'uncertain' and not blocker_available then
    next_state := attempt.state;
    review := true;
    error_code := 'PAYMENT_MULTIPLE_ATTEMPTS';
  end if;

  update public.serenity_checkout_payments_v2
  set provider_payment_id = payment_id, provider_status = status,
    provider_status_detail = detail, provider_updated_at = provider_time,
    refunded_cents = refunded, state = next_state,
    application_state = case when review then 'review' else 'pending' end,
    blocks_new_attempt = blocker_available and (review or next_state not in ('rejected', 'cancelled', 'refunded')),
    expires_at = coalesce(expiration, expires_at),
    pix_code = case when next_state = 'pending' and not review
      then coalesce(nullif(p_observation->>'pix_code', ''), pix_code) end,
    pix_qr_base64 = case when next_state = 'pending' and not review
      then coalesce(nullif(p_observation->>'pix_qr_base64', ''), pix_qr_base64) end,
    lease_id = null, lease_expires_at = null, last_error_code = error_code, updated_at = now()
  where id = attempt.id;

  if review then application := 'review';
  elsif next_state = 'approved' and attempt.environment = 'test' then
    application := 'test_approved';
  elsif next_state = 'approved' then
    begin
      result_order := public.serenity_checkout_complete_order_v2(attempt.id);
      application := 'applied';
    exception when others then
      get stacked diagnostics code = returned_sqlstate;
      application := 'review'; error_code := 'PAYMENT_ORDER_' || code;
    end;
  elsif next_state = 'refunded' and attempt.environment = 'production' and checkout.order_id is not null then
    begin
      select o.status, o.shipping_details->'payment'->>'attempt_id'
      into order_status, order_attempt from public.serenity_orders o
      where o.id = checkout.order_id for update;
      if order_attempt is distinct from attempt.id::text then
        raise exception 'PAYMENT_ORDER_CONFLICT';
      end if;
      if order_status = 'paid' then
        perform public.serenity_admin_order_status(checkout.order_id, 'paid', 'refunded');
      elsif order_status <> 'refunded' then
        raise exception 'PAYMENT_ORDER_CONFLICT';
      end if;
      application := 'applied';
    exception when others then
      get stacked diagnostics code = returned_sqlstate;
      application := 'review'; error_code := 'PAYMENT_REFUND_' || code;
    end;
  elsif next_state in ('rejected', 'cancelled', 'refunded') then
    application := 'applied';
  end if;

  update public.serenity_checkout_payments_v2
  set application_state = application, last_error_code = error_code,
    blocks_new_attempt = blocker_available and (application in ('review', 'test_approved')
      or next_state not in ('rejected', 'cancelled', 'refunded')),
    updated_at = now()
  where id = attempt.id;

  if application = 'test_approved' then
    update public.serenity_checkout_stock_v2 set state = 'released'
    where checkout_id = checkout.id and state = 'active';
    update public.serenity_checkout_coupon_v2 set state = 'released'
    where checkout_id = checkout.id and state = 'reserved';
    update public.serenity_checkout_sessions_v2 set state = 'review', updated_at = now()
    where id = checkout.id and order_id is null;
  elsif application = 'review' then
    update public.serenity_checkout_sessions_v2 set state = 'review', updated_at = now()
    where id = checkout.id and order_id is null;
  elsif next_state = 'pending' then
    update public.serenity_checkout_sessions_v2 set state = 'payment_pending', updated_at = now()
    where id = checkout.id and order_id is null and state in ('pending', 'payment_pending', 'review');
  elsif next_state in ('rejected', 'cancelled', 'refunded') then
    if not exists(select 1 from public.serenity_checkout_payments_v2
      where checkout_id = checkout.id and (blocks_new_attempt or application_state = 'review')) then
      update public.serenity_checkout_sessions_v2 set state = 'pending', updated_at = now()
      where id = checkout.id and order_id is null and state in ('pending', 'payment_pending', 'review');
    end if;
  end if;

  return jsonb_build_object('state', next_state, 'application_state', application, 'order_id', result_order);
end;
$function$;

-- Acrescentar os indicadores de conferência sem expor dados do pagador.
do $migration$
declare
  definition text;
  modified text;
  pattern text := $pattern$return[[:space:]]+jsonb_build_object\([[:space:]]*'checkout_id'$pattern$;
begin
  definition := pg_get_functiondef('public.serenity_checkout_context_v2(uuid,text)'::regprocedure);
  if position('''needs_review''' in definition) > 0 then return; end if;
  modified := regexp_replace(definition, pattern,
    'return jsonb_build_object(
      ''needs_review'', exists(select 1 from public.serenity_checkout_payments_v2
        where checkout_id = checkout.id and application_state = ''review''),
      ''test_approved'', exists(select 1 from public.serenity_checkout_payments_v2
        where checkout_id = checkout.id and application_state = ''test_approved'')
    ) || jsonb_build_object(''checkout_id''');
  if modified = definition then raise exception 'A consulta do checkout está diferente da esperada.'; end if;
  execute modified;
end;
$migration$;

revoke all on function public.serenity_checkout_complete_order_v2(uuid) from public, anon, authenticated;
revoke all on function public.serenity_checkout_observe_payment_v2(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.serenity_checkout_complete_order_v2(uuid) to service_role;
grant execute on function public.serenity_checkout_observe_payment_v2(uuid, jsonb, text) to service_role;

notify pgrst, 'reload schema';
$lunarity_component_9$;


 -- database/lunarity-base/11-inicio-conta.sql SHA256 dfa61fe9bec267fbaa7be5682aabf4d4514a9860a6b685970ab383ae5ad1f3aa
 execute $lunarity_component_10$
CREATE OR REPLACE FUNCTION public.serenity_checkout_start_v2(p_id uuid, p_fingerprint text, p_access_hash text, p_environment text, p_user uuid, p_items jsonb, p_customer jsonb, p_address jsonb, p_expected bigint, p_cart_hash text, p_shipping uuid, p_coupon text, p_customer_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  existing public.serenity_checkout_sessions_v2%rowtype;
  delivery public.serenity_shipping_quotes%rowtype;
  context jsonb;
  quote jsonb;
  customer jsonb;
  address jsonb;
  mode text := 'retail';
  code text := upper(btrim(coalesce(p_coupon, '')));
  subtotal bigint;
  discount bigint;
  amount bigint;
  previous_user text;
  field text;
begin
  perform pg_advisory_xact_lock(7391542026);

  if p_id is null
    or p_shipping is null
    or coalesce(p_fingerprint, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_access_hash, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_cart_hash, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_customer_key, '') !~ '^[a-f0-9]{64}$'
    or p_environment is null
    or p_environment not in ('test', 'production')
    or p_expected is null
    or p_expected not between 1 and 9007199254740991
  then
    raise exception 'INVALID_REQUEST';
  end if;

  if jsonb_typeof(p_customer) is distinct from 'object'
    or jsonb_typeof(p_address) is distinct from 'object'
  then
    raise exception 'INVALID_CUSTOMER';
  end if;

  foreach field in array array[
    'name',
    'email',
    'phone',
    'document'
  ]
  loop
    if jsonb_typeof(p_customer->field)
        is distinct from 'string'
      or (p_customer->>field) ~ '[[:cntrl:]]'
    then
      raise exception 'INVALID_CUSTOMER';
    end if;
  end loop;

  foreach field in array array[
    'cep',
    'street',
    'number',
    'complement',
    'district',
    'city',
    'state'
  ]
  loop
    if jsonb_typeof(p_address->field)
        is distinct from 'string'
      or (p_address->>field) ~ '[[:cntrl:]]'
    then
      raise exception 'INVALID_CUSTOMER';
    end if;
  end loop;

  if length(btrim(p_customer->>'name'))
      not between 1 and 180
    or length(p_customer->>'email')
      not between 3 and 254
    or (p_customer->>'email')
      !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or (p_customer->>'phone')
      !~ '^[0-9]{10,11}$'
    or public.serenity_checkout_document_valid(
      p_customer->>'document'
    ) is distinct from true
    or (p_address->>'cep') !~ '^[0-9]{8}$'
    or (p_address->>'state') not in (
      'AC','AL','AP','AM','BA','CE','DF','ES','GO',
      'MA','MT','MS','MG','PA','PB','PR','PE','PI',
      'RJ','RN','RS','RO','RR','SC','SP','SE','TO'
    )
    or length(btrim(p_address->>'street'))
      not between 1 and 180
    or length(btrim(p_address->>'number'))
      not between 1 and 30
    or length(btrim(p_address->>'district'))
      not between 1 and 100
    or length(btrim(p_address->>'city'))
      not between 1 and 100
    or length(p_address->>'complement') > 180
  then
    raise exception 'INVALID_CUSTOMER';
  end if;

  customer := jsonb_build_object(
    'name', btrim(p_customer->>'name'),
    'email', lower(p_customer->>'email'),
    'phone', p_customer->>'phone',
    'document', p_customer->>'document'
  );

  address := jsonb_build_object(
    'cep', p_address->>'cep',
    'street', btrim(p_address->>'street'),
    'number', btrim(p_address->>'number'),
    'complement', btrim(p_address->>'complement'),
    'district', btrim(p_address->>'district'),
    'city', btrim(p_address->>'city'),
    'state', p_address->>'state'
  );

  select *
  into existing
  from public.serenity_checkout_sessions_v2
  where id = p_id
  for update;

  if found then
    if existing.fingerprint is distinct from p_fingerprint
      or existing.access_hash is distinct from p_access_hash
      or existing.environment is distinct from p_environment
      or existing.account_user_id is distinct from p_user
      or existing.cart_items is distinct from p_items
      or existing.customer_snapshot is distinct from customer
      or existing.delivery_address is distinct from address
      or existing.total_cents is distinct from p_expected
      or existing.shipping_quote_id is distinct from p_shipping
      or coalesce(
        existing.pricing_snapshot->'coupon'->>'code',
        ''
      ) is distinct from code
    then
      raise exception 'REQUEST_CHANGED';
    end if;

    return public.serenity_checkout_context_v2(
      p_id,
      p_access_hash
    );
  end if;

  if exists (
    select 1
    from public.serenity_orders
    where id = p_id
  ) then
    raise exception 'REQUEST_CHANGED';
  end if;

  if p_user is not null then
    if not exists (
      select 1
      from auth.users
      where id = p_user
        and email_confirmed_at is not null
    ) then
      raise exception 'CUSTOMER_ACCOUNT_UNAVAILABLE';
    end if;

    context := public.serenity_wholesale_context(p_user);

    if (context->>'active')::boolean is true then
      mode := 'wholesale';
    end if;
  end if;

  previous_user := current_setting(
    'serenity.wholesale_user',
    true
  );

  if mode = 'wholesale' then
    if code <> '' then
      raise exception 'WHOLESALE_COUPON';
    end if;

    quote := public.serenity_wholesale_stock_review_v2(
      p_user,
      p_items,
      p_id
    );

    if (quote->'wholesale'->>'minimum_met')::boolean
      is distinct from true
    then
      raise exception 'WHOLESALE_MINIMUM';
    end if;
  else
    perform set_config(
      'serenity.wholesale_user',
      '',
      true
    );

    quote := public.serenity_checkout_coupon_quote_v2(
      p_items,
      code,
      p_customer_key,
      p_id
    );
  end if;

  perform set_config(
    'serenity.wholesale_user',
    coalesce(previous_user, ''),
    true
  );

  subtotal := (quote->>'subtotal_cents')::bigint;
  discount := (quote->>'discount_cents')::bigint;

  select *
  into delivery
  from public.serenity_shipping_quotes
  where id = p_shipping
  for update;

  if not found
    or delivery.request_id is distinct from p_id
    or delivery.cart_hash is distinct from p_cart_hash
    or delivery.destination
      is distinct from address->>'cep'
    or delivery.expires_at <= now()
    or not isfinite(delivery.expires_at)
    or delivery.consumed_by is not null
    or delivery.settings_version is distinct from (
      select version
      from public.serenity_shipping_settings
      where singleton
    )
    or exists (
      select 1
      from public.serenity_checkout_sessions_v2
      where shipping_quote_id = p_shipping
    )
  then
    raise exception 'SHIPPING_QUOTE_EXPIRED';
  end if;

  if mode = 'wholesale' then
    if delivery.snapshot->>'pricing_mode'
        is distinct from 'wholesale'
      or delivery.snapshot->'wholesale'->>'user_id'
        is distinct from p_user::text
      or delivery.snapshot->'wholesale'->>'settings_version'
        is distinct from context->>'settings_version'
      or delivery.snapshot->'wholesale'->>'account_version'
        is distinct from context->>'account_version'
      or delivery.snapshot->'wholesale'->>'discount_percent'
        is distinct from context->>'discount_percent'
    then
      raise exception 'SHIPPING_QUOTE_EXPIRED';
    end if;
  elsif coalesce(
    delivery.snapshot->>'pricing_mode',
    'retail'
  ) <> 'retail' then
    raise exception 'SHIPPING_QUOTE_EXPIRED';
  end if;

  amount :=
    (quote->>'total_cents')::bigint
    + delivery.amount_cents;

  if subtotal is null
    or discount is null
    or amount is distinct from p_expected
    or delivery.subtotal_cents is distinct from subtotal
  then
    raise exception 'PRICE_CHANGED';
  end if;

  insert into public.serenity_checkout_sessions_v2 (
    id,
    fingerprint,
    access_hash,
    environment,
    account_user_id,
    pricing_mode,
    customer_snapshot,
    delivery_address,
    cart_items,
    order_items,
    pricing_snapshot,
    shipping_quote_id,
    shipping_snapshot,
    shipping_pending,
    subtotal_cents,
    discount_cents,
    shipping_cents,
    total_cents,
    expires_at,
    access_expires_at
  )
  values (
    p_id,
    p_fingerprint,
    p_access_hash,
    p_environment,
    p_user,
    mode,
    customer,
    address,
    p_items,
    quote->'items',
    quote,
    delivery.id,
    delivery.snapshot || jsonb_build_object(
      'manual', delivery.manual,
      'quote_id', delivery.id,
      'amount_cents', delivery.amount_cents,
      'quoted_at', delivery.created_at,
      'quote_expires_at', delivery.expires_at
    ),
    delivery.manual,
    subtotal,
    discount,
    delivery.amount_cents,
    amount,
    now() + interval '30 minutes',
    now() + interval '24 hours'
  );

  perform public.serenity_checkout_reserve_stock_v2(
    p_id
  );

  perform public.serenity_checkout_reserve_coupon_v2(
    p_id,
    p_customer_key
  );

  return public.serenity_checkout_context_v2(
    p_id,
    p_access_hash
  );
end;
$function$
;
$lunarity_component_10$;


 -- database/payments/03-pix-cartao.sql SHA256 d1f8d74cc36eb2b427fa651e888e10eb516fc8998958523b87d5eb2a428a07a5
 execute $lunarity_component_11$
-- Atualização única: Pix e cartão. Pode ser reaplicada. Não cria cobranças.

create or replace function public.serenity_checkout_account_confirmed_v2(
  p_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from auth.users as u
    where u.id = p_user
      and u.email_confirmed_at is not null
  );
$function$;

alter function public.serenity_checkout_account_confirmed_v2(uuid)
  owner to postgres;

revoke all on function public.serenity_checkout_account_confirmed_v2(uuid)
  from public, anon, authenticated;

grant execute on function public.serenity_checkout_account_confirmed_v2(uuid)
  to service_role;

do $migration$
declare
  definition text;
  patched text;
  matches integer;
  pattern constant text :=
    'not[[:space:]]+exists[[:space:]]*[(][[:space:]]*select[[:space:]]+1[[:space:]]+from[[:space:]]+auth[.]users[[:space:]]+where[[:space:]]+id[[:space:]]*=[[:space:]]*p_user[[:space:]]+and[[:space:]]+email_confirmed_at[[:space:]]+is[[:space:]]+not[[:space:]]+null[[:space:]]*[)]';
  replacement constant text :=
    'not public.serenity_checkout_account_confirmed_v2(p_user)';
begin
  definition := pg_get_functiondef(
    'public.serenity_checkout_start_v2(uuid,text,text,text,uuid,jsonb,jsonb,jsonb,bigint,text,uuid,text,text)'::regprocedure
  );

  select count(*) into matches
  from regexp_matches(definition, pattern, 'gi');

  if matches = 1 then
    patched := regexp_replace(definition, pattern, replacement, 'i');
    execute patched;
  elsif matches = 0 and position(replacement in definition) > 0 then
    null;
  else
    raise exception 'Não foi localizada uma única verificação de conta compatível. Nenhuma alteração foi aplicada.';
  end if;
end;
$migration$;

do $migration$
declare
  definition text;
  matches integer;
  pattern constant text :=
    'delivery[.]snapshot[[:space:]]*->[[:space:]]*''wholesale''[[:space:]]*->>[[:space:]]*''discount_percent''[[:space:]]+is[[:space:]]+distinct[[:space:]]+from[[:space:]]+context[[:space:]]*->>[[:space:]]*''discount_percent''';
  replacement constant text :=
    '(delivery.snapshot->''wholesale''->>''discount_percent'')::numeric is distinct from (context->>''discount_percent'')::numeric';
begin
  definition := pg_get_functiondef(
    'public.serenity_checkout_start_v2(uuid,text,text,text,uuid,jsonb,jsonb,jsonb,bigint,text,uuid,text,text)'::regprocedure
  );

  select count(*) into matches
  from regexp_matches(definition, pattern, 'gi');

  if matches = 1 then
    execute regexp_replace(definition, pattern, replacement, 'i');
  elsif matches = 0 and position(replacement in definition) > 0 then
    null;
  else
    raise exception 'Não foi localizada uma única comparação de desconto compatível. Nenhuma alteração foi aplicada.';
  end if;
end;
$migration$;

-- Verificar todas as funções que gravam a aprovação antes de liberar produção.
do $readiness$
declare
  signature text;
begin
  foreach signature in array array[
    'public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text)',
    'public.serenity_checkout_observe_payment_v2(uuid,jsonb,text)',
    'public.serenity_checkout_complete_order_v2(uuid)',
    'public.serenity_checkout_context_v2(uuid,text)'
  ] loop
    if to_regprocedure(signature) is null then
      raise exception 'Função obrigatória não instalada: %', signature;
    end if;
    if not has_function_privilege('service_role', signature, 'execute') then
      raise exception 'Permissão de servidor ausente: %', signature;
    end if;
  end loop;
end;
$readiness$;

alter table public.serenity_checkout_payments_v2
  add column if not exists last_reconciled_at timestamptz;

create index if not exists serenity_checkout_payments_v2_reconcile_idx
  on public.serenity_checkout_payments_v2(environment, last_reconciled_at, created_at)
  where state in ('submitting', 'pending', 'uncertain', 'approved');

create or replace function public.serenity_checkout_payment_ready_v3()
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'version', 3,
    'ready',
      to_regprocedure('public.serenity_checkout_complete_order_v2(uuid)') is not null
      and to_regprocedure('public.serenity_checkout_observe_payment_v2(uuid,jsonb,text)') is not null
      and to_regprocedure('public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text)') is not null
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'serenity_checkout_payments_v2'
          and column_name = 'last_reconciled_at'
      )
  );
$function$;

revoke all on function public.serenity_checkout_payment_ready_v3()
  from public, anon, authenticated;
grant execute on function public.serenity_checkout_payment_ready_v3()
  to service_role;

notify pgrst, 'reload schema';

alter table public.serenity_checkout_payments_v2
  add column if not exists card_authentication jsonb;

-- Reutiliza as mesmas reservas, trava e impedimento de cobrança simultânea do Pix.
do $migration$
declare
  definition text;
  matches integer;
begin
  definition := pg_get_functiondef(
    'public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text)'::regprocedure
  );
  select count(*) into matches
  from regexp_matches(definition, '''pix''', 'g');
  if matches <> 3 then
    raise exception 'A preparação de pagamento mudou. Nenhuma alteração foi aplicada.';
  end if;
  definition := replace(definition,
    'FUNCTION public.serenity_checkout_claim_pix_v2(',
    'FUNCTION public.serenity_checkout_claim_card_v3(');
  if position('FUNCTION public.serenity_checkout_claim_card_v3(' in definition) = 0 then
    raise exception 'Não foi possível preparar a função de cartão.';
  end if;
  execute replace(definition, '''pix''', '''card''');
end;
$migration$;

revoke all on function public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)
  to service_role;

create or replace function public.serenity_checkout_observe_payment_v3(
  p_attempt uuid, p_observation jsonb, p_source text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  result jsonb;
  authentication jsonb;
begin
  if p_observation->>'method' is distinct from 'card' then
    raise exception 'PAYMENT_OBSERVATION_INVALID';
  end if;
  authentication := nullif(p_observation->'card_authentication', 'null'::jsonb);
  if authentication is not null and (
    jsonb_typeof(authentication) is distinct from 'object'
    or jsonb_typeof(authentication->'external_resource_url') is distinct from 'string'
    or jsonb_typeof(authentication->'creq') is distinct from 'string'
    or length(authentication->>'external_resource_url') > 2048
    or (authentication->>'external_resource_url') !~ '^https://'
    or length(authentication->>'creq') not between 1 and 16384
    or (authentication->>'creq') !~ '^[A-Za-z0-9_+/=-]+$'
  ) then
    raise exception 'PAYMENT_OBSERVATION_INVALID';
  end if;

  result := public.serenity_checkout_observe_payment_v2(
    p_attempt, p_observation, p_source
  );

  update public.serenity_checkout_payments_v2
  set card_authentication = case
    when state = 'pending' and application_state <> 'review'
      and provider_status_detail = 'pending_challenge'
    then coalesce(
      case when provider_updated_at = (p_observation->>'updated_at')::timestamptz
        then authentication end,
      card_authentication
    )
    else null
  end
  where id = p_attempt and method = 'card';

  return result;
end;
$function$;

revoke all on function public.serenity_checkout_observe_payment_v3(uuid,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.serenity_checkout_observe_payment_v3(uuid,jsonb,text)
  to service_role;

-- Expõe somente o ID do pagamento e o desafio bancário da própria sessão.
do $migration$
declare
  definition text;
  matches integer;
  pattern constant text := '''application_state''[[:space:]]*,[[:space:]]*application_state';
begin
  definition := pg_get_functiondef(
    'public.serenity_checkout_context_v2(uuid,text)'::regprocedure
  );
  if position('''card_authentication''' in definition) > 0 then
    return;
  end if;
  select count(*) into matches from regexp_matches(definition, pattern, 'g');
  if matches <> 1 then
    raise exception 'A consulta da sessão mudou. Nenhuma alteração foi aplicada.';
  end if;
  execute regexp_replace(definition, pattern,
    '''provider_payment_id'', provider_payment_id,
      ''card_authentication'', case when method = ''card''
        and state = ''pending'' and application_state <> ''review''
        then card_authentication end,
      ''application_state'', application_state');
end;
$migration$;

create or replace function public.serenity_checkout_card_ready_v3()
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'version', 3,
    'ready',
      to_regprocedure('public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)') is not null
      and to_regprocedure('public.serenity_checkout_observe_payment_v3(uuid,jsonb,text)') is not null
      and position('''card_authentication''' in pg_get_functiondef(
        'public.serenity_checkout_context_v2(uuid,text)'::regprocedure
      )) > 0
  );
$function$;

revoke all on function public.serenity_checkout_card_ready_v3()
  from public, anon, authenticated;
grant execute on function public.serenity_checkout_card_ready_v3()
  to service_role;

notify pgrst, 'reload schema';
$lunarity_component_11$;


 -- database/payments/04-cliente-pedido-aprovado.sql SHA256 afb6f8746af978ebb5c404bb3569c315ec6843dd2fc7172e5df6687a99214c5f
 execute $lunarity_component_12$
select pg_advisory_xact_lock(7391542026);

-- Um perfil incompleto não pode esconder uma venda já paga.
-- Usa exclusivamente o snapshot e o proprietário do checkout aprovado;
-- não procura pessoas por e-mail e não altera permissões de conta/atacado.
create or replace function public.serenity_checkout_customer_for_order_v1(p_checkout uuid)
returns uuid language plpgsql set search_path='' as $$
declare c public.serenity_checkout_sessions_v2%rowtype; customer uuid;
begin
 perform pg_advisory_xact_lock(7391542026);
 select * into c from public.serenity_checkout_sessions_v2 where id=p_checkout for update;
 if not found or c.account_user_id is null or c.environment<>'production'
  or not exists(select 1 from public.serenity_checkout_payments_v2 p
   where p.checkout_id=c.id and p.environment='production' and p.state='approved'
    and p.provider_status='approved' and p.provider_payment_id is not null
    and p.amount_cents=c.total_cents and p.refunded_cents=0) then
  raise exception 'PAYMENT_APPROVAL_REQUIRED';
 end if;
 select a.customer_id into customer from public.serenity_customer_accounts a where a.user_id=c.account_user_id;
 if customer is not null then return customer; end if;
 if exists(select 1 from public.serenity_customers where id=c.id) then
  raise exception 'CUSTOMER_ORDER_CONFLICT';
 end if;
 insert into public.serenity_customers(id,name,email,phone)
 values(c.id,c.customer_snapshot->>'name',c.customer_snapshot->>'email',c.customer_snapshot->>'phone');
 update public.serenity_customer_accounts set customer_id=c.id
 where user_id=c.account_user_id and customer_id is null;
 return c.id;
end $$;
revoke all on function public.serenity_checkout_customer_for_order_v1(uuid) from public,anon,authenticated;
grant execute on function public.serenity_checkout_customer_for_order_v1(uuid) to service_role;

do $install$
declare target regprocedure; original text; changed text; matches integer;
 pattern constant text := 'if[[:space:]]+customer_id[[:space:]]+is[[:space:]]+null[[:space:]]+then[[:space:]]+raise[[:space:]]+exception[[:space:]]+''CUSTOMER_ACCOUNT_UNAVAILABLE'';[[:space:]]+end[[:space:]]+if;';
begin
 target:=coalesce(to_regprocedure('public.serenity_unlimited_complete_base_v1(uuid)'),to_regprocedure('public.serenity_checkout_complete_order_v2(uuid)'));
 if target is null then raise exception 'Conclusão de pagamento não instalada.'; end if;
 original:=pg_get_functiondef(target);
 if position('serenity_checkout_customer_for_order_v1(checkout.id)' in original)>0 then return; end if;
 select count(*) into matches from regexp_matches(original,pattern,'gi');
 if matches<>1 then raise exception 'A conclusão de clientes mudou. Nenhuma alteração aplicada.'; end if;
 changed:=regexp_replace(original,pattern,
  'if customer_id is null then customer_id := public.serenity_checkout_customer_for_order_v1(checkout.id); end if;','i');
 execute changed;
end $install$;
-- Preserva no painel o motivo técnico quando ele é um código conhecido,
-- sem salvar dados pessoais de mensagens de erro livres.
do $diagnostic$
declare original text; changed text; matches integer;
 pattern constant text := 'get stacked diagnostics code = returned_sqlstate;[[:space:]]*application := ''review''; error_code := ''PAYMENT_ORDER_'' [|][|] code;';
begin
 original:=pg_get_functiondef('public.serenity_checkout_observe_payment_v2(uuid,jsonb,text)'::regprocedure);
 if position('message_text; -- Serenity payment reason v1' in original)>0 then return; end if;
 select count(*) into matches from regexp_matches(original,pattern,'gi');
 if matches<>1 then
  -- Esta melhoria é opcional: não altera uma função desconhecida e não
  -- impede instalar a correção independente do cadastro do cliente.
  return;
 end if;
 changed:=regexp_replace(original,pattern,$patch$
 get stacked diagnostics code = returned_sqlstate, error_code = message_text; -- Serenity payment reason v1
 application := 'review';
 error_code := 'PAYMENT_ORDER_' || case when error_code ~ '^[A-Z][A-Z0-9_]{1,50}$' then error_code else code end;
 $patch$,'i');
 execute changed;
end $diagnostic$;
notify pgrst,'reload schema';
$lunarity_component_12$;


 -- database/collection/01-progressivo.sql SHA256 6a039939aba14bc47e79e3783eca9a2c55783c75c8f7b48726b26a57cff0df69
 execute $lunarity_component_13$
select pg_advisory_xact_lock(7391542026);

create table if not exists public.serenity_collection_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true
);
insert into public.serenity_collection_settings values (true, true) on conflict do nothing;
alter table public.serenity_collection_settings enable row level security;
revoke all on public.serenity_collection_settings from public, anon, authenticated;
grant select on public.serenity_collection_settings to anon, authenticated;
grant all on public.serenity_collection_settings to service_role;
drop policy if exists collection_public_read on public.serenity_collection_settings;
create policy collection_public_read on public.serenity_collection_settings for select to anon, authenticated using (true);

create table if not exists public.serenity_collection_function_backups_v1 (
  signature text primary key, definition text not null, saved_at timestamptz not null default now()
);
alter table public.serenity_collection_function_backups_v1 enable row level security;
revoke all on public.serenity_collection_function_backups_v1 from public, anon, authenticated;
grant all on public.serenity_collection_function_backups_v1 to service_role;

-- Preserve the installed functions, including any previous account/payment fixes.
do $migration$
declare signature text; original text;
begin
  foreach signature in array array[
    'public.serenity_checkout_coupon_quote_v2(jsonb,text,text,uuid)',
    'public.serenity_checkout_reserve_coupon_v2(uuid,text)',
    'public.serenity_checkout_complete_order_v2(uuid)',
    'public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text)',
    'public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)'
  ] loop
    original := pg_get_functiondef(signature::regprocedure);
    insert into public.serenity_collection_function_backups_v1 values(signature, original, now()) on conflict do nothing;
  end loop;
  if to_regprocedure('public.serenity_collection_coupon_base_v1(jsonb,text,text,uuid)') is null then
    original := pg_get_functiondef('public.serenity_checkout_coupon_quote_v2(jsonb,text,text,uuid)'::regprocedure);
    if position('FUNCTION public.serenity_checkout_coupon_quote_v2(' in original) = 0 then
      raise exception 'Não foi possível preservar a função de cupons. Nenhuma alteração aplicada.';
    end if;
    execute replace(original, 'FUNCTION public.serenity_checkout_coupon_quote_v2(', 'FUNCTION public.serenity_collection_coupon_base_v1(');
  end if;
end;
$migration$;

create or replace function public.serenity_collection_is_jewel_v1(p_product uuid)
returns boolean language sql stable set search_path = '' as $function$
  select coalesce(
    product_type in ('simple','variable')
    and lower(coalesce(name,'') || ' ' || coalesce(array_to_string(categories,' '),''))
      !~ '(after.?care|soro|limpeza|higieni|antiss[eé]pt|pin[çc]a|porta.?joia|estojo|mostru[aá]rio|expositor|luvas?|alicate|instrumental|autoclave|esteriliz|agulha|cateter|dermogr[aá]fo)'
    and lower(coalesce(material,'') || ' ' || coalesce(name,''))
      ~ '(tit[âa]nio|ouro|prata|a[çc]o|ni[óo]bio|joia|piercing|argola|clicker|labret|topo|stud|brinco|colar|pulseira|pingente|corrente|barbell|haste|conector)',
    false
  ) from public.products where id = p_product;
$function$;

create or replace function public.serenity_collection_coupon_cents_v1(snapshot jsonb, legacy_total bigint)
returns bigint language sql immutable set search_path = '' as $function$
  select coalesce((snapshot->'coupon'->>'discount_cents')::bigint,
    case when snapshot ? 'progressive' then 0 else legacy_total end);
$function$;

create or replace function public.serenity_checkout_coupon_quote_v2(
  p_items jsonb, p_code text default null, p_customer_key text default null, p_request uuid default null
) returns jsonb language plpgsql set search_path = '' as $function$
declare
  quote jsonb; item jsonb; units bigint := 0; eligible bigint := 0; products_cents bigint := 0;
  coupon_cents bigint; coupon_share bigint; coupon_products bigint := 0; coupon_jewels bigint := 0; coupon_scope text; selected_coupon uuid; line_cents bigint; is_jewel boolean; basis bigint; savings bigint; percent integer; enabled boolean;
begin
  perform pg_advisory_xact_lock(7391542026);
  quote := public.serenity_collection_coupon_base_v1(p_items, p_code, p_customer_key, p_request);
  select s.enabled into enabled from public.serenity_collection_settings s where singleton;
  if enabled is distinct from true or coalesce(current_setting('serenity.wholesale_user',true),'') <> ''
    or quote->>'pricing_mode' = 'wholesale' then return quote; end if;
  coupon_cents := coalesce((quote->>'discount_cents')::bigint,0);
  selected_coupon := (quote->'coupon'->>'id')::uuid;
  select scope into coupon_scope from public.serenity_coupons where id = selected_coupon;
  for item in select value from jsonb_array_elements(quote->'items') loop
    line_cents := round((item->>'unit_price')::numeric * 100)::bigint * (item->>'quantity')::integer;
    products_cents := products_cents + line_cents;
    is_jewel := public.serenity_collection_is_jewel_v1((item->>'product_id')::uuid);
    if coupon_cents > 0 and (coupon_scope = 'all' or exists (select 1 from public.serenity_coupon_products where coupon_id = selected_coupon and product_id = (item->>'product_id')::uuid)) then
      coupon_products := coupon_products + line_cents;
      if is_jewel is true then coupon_jewels := coupon_jewels + line_cents; end if;
    end if;
    if is_jewel is true then
      units := units + (item->>'quantity')::integer;
      eligible := eligible + round((item->>'unit_price')::numeric * 100)::bigint * (item->>'quantity')::integer;
    end if;
  end loop;
  percent := case when units >= 4 then 20 when units = 3 then 15 when units = 2 then 10 else 0 end;
  -- Allocate the coupon proportionally, so only the remaining jewelry value gets the extra discount.
  coupon_share := case when coupon_products > 0 then least(eligible, round(coupon_cents::numeric * coupon_jewels / coupon_products)::bigint) else 0 end;
  basis := greatest(0, eligible - coupon_share);
  savings := least(basis, round(basis::numeric * percent / 100)::bigint);
  return quote || jsonb_build_object(
    'subtotal_cents', coalesce((quote->>'subtotal_cents')::bigint,(quote->>'total_cents')::bigint + coupon_cents),
    'discount_cents', coupon_cents + savings,
    'total_cents', (quote->>'total_cents')::bigint - savings,
    'total', ((quote->>'total_cents')::bigint - savings) / 100.0,
    'progressive', jsonb_build_object('campaign','serenity-collection-v1','quantity',units,'percent',percent,
      'eligible_cents',eligible,'basis_cents',basis,'discount_cents',savings)
  );
end;
$function$;

-- Match only the intended expressions, allowing the installed SQL's line breaks.
do $migration$
declare
  original text; modified text; signature text; matches integer;
  coupon_value text := 'public.serenity_collection_coupon_cents_v1(checkout.pricing_snapshot, checkout.discount_cents)';
  condition_pattern text := 'if[[:space:]]+checkout[.]discount_cents[[:space:]]*>[[:space:]]*0[[:space:]]+then';
  comparison_pattern text := 'coupon_hold[.]discount_cents[[:space:]]+is[[:space:]]+distinct[[:space:]]+from[[:space:]]+checkout[.]discount_cents';
  redemption_pattern text := 'checkout[.]discount_cents[[:space:]]*,[[:space:]]*coupon_hold[.]coupon_snapshot';
  empty_coupon_pattern text := 'elsif[[:space:]]+checkout[.]discount_cents[[:space:]]*<>[[:space:]]*0[[:space:]]+then';
  assignment_pattern text := 'discount[[:space:]]*:=[[:space:]]*checkout[.]discount_cents[[:space:]]*;';
begin
  original := pg_get_functiondef('public.serenity_checkout_reserve_coupon_v2(uuid,text)'::regprocedure);
  if position('serenity_collection_coupon_cents_v1' in original) = 0 then
    select count(*) into matches from regexp_matches(original, empty_coupon_pattern, 'g');
    if matches <> 1 then
      raise exception 'A reserva de cupons mudou (condição). Nenhuma alteração aplicada.';
    end if;
    select count(*) into matches from regexp_matches(original, assignment_pattern, 'g');
    if matches <> 1 or position('serenity_checkout_coupon_quote_v2' in original) = 0 then
      raise exception 'A reserva de cupons mudou (valor). Nenhuma alteração aplicada.';
    end if;
    modified := regexp_replace(original, empty_coupon_pattern,
      'elsif checkout.discount_cents <> coalesce((checkout.pricing_snapshot->''progressive''->>''discount_cents'')::bigint,0) then', 'g');
    modified := regexp_replace(modified, assignment_pattern, 'discount := ' || coupon_value || ';', 'g');
    execute modified;
  end if;

  original := pg_get_functiondef('public.serenity_checkout_complete_order_v2(uuid)'::regprocedure);
  if position('serenity_collection_coupon_cents_v1' in original) = 0 then
    select count(*) into matches from regexp_matches(original, condition_pattern, 'g');
    if matches <> 2 then
      raise exception 'A confirmação de pagamentos mudou (condições). Nenhuma alteração aplicada.';
    end if;
    select count(*) into matches from regexp_matches(original, comparison_pattern, 'g');
    if matches <> 1 then
      raise exception 'A confirmação de pagamentos mudou (comparação). Nenhuma alteração aplicada.';
    end if;
    select count(*) into matches from regexp_matches(original, redemption_pattern, 'g');
    if matches <> 1 then
      raise exception 'A confirmação de pagamentos mudou (registro). Nenhuma alteração aplicada.';
    end if;
    modified := regexp_replace(original, condition_pattern, 'if ' || coupon_value || ' > 0 then', 'g');
    modified := regexp_replace(modified, comparison_pattern, 'coupon_hold.discount_cents is distinct from ' || coupon_value, 'g');
    modified := regexp_replace(modified, redemption_pattern, coupon_value || ', coupon_hold.coupon_snapshot', 'g');
    execute modified;
  end if;

  foreach signature in array array[
    'public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text)',
    'public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)'
  ] loop
    original := pg_get_functiondef(signature::regprocedure);
    if position('serenity_collection_coupon_cents_v1' in original) = 0 then
      select count(*) into matches from regexp_matches(original, condition_pattern, 'g');
      if matches <> 1 then
        raise exception 'A preparação de pagamento mudou (condição): %. Nenhuma alteração aplicada.', signature;
      end if;
      select count(*) into matches from regexp_matches(original, comparison_pattern, 'g');
      if matches <> 1 then
        raise exception 'A preparação de pagamento mudou (comparação): %. Nenhuma alteração aplicada.', signature;
      end if;
      modified := regexp_replace(original, condition_pattern, 'if ' || coupon_value || ' > 0 then', 'g');
      modified := regexp_replace(modified, comparison_pattern, 'coupon_hold.discount_cents is distinct from ' || coupon_value, 'g');
      execute modified;
    end if;
  end loop;
end;
$migration$;

revoke all on function public.serenity_collection_coupon_base_v1(jsonb,text,text,uuid),
  public.serenity_collection_is_jewel_v1(uuid), public.serenity_collection_coupon_cents_v1(jsonb,bigint),
  public.serenity_checkout_coupon_quote_v2(jsonb,text,text,uuid) from public, anon, authenticated;
grant execute on function public.serenity_collection_coupon_base_v1(jsonb,text,text,uuid),
  public.serenity_collection_is_jewel_v1(uuid), public.serenity_collection_coupon_cents_v1(jsonb,bigint),
  public.serenity_checkout_coupon_quote_v2(jsonb,text,text,uuid) to service_role;
notify pgrst, 'reload schema';
$lunarity_component_13$;


 -- database/collection/02-faixas-5-7-10-15.sql SHA256 331e2b028d50916b2ee82fa0c4821db53c923da193e39717510eb2e1fc542c42
 execute $lunarity_component_14$
select pg_advisory_xact_lock(7391542026);
-- New quotes only. Existing payment snapshots and completed orders are preserved.
create table if not exists public.serenity_collection_tier_backups_v2 (
 signature text primary key,definition text not null,saved_at timestamptz not null default now()
);
alter table public.serenity_collection_tier_backups_v2 enable row level security;
revoke all on public.serenity_collection_tier_backups_v2 from public,anon,authenticated;
grant all on public.serenity_collection_tier_backups_v2 to service_role;
do $migration$
declare original text;changed text;assignment text;matches integer;
 pattern text:='percent[[:space:]]*:=[[:space:]]*case[^;]+end[[:space:]]*;';
begin
 original:=pg_get_functiondef('public.serenity_checkout_coupon_quote_v2(jsonb,text,text,uuid)'::regprocedure);
 if position('Serenity progressive tiers v2' in original)>0 then return;end if;
 if position('serenity_collection_coupon_base_v1' in original)=0
  or position('serenity_collection_is_jewel_v1' in original)=0
 then raise exception 'A campanha progressiva instalada mudou. Nenhuma alteração aplicada.';end if;
 select count(*) into matches from regexp_matches(original,pattern,'gi');
 select match[1] into assignment from regexp_matches(original,'('||pattern||')','i') as match;
 if matches<>1 or lower(regexp_replace(coalesce(assignment,''),'[[:space:]]','','g'))<>
  'percent:=casewhenunits>=4then20whenunits=3then15whenunits=2then10else0end;'
 then raise exception 'As faixas instaladas mudaram. Nenhuma alteração aplicada.';end if;
 insert into public.serenity_collection_tier_backups_v2(signature,definition)
 values('public.serenity_checkout_coupon_quote_v2(jsonb,text,text,uuid)',original) on conflict do nothing;
 changed:=regexp_replace(original,pattern,
  '/* Serenity progressive tiers v2 */ percent := case when units >= 5 then 15 when units = 4 then 10 when units = 3 then 7 when units = 2 then 5 else 0 end;','i');
 execute changed;
end $migration$;
notify pgrst,'reload schema';
$lunarity_component_14$;


 -- database/collection/03-excluir-ouro-bioflex.sql SHA256 1715612365254e7d454866500bbe24289483f1bd9cd4421b76ad4a30e269a365
 execute $lunarity_component_15$
select pg_advisory_xact_lock(7391542026);
-- Preserve the installed eligibility rules; only add the material exclusions.
do $migration$
declare original text;
begin
 if to_regprocedure('public.serenity_collection_is_jewel_base_v3(uuid)') is null then
  original:=pg_get_functiondef('public.serenity_collection_is_jewel_v1(uuid)'::regprocedure);
  execute replace(original,'FUNCTION public.serenity_collection_is_jewel_v1(','FUNCTION public.serenity_collection_is_jewel_base_v3(');
 end if;
end $migration$;
create or replace function public.serenity_collection_is_jewel_v1(p_product uuid)
returns boolean language sql stable set search_path='' as $$
 select coalesce(public.serenity_collection_is_jewel_base_v3(p.id),false)
 and lower(coalesce(p.material,'')||' '||coalesce(p.name,'')||' '||coalesce(array_to_string(p.categories,' '),'')) !~ 'bio[[:space:]-]*flex'
 and not (
  -- Titanium with a gold coating is a different material from solid gold.
  lower(coalesce(nullif(btrim(p.material),''),p.name||' '||coalesce(array_to_string(p.categories,' '),''))) !~ '(tit[âa]nio|titanium|revestid|banhad|folhead|plated|pvd)'
  and lower(coalesce(nullif(btrim(p.material),''),p.name||' '||coalesce(array_to_string(p.categories,' '),''))) ~ '(ouro|gold)'
  and (lower(coalesce(p.material,'')) ~ '^[[:space:]]*(ouro|gold)[[:space:]]*$'
   or lower(coalesce(p.material,'')||' '||coalesce(p.name,'')||' '||coalesce(array_to_string(p.categories,' '),'')) ~ '(18[[:space:]-]*(k|kt|quilat|karat)|750)')
 )
 from public.products p where p.id=p_product;
$$;
revoke all on function public.serenity_collection_is_jewel_base_v3(uuid),public.serenity_collection_is_jewel_v1(uuid) from public,anon,authenticated;
grant execute on function public.serenity_collection_is_jewel_base_v3(uuid),public.serenity_collection_is_jewel_v1(uuid) to service_role;
notify pgrst,'reload schema';
$lunarity_component_15$;


 -- database/pix-discount/01-pix-five.sql SHA256 1bb382d0010648ecbf3d36f3a7779abacd361d3bac027973e28aec44ba2617f0
 execute $lunarity_component_16$
select pg_advisory_xact_lock(7391542026);

create table if not exists public.serenity_pix_discount_settings_v4 (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true
);
insert into public.serenity_pix_discount_settings_v4 values(true,true) on conflict do nothing;
alter table public.serenity_pix_discount_settings_v4 enable row level security;
revoke all on public.serenity_pix_discount_settings_v4 from public,anon,authenticated;
grant select on public.serenity_pix_discount_settings_v4 to anon,authenticated;
grant all on public.serenity_pix_discount_settings_v4 to service_role;
drop policy if exists pix_discount_public_read on public.serenity_pix_discount_settings_v4;
create policy pix_discount_public_read on public.serenity_pix_discount_settings_v4 for select to anon,authenticated using(true);

create table if not exists public.serenity_pix_discount_backups_v4 (
  signature text primary key, definition text not null, saved_at timestamptz not null default now()
);
alter table public.serenity_pix_discount_backups_v4 enable row level security;
revoke all on public.serenity_pix_discount_backups_v4 from public,anon,authenticated;
grant all on public.serenity_pix_discount_backups_v4 to service_role;

do $migration$
declare signature text; target text; definition text; source_name text;
begin
  foreach signature in array array[
    'public.serenity_checkout_context_v2(uuid,text)',
    'public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text)',
    'public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)',
    'public.serenity_collection_coupon_cents_v1(jsonb,bigint)',
    'public.serenity_checkout_card_ready_v3()'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    insert into public.serenity_pix_discount_backups_v4 values(signature,definition,now()) on conflict do nothing;
    source_name := split_part(split_part(signature,'public.',2),'(',1);
    target := case source_name
      when 'serenity_checkout_context_v2' then 'serenity_pix_base_context_v4'
      when 'serenity_checkout_claim_pix_v2' then 'serenity_pix_base_claim_v4'
      when 'serenity_checkout_claim_card_v3' then 'serenity_card_base_claim_v4'
      else null end;
    if target is not null and to_regprocedure(replace(signature,source_name,target)) is null then
      if position('FUNCTION public.' || source_name || '(' in definition) = 0 then
        raise exception 'Não foi possível preservar a função %. Nenhuma alteração aplicada.',source_name;
      end if;
      execute replace(definition,'FUNCTION public.' || source_name || '(','FUNCTION public.' || target || '(');
    end if;
  end loop;
end;
$migration$;

create or replace function public.serenity_collection_coupon_cents_v1(snapshot jsonb,legacy_total bigint)
returns bigint language sql immutable set search_path = '' as $function$
  select coalesce((snapshot->'coupon'->>'discount_cents')::bigint,
    case when snapshot ? 'progressive' or snapshot ? 'payment_discount' then 0 else legacy_total end);
$function$;

create or replace function public.serenity_checkout_payment_prices_v4(p_checkout uuid)
returns jsonb language plpgsql set search_path = '' as $function$
declare
  checkout public.serenity_checkout_sessions_v2%rowtype;
  saved jsonb; original_total bigint; original_discount bigint; products_cents bigint; basis bigint;
  savings bigint := 0; selected text; enabled boolean; blocked boolean;
begin
  select * into checkout from public.serenity_checkout_sessions_v2 where id=p_checkout;
  if not found then raise exception 'CHECKOUT_ACCESS_INVALID'; end if;
  saved := checkout.pricing_snapshot->'payment_discount';
  if saved->>'campaign' = 'pix-five-v4' then
    original_total := (saved->>'original_total_cents')::bigint;
    original_discount := (saved->>'original_discount_cents')::bigint;
    selected := saved->>'selected_method';
  else
    original_total := checkout.total_cents;
    original_discount := checkout.discount_cents;
  end if;
  select coalesce(sum(round((item->>'unit_price')::numeric * 100)::bigint * (item->>'quantity')::integer),0)
    into products_cents from jsonb_array_elements(checkout.order_items) as rows(item);
  basis := greatest(0,products_cents-original_discount);
  select s.enabled into enabled from public.serenity_pix_discount_settings_v4 s where singleton;
  select exists(select 1 from public.serenity_checkout_payments_v2 where checkout_id=p_checkout and
    (blocks_new_attempt or application_state='review' or state in ('approved','refunded','charged_back'))) into blocked;
  if enabled is true and checkout.pricing_mode='retail' and (not blocked or selected is not null) then
    savings := least(basis,round(basis::numeric*5/100)::bigint);
  end if;
  return jsonb_build_object('card_total_cents',original_total,'pix_total_cents',original_total-savings,
    'pix_discount_cents',savings,'basis_cents',basis,'original_discount_cents',original_discount,
    'selected_method',selected,'applied_discount_cents',coalesce((saved->>'discount_cents')::bigint,0));
end;
$function$;

create or replace function public.serenity_checkout_context_v2(p_checkout uuid,p_access_hash text)
returns jsonb language plpgsql set search_path = '' as $function$
declare context jsonb;
begin
  context := public.serenity_pix_base_context_v4(p_checkout,p_access_hash);
  return context || jsonb_build_object('payment_options',public.serenity_checkout_payment_prices_v4(p_checkout));
end;
$function$;

create or replace function public.serenity_checkout_select_method_v4(p_checkout uuid,p_access_hash text,p_method text)
returns jsonb language plpgsql set search_path = '' as $function$
declare checkout public.serenity_checkout_sessions_v2%rowtype; prices jsonb; savings bigint; original_total bigint; original_discount bigint; snapshot jsonb;
begin
  perform pg_advisory_xact_lock(7391542026);
  if p_method is null or p_method not in ('pix','card') then raise exception 'INVALID_REQUEST'; end if;
  perform public.serenity_pix_base_context_v4(p_checkout,p_access_hash);
  select * into checkout from public.serenity_checkout_sessions_v2 where id=p_checkout for update;
  if checkout.state <> 'pending' or checkout.order_id is not null or checkout.shipping_pending
    or checkout.expires_at <= now()+interval '1 minute' then raise exception 'PAYMENT_CHECKOUT_UNAVAILABLE'; end if;
  if exists(select 1 from public.serenity_checkout_payments_v2 where checkout_id=p_checkout and
    (blocks_new_attempt or application_state='review' or state in ('approved','refunded','charged_back'))) then
    raise exception 'PAYMENT_ALREADY_STARTED';
  end if;
  prices := public.serenity_checkout_payment_prices_v4(p_checkout);
  original_total := (prices->>'card_total_cents')::bigint;
  original_discount := (prices->>'original_discount_cents')::bigint;
  savings := case when p_method='pix' then (prices->>'pix_discount_cents')::bigint else 0 end;
  snapshot := checkout.pricing_snapshot || jsonb_build_object(
    'payment_discount',jsonb_build_object('campaign','pix-five-v4','selected_method',p_method,
      'original_total_cents',original_total,'original_discount_cents',original_discount,
      'basis_cents',(prices->>'basis_cents')::bigint,'discount_cents',savings),
    'discount_cents',original_discount+savings,'total_cents',original_total-savings,'total',(original_total-savings)/100.0);
  update public.serenity_checkout_sessions_v2 set pricing_snapshot=snapshot,discount_cents=original_discount+savings,
    total_cents=original_total-savings,updated_at=now() where id=p_checkout;
  return public.serenity_checkout_context_v2(p_checkout,p_access_hash);
end;
$function$;

create or replace function public.serenity_checkout_assert_method_v4(p_checkout uuid,p_method text)
returns void language plpgsql set search_path = '' as $function$
declare selected text;
begin
  perform pg_advisory_xact_lock(7391542026);
  select pricing_snapshot->'payment_discount'->>'selected_method' into selected
    from public.serenity_checkout_sessions_v2 where id=p_checkout;
  if selected is not null and selected is distinct from p_method then raise exception 'PAYMENT_METHOD_CHANGED'; end if;
end;
$function$;

create or replace function public.serenity_checkout_claim_pix_v2(p_checkout uuid,p_access_hash text,p_attempt uuid,p_merchant text,p_request_hash text)
returns jsonb language plpgsql set search_path = '' as $function$
begin
  perform public.serenity_checkout_assert_method_v4(p_checkout,'pix');
  return public.serenity_pix_base_claim_v4(p_checkout,p_access_hash,p_attempt,p_merchant,p_request_hash);
end;
$function$;
create or replace function public.serenity_checkout_claim_card_v3(p_checkout uuid,p_access_hash text,p_attempt uuid,p_merchant text,p_request_hash text)
returns jsonb language plpgsql set search_path = '' as $function$
begin
  perform public.serenity_checkout_assert_method_v4(p_checkout,'card');
  return public.serenity_card_base_claim_v4(p_checkout,p_access_hash,p_attempt,p_merchant,p_request_hash);
end;
$function$;

create or replace function public.serenity_checkout_card_ready_v3()
returns jsonb language sql stable set search_path = '' as $function$
  select jsonb_build_object('version',3,'ready',
    to_regprocedure('public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)') is not null
    and to_regprocedure('public.serenity_checkout_observe_payment_v3(uuid,jsonb,text)') is not null
    and position('serenity_pix_base_context_v4' in pg_get_functiondef('public.serenity_checkout_context_v2(uuid,text)'::regprocedure)) > 0
    and position('''card_authentication''' in pg_get_functiondef('public.serenity_pix_base_context_v4(uuid,text)'::regprocedure)) > 0);
$function$;

revoke all on function public.serenity_pix_base_context_v4(uuid,text),public.serenity_pix_base_claim_v4(uuid,text,uuid,text,text),
 public.serenity_card_base_claim_v4(uuid,text,uuid,text,text),public.serenity_checkout_payment_prices_v4(uuid),
 public.serenity_checkout_select_method_v4(uuid,text,text),public.serenity_checkout_assert_method_v4(uuid,text),
 public.serenity_checkout_context_v2(uuid,text),public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text),
 public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.serenity_pix_base_context_v4(uuid,text),public.serenity_pix_base_claim_v4(uuid,text,uuid,text,text),
 public.serenity_card_base_claim_v4(uuid,text,uuid,text,text),public.serenity_checkout_payment_prices_v4(uuid),
 public.serenity_checkout_select_method_v4(uuid,text,text),public.serenity_checkout_assert_method_v4(uuid,text),
 public.serenity_checkout_context_v2(uuid,text),public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text),
 public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text) to service_role;
notify pgrst,'reload schema';
$lunarity_component_16$;


 -- database/lunarity-base/12-permissoes.sql SHA256 37eadf375eb347f606cb51959fb3117671ecbb1096bc702baf3ce386039ce392
 execute $lunarity_component_17$
-- Somente tabelas criadas pelo instalador; nunca concede leitura de clientes a anon.
do $$ declare tablename text; signature text;
begin
 foreach tablename in array array['products','product_variants','serenity_product_commercial',
  'serenity_commerce_settings_v1','serenity_promotion_campaigns','serenity_promotion_items'] loop
  if to_regclass('public.'||tablename) is not null then
   execute format('grant select on public.%I to service_role',tablename);
  end if;
 end loop;
 grant update(stock_quantity,stock_status) on public.products,public.product_variants to service_role;
 grant execute on function public.serenity_target_effective_price(uuid,uuid,numeric,numeric,timestamptz,timestamptz) to service_role;
 foreach tablename in array array[
  'serenity_customers','serenity_customer_accounts','serenity_wholesale_settings',
  'serenity_shipping_settings','serenity_shipping_quotes','serenity_orders','serenity_coupons',
  'serenity_coupon_products','serenity_coupon_redemptions','serenity_stock_reservations','serenity_stock_events',
  'serenity_checkout_rate_limits'
 ] loop
  execute format('alter table public.%I enable row level security',tablename);
  execute format('revoke all on public.%I from public,anon,authenticated',tablename);
  execute format('grant select,insert,update,delete on public.%I to service_role',tablename);
 end loop;
 -- Every newly installed routine has server-only execution. Existing price helpers are preserved.
 for signature in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname ~ '^serenity_(checkout|stock|wholesale|customer_account|customer_profile|admin_wholesale|shipping_settings_save|coupon_order_state|admin_order_status|lunarity_policy)'
 loop
  execute 'revoke all on function '||signature||' from public,anon,authenticated';
  execute 'grant execute on function '||signature||' to service_role';
 end loop;
end $$;
grant usage,select on sequence public.serenity_orders_number_seq,public.serenity_stock_events_id_seq to service_role;
revoke all on sequence public.serenity_orders_number_seq,public.serenity_stock_events_id_seq from public,anon,authenticated;
grant select on public.serenity_customer_accounts,public.serenity_customers,public.serenity_orders to authenticated;
create policy lunarity_account_self_read on public.serenity_customer_accounts for select to authenticated using(user_id=(select auth.uid()));
create policy lunarity_customer_self_read on public.serenity_customers for select to authenticated using(exists(
 select 1 from public.serenity_customer_accounts a where a.customer_id=id and a.user_id=(select auth.uid())
));
create policy lunarity_orders_self_read on public.serenity_orders for select to authenticated using(account_user_id=(select auth.uid()));
create trigger lunarity_stock_insert after insert on public.serenity_orders for each row execute function public.serenity_stock_order_trigger();
create trigger lunarity_stock_status after update of status on public.serenity_orders for each row
 when(old.status is distinct from new.status) execute function public.serenity_stock_order_trigger();
create trigger lunarity_coupon_status after update of status on public.serenity_orders for each row execute function public.serenity_coupon_order_state();

-- Initial status-only workflow: no shipment is marked as prepared or dispatched.
create view public.serenity_admin_order_workflow with(security_invoker=true) as
 select o.*,case o.status when 'pending' then 'awaiting_payment' when 'paid' then 'paid'
  when 'cancelled' then 'cancelled' when 'refunded' then 'refunded' else 'unknown' end as workflow_stage
 from public.serenity_orders o;
revoke all on public.serenity_admin_order_workflow from public,anon,authenticated;
grant select on public.serenity_admin_order_workflow to service_role;
$lunarity_component_17$;


 -- database/asaas/01-checkout.sql SHA256 5147efd7630d584cc3cd8491e2216e7f98d0c7622d314eb500822a377be995e2
 execute $lunarity_component_18$
-- Atualização do checkout V2/V3 existente. Não é instalador de banco vazio.
-- Aplicar depois das migrações de checkout, pagamentos e desconto Pix existentes.

do $$ begin
  if to_regprocedure('public.serenity_checkout_payment_ready_v3()') is null
    or to_regprocedure('public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)') is null then
    raise exception 'ASAAS_CHECKOUT_BASE_REQUIRED: instale o checkout V2/V3 antes desta atualização.';
  end if;
end $$;

alter table public.serenity_checkout_payments_v2
  add column if not exists provider text not null default 'mercado_pago'
    check (provider in ('mercado_pago','asaas')),
  add column if not exists asaas_customer_id text check (asaas_customer_id ~ '^cus_[A-Za-z0-9_-]{1,100}$'),
  add column if not exists asaas_invoice_url text;

alter table public.serenity_checkout_payments_v2
  drop constraint if exists serenity_checkout_payments_v2_provider_payment_id_check;
alter table public.serenity_checkout_payments_v2
  add constraint serenity_checkout_payments_v2_provider_payment_id_check check (
    provider_payment_id is null or
    (provider='mercado_pago' and provider_payment_id ~ '^[0-9]{1,40}$') or
    (provider='asaas' and provider_payment_id ~ '^pay_[A-Za-z0-9_-]{1,100}$')
  );

-- Cria um observador específico para Asaas preservando as proteções de estoque,
-- cupom, rollback da conversão, idempotência e regressão do observador instalado.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.serenity_checkout_observe_payment_v2(uuid,jsonb,text)'::regprocedure);
  if position('''^[0-9]{1,40}$''' in definition)=0
    or position('if next_state = ''pending'' and attempt.method = ''pix''' in definition)=0 then
    raise exception 'ASAAS_OBSERVER_BASE_INCOMPATIBLE';
  end if;
  definition := replace(definition,'FUNCTION public.serenity_checkout_observe_payment_v2(',
    'FUNCTION public.serenity_asaas_observe_base_v1(');
  definition := replace(definition,'''^[0-9]{1,40}$''','''^pay_[A-Za-z0-9_-]{1,100}$''');
  -- O QR do Asaas pode sobreviver à reserva local. Nunca liberar nova cobrança
  -- pelo vencimento local; aprovação tardia continua em review na conversão.
  definition := replace(definition,'if next_state = ''pending'' and attempt.method = ''pix''',
    'if next_state = ''pending'' and attempt.provider <> ''asaas'' and attempt.method = ''pix''');
  execute definition;
end;
$migration$;

create or replace function public.serenity_asaas_claim_v1(
  p_checkout uuid,p_access_hash text,p_attempt uuid,p_merchant text,p_request_hash text,p_method text
) returns jsonb language plpgsql set search_path = '' as $$
declare result jsonb;
begin
  perform pg_advisory_xact_lock(7391542026);
  if p_method not in ('pix','card') or p_method is null then raise exception 'PAYMENT_REQUEST_INVALID'; end if;
  if exists(select 1 from public.serenity_checkout_payments_v2 where id=p_attempt and provider<>'asaas') then
    raise exception 'PAYMENT_REQUEST_CHANGED';
  end if;
  if p_method='pix' then
    result := public.serenity_checkout_claim_pix_v2(p_checkout,p_access_hash,p_attempt,p_merchant,p_request_hash);
  else
    result := public.serenity_checkout_claim_card_v3(p_checkout,p_access_hash,p_attempt,p_merchant,p_request_hash);
  end if;
  if result->>'submit'='true' then
    update public.serenity_checkout_payments_v2 set provider='asaas' where id=p_attempt;
  end if;
  return result;
end $$;

create or replace function public.serenity_asaas_customer_v1(p_attempt uuid,p_lease uuid,p_customer text)
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(7391542026);
  if coalesce(p_customer,'') !~ '^cus_[A-Za-z0-9_-]{1,100}$' then raise exception 'ASAAS_CUSTOMER_INVALID'; end if;
  update public.serenity_checkout_payments_v2 set asaas_customer_id=p_customer
  where id=p_attempt and provider='asaas' and state='submitting' and lease_id=p_lease
    and asaas_customer_id is null and provider_payment_id is null;
  if not found then raise exception 'PAYMENT_LEASE_INVALID'; end if;
end $$;

create or replace function public.serenity_asaas_uncertain_v1(p_attempt uuid,p_lease uuid,p_request_hash text,p_code text)
returns jsonb language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(7391542026);
  if coalesce(p_code,'') !~ '^ASAAS_[A-Z0-9_]{1,70}$' then raise exception 'PAYMENT_REQUEST_INVALID'; end if;
  -- A função existente exige um código MP; preservar o diagnóstico Asaas depois.
  if not exists(select 1 from public.serenity_checkout_payments_v2 where id=p_attempt and provider='asaas') then
    raise exception 'PAYMENT_ATTEMPT_INVALID';
  end if;
  perform public.serenity_checkout_pix_uncertain_v2(p_attempt,p_lease,p_request_hash,'MP_SUBMISSION_UNCERTAIN');
  update public.serenity_checkout_payments_v2 set last_error_code=p_code
  where id=p_attempt and state='uncertain';
  return jsonb_build_object('state','uncertain');
end $$;

-- Somente fatos obtidos pela API autenticada, nunca o corpo do webhook.
create or replace function public.serenity_asaas_observe_v1(p_attempt uuid,p_observation jsonb,p_source text)
returns jsonb language plpgsql set search_path = '' as $$
declare attempt public.serenity_checkout_payments_v2%rowtype; result jsonb; invoice text;
begin
  perform pg_advisory_xact_lock(7391542026);
  select * into attempt from public.serenity_checkout_payments_v2 where id=p_attempt for update;
  if not found or attempt.provider<>'asaas' or attempt.asaas_customer_id is null
    or p_observation->>'customer_id' is distinct from attempt.asaas_customer_id then
    raise exception 'PAYMENT_OBSERVATION_MISMATCH';
  end if;
  invoice := p_observation->>'invoice_url';
  if invoice is not null and (length(invoice)>2048 or invoice !~
    (case when attempt.environment='test' then '^https://sandbox[.]asaas[.]com/i/[A-Za-z0-9_/?=&%.-]+$'
      else '^https://www[.]asaas[.]com/i/[A-Za-z0-9_/?=&%.-]+$' end)) then
    raise exception 'ASAAS_INVOICE_URL_INVALID';
  end if;
  result := public.serenity_asaas_observe_base_v1(p_attempt,p_observation,p_source);
  update public.serenity_checkout_payments_v2 set asaas_invoice_url=invoice where id=p_attempt;
  if result->>'application_state'='applied' and result->>'order_id' is not null then
    update public.serenity_orders set
      shipping_details=jsonb_set(shipping_details,'{payment,provider}','"asaas"'::jsonb),
      notes=replace(notes,'Pagamento confirmado pelo Mercado Pago.','Pagamento confirmado pelo Asaas.')
    where id=(result->>'order_id')::uuid
      and shipping_details->'payment'->>'attempt_id'=p_attempt::text;
  end if;
  return result;
end $$;

-- Enriquece o contexto público sem expor documento, chave ou customer ID.
do $migration$
declare definition text;
begin
  if to_regprocedure('public.serenity_asaas_base_context_v1(uuid,text)') is null then
    definition := pg_get_functiondef('public.serenity_checkout_context_v2(uuid,text)'::regprocedure);
    execute replace(definition,'FUNCTION public.serenity_checkout_context_v2(',
      'FUNCTION public.serenity_asaas_base_context_v1(');
  end if;
end;
$migration$;
create or replace function public.serenity_checkout_context_v2(p_checkout uuid,p_access_hash text)
returns jsonb language plpgsql set search_path = '' as $$
declare result jsonb;
begin
  result := public.serenity_asaas_base_context_v1(p_checkout,p_access_hash);
  return result || jsonb_build_object('attempts',coalesce((
    select jsonb_agg(a.value || jsonb_build_object('provider',p.provider,'invoice_url',
      case when p.provider='asaas' and p.state='pending' and p.application_state<>'review'
        then p.asaas_invoice_url end) order by a.ordinality)
    from jsonb_array_elements(result->'attempts') with ordinality a(value,ordinality)
    join public.serenity_checkout_payments_v2 p on p.id=(a.value->>'id')::uuid
  ),'[]'::jsonb));
end $$;

create or replace function public.serenity_asaas_ready_v1()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('version',1,'ready',
    (public.serenity_checkout_payment_ready_v3()->>'ready')::boolean
    and to_regprocedure('public.serenity_asaas_claim_v1(uuid,text,uuid,text,text,text)') is not null
    and to_regprocedure('public.serenity_asaas_observe_v1(uuid,jsonb,text)') is not null);
$$;

do $$ declare signature text; begin
  foreach signature in array array[
    'public.serenity_asaas_observe_base_v1(uuid,jsonb,text)',
    'public.serenity_asaas_claim_v1(uuid,text,uuid,text,text,text)',
    'public.serenity_asaas_customer_v1(uuid,uuid,text)',
    'public.serenity_asaas_uncertain_v1(uuid,uuid,text,text)',
    'public.serenity_asaas_observe_v1(uuid,jsonb,text)',
    'public.serenity_asaas_base_context_v1(uuid,text)',
    'public.serenity_checkout_context_v2(uuid,text)',
    'public.serenity_asaas_ready_v1()'
  ] loop
    execute 'revoke all on function ' || signature || ' from public,anon,authenticated';
    execute 'grant execute on function ' || signature || ' to service_role';
  end loop;
end $$;
notify pgrst,'reload schema';
$lunarity_component_18$;


 create table public.serenity_lunarity_installation_v1(version integer primary key,installed_at timestamptz not null default now());
 alter table public.serenity_lunarity_installation_v1 enable row level security;
 revoke all on public.serenity_lunarity_installation_v1 from public,anon,authenticated;
 grant select on public.serenity_lunarity_installation_v1 to service_role;
 insert into public.serenity_lunarity_installation_v1(version) values(1);
end;
$lunarity_install$;
notify pgrst,'reload schema';
commit;
-- Somente instalação local: isto não ativa cobranças, frete ou uma conta Asaas.
select public.serenity_asaas_ready_v1() as pagamentos,
 (select enabled from public.serenity_shipping_settings where singleton) as frete_automatico,
 (select count(*) from public.serenity_orders) as pedidos_existentes;
