-- Lunarity: ativa a estrutura de compra visitante no banco já instalado.
-- Preserva contas, pedidos, cobranças e reservas existentes. Não ativa pagamentos.
-- Não depende de tabelas de e-mail, etiquetas ou rastreamento ainda não instaladas.
begin;
select pg_advisory_xact_lock(7391542026);
do $$ begin
 if to_regclass('public.serenity_lunarity_installation_v1') is null
  or to_regprocedure('public.serenity_asaas_ready_v1()') is null then
  raise exception 'LUNARITY_BASE_REQUIRED';
 end if;
 if to_regclass('public.serenity_guest_access_v1') is not null
  and to_regprocedure('public.serenity_lunarity_guest_context_base_v1(uuid,text)') is null then
  raise exception 'LUNARITY_GUEST_EXISTING_INSTALLATION: conferir a instalação de visitante existente antes de atualizar.';
 end if;
end $$;

create table if not exists public.serenity_guest_access_v1 (
 checkout_id uuid primary key references public.serenity_checkout_sessions_v2(id),
 number bigint not null unique,token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,revoked boolean not null default false,created_at timestamptz not null default now()
);
alter table public.serenity_guest_access_v1 enable row level security;
revoke all on public.serenity_guest_access_v1 from public,anon,authenticated;
grant select,insert,update on public.serenity_guest_access_v1 to service_role;

