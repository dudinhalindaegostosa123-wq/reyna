begin;
select pg_advisory_xact_lock(7391542030);

create table if not exists public.serenity_legacy_shipment_tracking_v1 (
  order_id uuid primary key references public.serenity_legacy_shipping_orders_v1(id),
  remote_id uuid not null, operation uuid not null,
  carrier_status text not null default '', tracking_code text,
  sync_state text not null default 'pending' check(sync_state in('pending','syncing','synced','error')),
  lease_id uuid, leased_at timestamptz, last_checked_at timestamptz,
  next_check_at timestamptz not null default now(), error_code text
);
alter table public.serenity_legacy_shipment_tracking_v1 enable row level security;
revoke all on public.serenity_legacy_shipment_tracking_v1 from public,anon,authenticated;
grant all on public.serenity_legacy_shipment_tracking_v1 to service_role;

alter table public.serenity_email_outbox_v1 add column if not exists legacy_shipping_id uuid references public.serenity_legacy_shipping_orders_v1(id);
alter table public.serenity_email_outbox_v1 drop constraint if exists serenity_email_outbox_v1_kind_check;
alter table public.serenity_email_outbox_v1 add constraint serenity_email_outbox_v1_kind_check check(kind in('paid','owner_paid','shipped','delivered','wholesale_requested','wholesale_approved','legacy_shipped','legacy_delivered','shipping_undelivered','shipping_paused','shipping_suspended','legacy_undelivered','legacy_paused','legacy_suspended'));
alter table public.serenity_email_outbox_v1 drop constraint if exists serenity_email_scope_v1;
alter table public.serenity_email_outbox_v1 add constraint serenity_email_scope_v1 check(
 (kind in('wholesale_requested','wholesale_approved') and order_id is null and account_user_id is not null and event_version is not null and legacy_shipping_id is null)
 or (kind in('paid','owner_paid','shipped','delivered','shipping_undelivered','shipping_paused','shipping_suspended') and order_id is not null and account_user_id is null and legacy_shipping_id is null)
 or (kind in('legacy_shipped','legacy_delivered','legacy_undelivered','legacy_paused','legacy_suspended') and legacy_shipping_id is not null and order_id is null and account_user_id is null)
);
create unique index if not exists serenity_email_legacy_event_v1 on public.serenity_email_outbox_v1(legacy_shipping_id,kind);

create or replace function public.serenity_legacy_tracking_claim_v1(p_limit integer default 2)
returns table(order_id uuid,remote_id uuid,operation uuid,lease_id uuid)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  insert into public.serenity_legacy_shipment_tracking_v1 as t(order_id,remote_id,operation)
  select p.order_id,p.remote_id,p.operation
  from public.serenity_legacy_label_purchases_v1 p
  join public.serenity_legacy_label_jobs_v1 j on j.order_id=p.order_id and j.remote_id=p.remote_id and j.operation=p.operation and j.state='prepared'
  join public.serenity_legacy_shipping_orders_v1 s on s.id=p.order_id
  join public.serenity_legacy_orders_v1 o on o.old_id=s.legacy_id
  where p.phase in('paid','generating','ready') and coalesce(p.carrier_status,'') not in('canceled','cancelled','expired')
    and not o.needs_review and o.original_status in('wc-processing','wc-completed')
    and not exists(select 1 from public.serenity_legacy_orders_v1 r where r.parent_id=o.old_id and r.kind='shop_order_refund')
  on conflict on constraint serenity_legacy_shipment_tracking_v1_pkey do update
    set remote_id=excluded.remote_id,operation=excluded.operation,carrier_status='',tracking_code=null,sync_state='pending',lease_id=null,leased_at=null,next_check_at=now(),last_checked_at=null,error_code=null
    where t.remote_id is distinct from excluded.remote_id or t.operation is distinct from excluded.operation;

  return query with candidate as (
    select t.order_id from public.serenity_legacy_shipment_tracking_v1 t
    join public.serenity_legacy_label_purchases_v1 p on p.order_id=t.order_id and p.remote_id=t.remote_id and p.operation=t.operation
    join public.serenity_legacy_label_jobs_v1 j on j.order_id=t.order_id and j.remote_id=t.remote_id and j.operation=t.operation and j.state='prepared'
    join public.serenity_legacy_shipping_orders_v1 s on s.id=t.order_id
    join public.serenity_legacy_orders_v1 o on o.old_id=s.legacy_id
    where t.next_check_at<=now() and (t.sync_state<>'syncing' or t.leased_at<now()-interval '5 minutes')
      and t.carrier_status not in('delivered','canceled','cancelled','expired') and p.phase in('paid','generating','ready')
      and coalesce(p.carrier_status,'') not in('canceled','cancelled','expired')
      and not o.needs_review and o.original_status in('wc-processing','wc-completed')
      and not exists(select 1 from public.serenity_legacy_orders_v1 r where r.parent_id=o.old_id and r.kind='shop_order_refund')
    order by t.next_check_at,t.order_id for update of t skip locked limit greatest(1,least(coalesce(p_limit,2),2))
  ) update public.serenity_legacy_shipment_tracking_v1 t
    set sync_state='syncing',lease_id=gen_random_uuid(),leased_at=now()
    from candidate c where t.order_id=c.order_id returning t.order_id,t.remote_id,t.operation,t.lease_id;
