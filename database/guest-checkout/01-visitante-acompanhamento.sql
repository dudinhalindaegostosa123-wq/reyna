begin;
select pg_advisory_xact_lock(7391542026);
select pg_advisory_xact_lock(7391542030);

-- Requer checkout V2, e-mails 01–04 e rastreamento já instalados.
create table if not exists public.serenity_guest_access_v1 (
 checkout_id uuid primary key references public.serenity_checkout_sessions_v2(id),
 number bigint not null unique,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 revoked boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.serenity_guest_access_v1 enable row level security;
revoke all on public.serenity_guest_access_v1 from public,anon,authenticated;
grant all on public.serenity_guest_access_v1 to service_role;

-- Reserva a mesma sequência do painel. Não cria uma venda antes de pagar.
create or replace function public.serenity_guest_next_number_v1()
returns bigint language plpgsql set search_path='' as $$
declare sequence_name text;
begin
 sequence_name:=pg_get_serial_sequence('public.serenity_orders','number');
 if sequence_name is null then
  select substring(pg_get_expr(d.adbin,d.adrelid) from 'nextval\(''([^'']+)''::regclass\)') into sequence_name
  from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
  where a.attrelid='public.serenity_orders'::regclass and a.attname='number';
 end if;
 if sequence_name is null then raise exception 'GUEST_ORDER_SEQUENCE_UNAVAILABLE'; end if;
 return nextval(sequence_name::regclass);
end $$;
revoke all on function public.serenity_guest_next_number_v1() from public,anon,authenticated;
grant execute on function public.serenity_guest_next_number_v1() to service_role;

alter table public.serenity_email_outbox_v1 add column if not exists checkout_id uuid references public.serenity_checkout_sessions_v2(id);
create unique index if not exists serenity_guest_received_email_v1 on public.serenity_email_outbox_v1(checkout_id,kind) where checkout_id is not null;
-- Preserve todas as famílias de avisos existentes, incluindo atacado/histórico.
do $$
declare expression text;
begin
 select pg_get_expr(conbin,conrelid) into expression from pg_constraint
 where conrelid='public.serenity_email_outbox_v1'::regclass and conname='serenity_email_outbox_v1_kind_check';
 if expression is null then raise exception 'Instale primeiro as notificações de pedidos.'; end if;
 if position('received' in expression)=0 then
  alter table public.serenity_email_outbox_v1 drop constraint serenity_email_outbox_v1_kind_check;
  execute 'alter table public.serenity_email_outbox_v1 add constraint serenity_email_outbox_v1_kind_check check (('||expression||') or kind=''received'')';
 end if;
 select pg_get_expr(conbin,conrelid) into expression from pg_constraint
 where conrelid='public.serenity_email_outbox_v1'::regclass and conname='serenity_email_scope_v1';
 if expression is null then raise exception 'Instale primeiro as notificações de atacado e histórico.'; end if;
 if position('checkout_id' in expression)=0 then
  alter table public.serenity_email_outbox_v1 drop constraint serenity_email_scope_v1;
  execute 'alter table public.serenity_email_outbox_v1 add constraint serenity_email_scope_v1 check ((( '||expression||') and checkout_id is null) or (kind=''received'' and checkout_id is not null and order_id is null and account_user_id is null and legacy_shipping_id is null and event_version is null))';
 end if;
end $$;

create or replace function public.serenity_guest_register_v1(p_checkout uuid,p_access_hash text,p_token_hash text)
returns bigint language plpgsql security definer set search_path='' as $$
declare c public.serenity_checkout_sessions_v2%rowtype; existing public.serenity_guest_access_v1%rowtype; n bigint; recipient text; lines jsonb;
begin
 perform pg_advisory_xact_lock(7391542026);
 select * into c from public.serenity_checkout_sessions_v2 where id=p_checkout for update;
 if not found or c.access_hash is distinct from p_access_hash
   or (c.account_user_id is null and c.pricing_mode<>'retail') or c.state not in('pending','payment_pending','converted')
   or c.access_expires_at<=now() or coalesce(p_token_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'CHECKOUT_ACCESS_INVALID'; end if;
 select * into existing from public.serenity_guest_access_v1 where checkout_id=c.id;
 if found then
  if existing.token_hash is distinct from p_token_hash or existing.revoked then raise exception 'GUEST_LINK_UNAVAILABLE'; end if;
  return existing.number;
 end if;
 recipient:=lower(trim(c.customer_snapshot->>'email'));
 if recipient is null or length(recipient)>254 or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_EMAIL'; end if;
 n:=public.serenity_guest_next_number_v1();
 insert into public.serenity_guest_access_v1(checkout_id,number,token_hash,expires_at) values(c.id,n,p_token_hash,now()+interval '180 days');
 select coalesce(jsonb_agg(jsonb_build_object('name',i->>'name','variation',i->>'variation','quantity',i->'quantity',
  'unit_price',coalesce((i->>'unit_price')::numeric,0)+coalesce((i->>'fee')::numeric,0)+coalesce((i->>'sterilization_fee')::numeric,0))),'[]'::jsonb)
 into lines from jsonb_array_elements(c.order_items) i;
 if c.environment='production' then
  insert into public.serenity_email_outbox_v1(checkout_id,kind,recipient,payload)
   values(c.id,'received',recipient,jsonb_build_object('number',n,'name',c.customer_snapshot->>'name','total',c.total_cents/100.0,'items',lines,'guest_checkout',true))
   on conflict(checkout_id,kind) where checkout_id is not null do nothing;
 end if;
 return n;
end $$;
revoke all on function public.serenity_guest_register_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.serenity_guest_register_v1(uuid,text,text) to service_role;

-- O número reservado é mantido no pedido definitivo; nenhuma linha antiga muda.
create or replace function public.serenity_guest_order_number_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare n bigint;
begin
 select g.number into n from public.serenity_guest_access_v1 g
 join public.serenity_checkout_sessions_v2 c on c.id=g.checkout_id
 where g.checkout_id=new.id and c.environment='production' and new.source='site';
 if n is not null then new.number:=n; end if;
 return new;
end $$;
revoke all on function public.serenity_guest_order_number_v1() from public,anon,authenticated;
drop trigger if exists serenity_guest_order_number_v1 on public.serenity_orders;
create trigger serenity_guest_order_number_v1 before insert on public.serenity_orders for each row execute function public.serenity_guest_order_number_v1();

-- Marca somente as mensagens de futuros compradores visitantes. O token bruto
-- nunca é salvo na fila nem em uma coluna pública: o worker monta o link.
create or replace function public.serenity_guest_email_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.order_id is not null and new.kind in('paid','shipped','delivered','shipping_undelivered','shipping_paused','shipping_suspended')
  and exists(select 1 from public.serenity_guest_access_v1 g where g.checkout_id=new.order_id) then
  new.payload:=new.payload||jsonb_build_object('guest_checkout',true);
 end if;
 return new;
end $$;
revoke all on function public.serenity_guest_email_v1() from public,anon,authenticated;
drop trigger if exists serenity_guest_email_v1 on public.serenity_email_outbox_v1;
create trigger serenity_guest_email_v1 before insert on public.serenity_email_outbox_v1 for each row execute function public.serenity_guest_email_v1();

-- Acrescenta metadado sem remover os marcadores de prontidão Pix/cartão.
do $context$
declare original text; changed text; matches integer;
begin
 original:=pg_get_functiondef('public.serenity_checkout_context_v2(uuid,text)'::regprocedure);
 if position('''guest_checkout''' in original)>0 then return; end if;
 select count(*) into matches from regexp_matches(original,'''payment_options''[[:space:]]*,','g');
 if matches<>1 then raise exception 'Instale primeiro a seleção de Pix/cartão v4. Nenhuma alteração aplicada.'; end if;
 changed:=regexp_replace(original,'''payment_options''[[:space:]]*,',
  '''guest_checkout'', exists(select 1 from public.serenity_guest_access_v1 g join public.serenity_checkout_sessions_v2 c on c.id=g.checkout_id where g.checkout_id=p_checkout and c.account_user_id is null), ''payment_options'',');
 execute changed;
end $context$;

create or replace function public.serenity_guest_tracking_read_v1(p_hash text,p_environment text default 'production')
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.serenity_guest_access_v1%rowtype; c public.serenity_checkout_sessions_v2%rowtype;
 o public.serenity_orders%rowtype; carrier text; code text; status text;
begin
 if coalesce(p_hash,'') !~ '^[a-f0-9]{64}$' or p_environment not in('test','production') then return null; end if;
 select * into g from public.serenity_guest_access_v1 where token_hash=p_hash and not revoked and expires_at>now();
 if not found then return null; end if;
 select * into c from public.serenity_checkout_sessions_v2 where id=g.checkout_id and environment=p_environment;
 if not found then return null; end if;
 select * into o from public.serenity_orders where id=c.order_id and id=c.id and source='site';
 if found then status:=o.status;
 else
  status:=case when c.state='review' or exists(select 1 from public.serenity_checkout_payments_v2 p where p.checkout_id=c.id and (p.state in('approved','uncertain','charged_back') or p.application_state='review')) then 'review'
   when c.state in('cancelled','expired') then 'cancelled'
   when exists(select 1 from public.serenity_checkout_payments_v2 p where p.checkout_id=c.id and p.state in('created','submitting','pending')) then 'pending'
   when exists(select 1 from public.serenity_checkout_payments_v2 p where p.checkout_id=c.id and p.state='refunded') then 'refunded'
   when exists(select 1 from public.serenity_checkout_payments_v2 p where p.checkout_id=c.id and p.state in('rejected','cancelled')) then 'failed'
   else 'pending' end;
 end if;
 select t.carrier_status,t.tracking_code into carrier,code from public.serenity_shipment_tracking t
 join public.serenity_label_jobs j on j.order_id=t.order_id and j.remote_id=t.remote_id and j.state='prepared'
 join public.serenity_label_purchases p on p.order_id=j.order_id and p.operation=j.operation and p.remote_id=j.remote_id
 where t.order_id=o.id and p.phase in('paid','generating','ready') and p.carrier_status not in('canceled','cancelled','expired')
  and t.carrier_status in('posted','delivered','undelivered','paused','suspended');
 if carrier is null and exists(select 1 from public.serenity_order_dispatches d
  join public.serenity_label_jobs j on j.order_id=d.order_id and j.remote_id=d.remote_id and j.state='prepared'
  join public.serenity_label_purchases p on p.order_id=j.order_id and p.remote_id=j.remote_id and p.operation=j.operation
  where d.order_id=o.id and d.dispatched_at is not null and p.phase in('paid','generating','ready') and p.carrier_status not in('canceled','cancelled','expired')) then carrier:='posted'; end if;
 return jsonb_build_object('number',coalesce(o.number,g.number),'status',status,'total',coalesce(o.total,c.total_cents/100.0),
  'created_at',c.created_at,'carrier',carrier,'tracking_code',code,'environment',c.environment);
end $$;
revoke all on function public.serenity_guest_tracking_read_v1(text,text) from public,anon,authenticated;
grant execute on function public.serenity_guest_tracking_read_v1(text,text) to service_role;
create or replace function public.serenity_guest_checkout_ready_v1()
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('version',1,'ready',true);
$$;
revoke all on function public.serenity_guest_checkout_ready_v1() from public,anon,authenticated;
grant execute on function public.serenity_guest_checkout_ready_v1() to service_role;
notify pgrst,'reload schema';
commit;
