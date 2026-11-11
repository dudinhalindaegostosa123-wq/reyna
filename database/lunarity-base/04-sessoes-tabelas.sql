-- Rotinas completas revisadas do snapshot de checkout existente; sem fixtures de dados.
begin;

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
commit;