end $$;

create or replace function public.serenity_legacy_tracking_finish_v1(
 p_order uuid,p_remote uuid,p_operation uuid,p_lease uuid,p_status text default null,p_tracking text default null,p_error text default null
) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.serenity_legacy_shipment_tracking_v1%rowtype; s public.serenity_legacy_shipping_orders_v1%rowtype; recipient text; event_kind text;
begin
  perform pg_advisory_xact_lock(7391542026);
  select * into t from public.serenity_legacy_shipment_tracking_v1 where order_id=p_order for update;
  if not found or t.remote_id<>p_remote or t.operation<>p_operation or t.lease_id is distinct from p_lease or t.sync_state<>'syncing' then return false; end if;
  -- Bloqueia troca de vínculo durante a consulta. Nunca modifica a venda original.
  perform 1 from public.serenity_legacy_label_jobs_v1 j join public.serenity_legacy_label_purchases_v1 p on p.order_id=j.order_id
  where j.order_id=p_order and j.state='prepared' and j.remote_id=p_remote and p.remote_id=p_remote
    and j.operation=p_operation and p.operation=p_operation and p.phase in('paid','generating','ready')
    and coalesce(p.carrier_status,'') not in('canceled','cancelled','expired') for update of j,p;
  if not found then
    update public.serenity_legacy_shipment_tracking_v1 set sync_state='error',error_code='TRACKING_LINK_CHANGED',lease_id=null,leased_at=null,next_check_at=now()+interval '5 minutes' where order_id=p_order;
    return false;
  end if;
  if p_error is not null then
    update public.serenity_legacy_shipment_tracking_v1 set sync_state='error',error_code='LEGACY_TRACKING_SYNC_FAILED',lease_id=null,leased_at=null,next_check_at=now()+interval '5 minutes' where order_id=p_order;
    return true;
  end if;
  if p_status is null or p_status not in('pending','released','generated','received','posted','delivered','undelivered','suspended','paused','canceled','cancelled','expired') then raise exception 'TRACKING_STATUS'; end if;
  if p_tracking is not null and p_tracking !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$' then raise exception 'TRACKING_CODE'; end if;
  -- Não regride uma postagem já conhecida por resposta atrasada da transportadora.
  if t.carrier_status='posted' and p_status in('pending','released','generated','received') then p_status:='posted'; end if;
  update public.serenity_legacy_shipment_tracking_v1 set carrier_status=p_status,tracking_code=coalesce(p_tracking,tracking_code),sync_state='synced',error_code=null,lease_id=null,leased_at=null,last_checked_at=now(),next_check_at=now()+interval '5 minutes' where order_id=p_order;
  update public.serenity_legacy_label_purchases_v1 set carrier_status=p_status where order_id=p_order;
  select * into s from public.serenity_legacy_shipping_orders_v1 where id=p_order;
  if not exists(select 1 from public.serenity_legacy_orders_v1 o where o.old_id=s.legacy_id and not o.needs_review and o.original_status in('wc-processing','wc-completed') and not exists(select 1 from public.serenity_legacy_orders_v1 r where r.parent_id=o.old_id and r.kind='shop_order_refund')) then return true; end if;
  recipient:=lower(trim(s.customer_snapshot->>'email'));
  if recipient is null or length(recipient)>254 or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return true; end if;
  foreach event_kind in array case when p_status='delivered' then array['legacy_shipped','legacy_delivered'] when p_status='posted' then array['legacy_shipped'] when p_status in('undelivered','paused','suspended') then array['legacy_'||p_status] else array[]::text[] end loop
    insert into public.serenity_email_outbox_v1(legacy_shipping_id,kind,recipient,payload)
    values(s.id,event_kind,recipient,jsonb_build_object('number',s.number,'name',s.customer_snapshot->>'name','tracking',coalesce(p_tracking,t.tracking_code),'shipping_status',p_status))
    on conflict(legacy_shipping_id,kind) do nothing;
  end loop;
  if p_tracking is not null then update public.serenity_email_outbox_v1 set payload=jsonb_set(payload,'{tracking}',to_jsonb(p_tracking)) where legacy_shipping_id=p_order and kind='legacy_shipped' and state='pending'; end if;
  return true;