create or replace function public.serenity_guest_register_v1(p_checkout uuid,p_access_hash text,p_token_hash text)
returns bigint language plpgsql set search_path='' as $$
declare checkout public.serenity_checkout_sessions_v2%rowtype;existing public.serenity_guest_access_v1%rowtype;number bigint;seq text;
begin
 perform pg_advisory_xact_lock(7391542026);
 perform public.serenity_checkout_context_v2(p_checkout,p_access_hash);
 select * into checkout from public.serenity_checkout_sessions_v2 where id=p_checkout for update;
 if not found or checkout.access_hash is distinct from p_access_hash or checkout.access_expires_at<=now()
  or checkout.state not in('pending','payment_pending','converted')
  or (checkout.account_user_id is null and checkout.pricing_mode<>'retail')
  or coalesce(p_token_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'CHECKOUT_ACCESS_INVALID';end if;
 select * into existing from public.serenity_guest_access_v1 where checkout_id=checkout.id;
 if found then
  if existing.revoked or existing.expires_at<=now() or existing.token_hash is distinct from p_token_hash then raise exception 'GUEST_LINK_UNAVAILABLE';end if;
  return existing.number;
 end if;
 select o.number into number from public.serenity_orders o where o.id=checkout.order_id;
 if number is null then
  seq:=pg_get_serial_sequence('public.serenity_orders','number');
  if seq is null then raise exception 'GUEST_ORDER_SEQUENCE_UNAVAILABLE';end if;
  number:=nextval(seq::regclass);
 end if;
 insert into public.serenity_guest_access_v1(checkout_id,number,token_hash,expires_at)
 values(checkout.id,number,p_token_hash,now()+interval '180 days');
 return number;
end $$;

create or replace function public.serenity_guest_order_number_v1()
returns trigger language plpgsql set search_path='' as $$
declare reserved bigint;
begin
 select g.number into reserved from public.serenity_guest_access_v1 g
 join public.serenity_checkout_sessions_v2 c on c.id=g.checkout_id
 where g.checkout_id=new.id and c.environment='production' and new.source='site';
 if reserved is not null then new.number:=reserved;end if;
 return new;
end $$;
drop trigger if exists serenity_guest_order_number_v1 on public.serenity_orders;
create trigger serenity_guest_order_number_v1 before insert on public.serenity_orders
 for each row execute function public.serenity_guest_order_number_v1();

do $$ declare definition text;begin
 if to_regprocedure('public.serenity_lunarity_guest_context_base_v1(uuid,text)') is null then
  definition:=pg_get_functiondef('public.serenity_checkout_context_v2(uuid,text)'::regprocedure);
  execute replace(definition,'FUNCTION public.serenity_checkout_context_v2(',
   'FUNCTION public.serenity_lunarity_guest_context_base_v1(');
 end if;
end $$;
create or replace function public.serenity_checkout_context_v2(p_checkout uuid,p_access_hash text)
returns jsonb language plpgsql set search_path='' as $$
declare context jsonb;
begin
 context:=public.serenity_lunarity_guest_context_base_v1(p_checkout,p_access_hash);
 return context||jsonb_build_object('guest_checkout',exists(
  select 1 from public.serenity_guest_access_v1 g join public.serenity_checkout_sessions_v2 c on c.id=g.checkout_id
  where g.checkout_id=p_checkout and c.account_user_id is null
 ));
end $$;

create or replace function public.serenity_guest_tracking_read_v1(p_hash text,p_environment text default 'production')
returns jsonb language plpgsql set search_path='' as $$
declare access public.serenity_guest_access_v1%rowtype;checkout public.serenity_checkout_sessions_v2%rowtype;
 order_row public.serenity_orders%rowtype;status text;carrier text;tracking_code text;
begin
 if coalesce(p_hash,'') !~ '^[a-f0-9]{64}$' or p_environment is null or p_environment not in('test','production') then return null;end if;
 select * into access from public.serenity_guest_access_v1 where token_hash=p_hash and not revoked and expires_at>now();
 if not found then return null;end if;
 select * into checkout from public.serenity_checkout_sessions_v2 where id=access.checkout_id and environment=p_environment;
 if not found then return null;end if;
 select * into order_row from public.serenity_orders where id=checkout.order_id and id=checkout.id and source='site';
 if found then status:=order_row.status;
 else
  status:=case
   when checkout.state='review' or exists(select 1 from public.serenity_checkout_payments_v2 p where p.checkout_id=checkout.id and
    (p.application_state='review' or p.state in('approved','uncertain','charged_back'))) then 'review'
   when checkout.state in('expired','cancelled') then 'cancelled'
   when exists(select 1 from public.serenity_checkout_payments_v2 p where p.checkout_id=checkout.id and p.state='refunded') then 'refunded'
   when exists(select 1 from public.serenity_checkout_payments_v2 p where p.checkout_id=checkout.id and p.state in('rejected','cancelled')) then 'failed'
   else 'pending' end;
 end if;
 -- Optional shipping installation: no fabricated shipment status when it is absent.
 if order_row.id is not null and to_regclass('public.serenity_shipment_tracking') is not null
  and to_regclass('public.serenity_label_jobs') is not null and to_regclass('public.serenity_label_purchases') is not null then
  select t.carrier_status,t.tracking_code into carrier,tracking_code from public.serenity_shipment_tracking t
   join public.serenity_label_jobs j on j.order_id=t.order_id and j.remote_id=t.remote_id and j.state='prepared'
   join public.serenity_label_purchases p on p.order_id=j.order_id and p.operation=j.operation and p.remote_id=j.remote_id
   where t.order_id=order_row.id and p.phase in('paid','generating','ready') and p.carrier_status not in('canceled','cancelled','expired')
   and t.carrier_status in('posted','delivered','undelivered','paused','suspended');
 end if;
 return jsonb_build_object('number',coalesce(order_row.number,access.number),'status',status,
  'total',coalesce(order_row.total,checkout.total_cents/100.0),'created_at',checkout.created_at,
  'carrier',carrier,'tracking_code',tracking_code,'environment',checkout.environment);
end $$;

create or replace function public.serenity_guest_checkout_ready_v1()
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('version',1,'ready',
  (public.serenity_asaas_ready_v1()->>'ready')::boolean
  and to_regprocedure('public.serenity_guest_register_v1(uuid,text,text)') is not null
  and to_regprocedure('public.serenity_guest_tracking_read_v1(text,text)') is not null);
$$;
do $$ declare signature text;begin
 foreach signature in array array[
  'public.serenity_guest_register_v1(uuid,text,text)',
  'public.serenity_guest_order_number_v1()',
  'public.serenity_lunarity_guest_context_base_v1(uuid,text)',
  'public.serenity_checkout_context_v2(uuid,text)',
  'public.serenity_guest_tracking_read_v1(text,text)',
  'public.serenity_guest_checkout_ready_v1()'
 ] loop
  execute 'revoke all on function '||signature||' from public,anon,authenticated';
  execute 'grant execute on function '||signature||' to service_role';
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
select public.serenity_guest_checkout_ready_v1() as compra_sem_cadastro;