end $$;

create or replace function public.serenity_email_claim_v1(p_order uuid default null)
returns setof public.serenity_email_outbox_v1 language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update public.serenity_email_outbox_v1 q set state='failed',error_code='EMAIL_ORDER_INACTIVE'
    where state='pending' and exists(select 1 from public.serenity_orders o where o.id=q.order_id and o.status is distinct from 'paid');
  update public.serenity_email_outbox_v1 q set state='failed',error_code='EMAIL_WHOLESALE_INACTIVE'
    where state='pending' and kind='wholesale_approved' and not exists(
      select 1 from public.serenity_customer_accounts a join auth.users u on u.id=a.user_id
      where a.user_id=q.account_user_id and a.wholesale_status='approved' and u.email_confirmed_at is not null and lower(trim(u.email))=q.recipient
    );
  update public.serenity_email_outbox_v1 q set state='failed',error_code='EMAIL_LEGACY_INACTIVE'
    where state='pending' and legacy_shipping_id is not null and not exists(
      select 1 from public.serenity_legacy_shipping_orders_v1 s join public.serenity_legacy_orders_v1 o on o.old_id=s.legacy_id
      join public.serenity_legacy_label_purchases_v1 p on p.order_id=s.id
      join public.serenity_legacy_shipment_tracking_v1 t on t.order_id=s.id and t.remote_id=p.remote_id and t.operation=p.operation
      join public.serenity_legacy_label_jobs_v1 j on j.order_id=s.id and j.remote_id=t.remote_id and j.operation=t.operation and j.state='prepared'
      where s.id=q.legacy_shipping_id and not o.needs_review and o.original_status in('wc-processing','wc-completed')
        and p.phase in('paid','generating','ready') and p.carrier_status not in('canceled','cancelled','expired')
        and not exists(select 1 from public.serenity_legacy_orders_v1 r where r.parent_id=o.old_id and r.kind='shop_order_refund')
    );
  update public.serenity_email_outbox_v1 set state='review',error_code='EMAIL_DELIVERY_UNCERTAIN'
    where state='sending' and leased_at<now()-interval '5 minutes';
  return query with candidate as (
    select q.id from public.serenity_email_outbox_v1 q where q.state='pending' and q.available_at<=now()
      and (p_order is null or q.order_id=p_order)
    order by q.created_at,case q.kind when 'paid' then 0 when 'owner_paid' then 1 when 'shipped' then 2 else 3 end,q.id
    for update skip locked limit 1
  ) update public.serenity_email_outbox_v1 q set state='sending',attempts=q.attempts+1,lease_id=gen_random_uuid(),leased_at=now()
    from candidate c where q.id=c.id returning q.*;
end $$;

revoke all on function public.serenity_legacy_tracking_claim_v1(integer),public.serenity_legacy_tracking_finish_v1(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.serenity_legacy_tracking_claim_v1(integer),public.serenity_legacy_tracking_finish_v1(uuid,uuid,uuid,uuid,text,text,text) to service_role;

create or replace function public.serenity_email_shipping_update_v1(p_order uuid,p_status text,p_tracking text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.serenity_orders%rowtype; recipient text;
begin
  if p_status not in('undelivered','paused','suspended') then return; end if;
  select * into o from public.serenity_orders where id=p_order;
  if not found or o.source is distinct from 'site' or o.status is distinct from 'paid'
    or not exists(select 1 from public.serenity_checkout_sessions_v2 c where c.id=o.id and c.environment='production') then return; end if;
  recipient:=lower(trim(o.customer_snapshot->>'email'));
  if recipient is null or length(recipient)>254 or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return; end if;
  insert into public.serenity_email_outbox_v1(order_id,kind,recipient,payload)
  values(o.id,'shipping_'||p_status,recipient,jsonb_build_object('number',o.number,'name',o.customer_snapshot->>'name','tracking',left(p_tracking,120),'shipping_status',p_status))
  on conflict(order_id,kind) do nothing;
end $$;
revoke all on function public.serenity_email_shipping_update_v1(uuid,text,text) from public,anon,authenticated;
create or replace function public.serenity_email_shipping_event_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare row_data jsonb:=to_jsonb(new); shipment uuid; remote text; code text; status text;
begin
  shipment:=(row_data->>'order_id')::uuid;
  remote:=row_data->>'remote_id';
  -- Somente a etiqueta atualmente vinculada ao pedido pode gerar avisos.
  if remote is null or not exists(select 1 from public.serenity_label_purchases p where p.order_id=shipment and p.remote_id::text=remote and p.phase in ('paid','generating','ready') and coalesce(p.carrier_status,'') not in ('canceled','cancelled','expired')) then return new; end if;
  if tg_table_name='serenity_order_dispatches' then
    if row_data->>'dispatched_at' is not null then
      perform public.serenity_email_enqueue_v1(shipment,'shipped');
    end if;
  else
    status:=row_data->>'carrier_status'; code:=row_data->>'tracking_code';
    if status in ('posted','delivered') then perform public.serenity_email_enqueue_v1(shipment,'shipped',code); end if;
    if status='delivered' then perform public.serenity_email_enqueue_v1(shipment,'delivered',code); end if;
    if status in ('undelivered','paused','suspended') then perform public.serenity_email_shipping_update_v1(shipment,status,code); end if;
    -- Complementa rastreio ainda não enviado, sem criar outro aviso de postagem.
    if code is not null then update public.serenity_email_outbox_v1 set payload=jsonb_set(payload,'{tracking}',to_jsonb(left(code,120)))
      where order_id=shipment and kind='shipped' and state='pending'; end if;
  end if;
  return new;
end $$;
drop trigger if exists serenity_email_dispatch_event_v1 on public.serenity_order_dispatches;
create trigger serenity_email_dispatch_event_v1 after insert or update on public.serenity_order_dispatches
for each row execute function public.serenity_email_shipping_event_v1();
drop trigger if exists serenity_email_tracking_event_v1 on public.serenity_shipment_tracking;
create trigger serenity_email_tracking_event_v1 after insert or update on public.serenity_shipment_tracking
for each row execute function public.serenity_email_shipping_event_v1();

create or replace function public.serenity_legacy_tracking_my_v1(p_orders bigint[])
returns table(legacy_id bigint,carrier_status text,tracking_code text,last_checked_at timestamptz)
language sql stable security definer set search_path=pg_catalog,public as $$
 select s.legacy_id,t.carrier_status,t.tracking_code,t.last_checked_at
 from public.serenity_legacy_shipment_tracking_v1 t join public.serenity_legacy_shipping_orders_v1 s on s.id=t.order_id
 join public.serenity_legacy_orders_v1 o on o.old_id=s.legacy_id
 where o.old_id=any(p_orders) and o.account_user_id=auth.uid() and o.visible and not o.needs_review
   and exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
   and exists(select 1 from public.serenity_legacy_label_jobs_v1 j join public.serenity_legacy_label_purchases_v1 p on p.order_id=j.order_id
     where j.order_id=t.order_id and j.remote_id=t.remote_id and p.remote_id=t.remote_id and j.operation=t.operation and p.operation=t.operation and j.state='prepared');
$$;
revoke all on function public.serenity_legacy_tracking_my_v1(bigint[]) from public,anon;
grant execute on function public.serenity_legacy_tracking_my_v1(bigint[]) to authenticated,service_role;
revoke all on function public.serenity_email_claim_v1(uuid) from public,anon,authenticated;
grant execute on function public.serenity_email_claim_v1(uuid) to service_role;
commit;
