begin;
select pg_advisory_xact_lock(7391542030);

-- Apenas eventos novos. Não reenvia mensagens para pedidos antigos.
create table if not exists public.serenity_email_outbox_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.serenity_orders(id),
  kind text not null check (kind in ('paid','shipped','delivered')),
  recipient text not null,
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending','sending','sent','review','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_id uuid,
  leased_at timestamptz,
  sent_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  unique (order_id,kind)
);
alter table public.serenity_email_outbox_v1 enable row level security;
revoke all on public.serenity_email_outbox_v1 from anon, authenticated;
grant all on public.serenity_email_outbox_v1 to service_role;
create index if not exists serenity_email_pending_v1 on public.serenity_email_outbox_v1(available_at,created_at) where state='pending';

create or replace function public.serenity_email_enqueue_v1(p_order uuid,p_kind text,p_tracking text default null)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.serenity_orders%rowtype; recipient text; lines jsonb;
begin
  if p_kind not in ('paid','shipped','delivered') then raise exception 'EMAIL_KIND'; end if;
  select * into o from public.serenity_orders where id=p_order;
  -- Nunca notificar pagamentos de teste ou pedidos sem pagamento aplicado.
  if not found or o.source is distinct from 'site' or o.status is distinct from 'paid' or not exists (
    select 1 from public.serenity_checkout_sessions_v2 c where c.id=o.id and c.environment='production'
  ) then return; end if;
  recipient:=lower(trim(o.customer_snapshot->>'email'));
  if recipient is null or length(recipient)>254 or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return; end if;
  -- Não inclui CPF, endereço, custo ou fornecedor no conteúdo da fila.
  select coalesce(jsonb_agg(jsonb_build_object('name',i->>'name','variation',i->>'variation','quantity',i->'quantity','unit_price',i->'unit_price')),'[]'::jsonb)
    into lines from jsonb_array_elements(coalesce(o.items,'[]'::jsonb)) i;
  insert into public.serenity_email_outbox_v1(order_id,kind,recipient,payload)
  values(o.id,p_kind,recipient,jsonb_build_object('number',o.number,'name',o.customer_snapshot->>'name','total',o.total,'items',lines,'tracking',left(p_tracking,120)))
  on conflict(order_id,kind) do nothing;
end $$;

create or replace function public.serenity_email_order_event_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.status='paid' and (tg_op='INSERT' or old.status is distinct from 'paid') then
    perform public.serenity_email_enqueue_v1(new.id,'paid');
  end if;
  return new;
end $$;
drop trigger if exists serenity_email_order_event_v1 on public.serenity_orders;
create trigger serenity_email_order_event_v1 after insert or update of status on public.serenity_orders
for each row execute function public.serenity_email_order_event_v1();

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

create or replace function public.serenity_email_claim_v1(p_order uuid default null)
returns setof public.serenity_email_outbox_v1 language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  -- Não enviar avisos que ficaram pendentes após cancelamento/estorno.
  update public.serenity_email_outbox_v1 q set state='failed',error_code='EMAIL_ORDER_INACTIVE'
    where state='pending' and exists(select 1 from public.serenity_orders o where o.id=q.order_id and o.status is distinct from 'paid');
  -- SMTP não oferece idempotência. Após queda no envio, conferir antes de reenviar.
  update public.serenity_email_outbox_v1 set state='review',error_code='EMAIL_DELIVERY_UNCERTAIN'
    where state='sending' and leased_at<now()-interval '5 minutes';
  return query with candidate as (
    select id from public.serenity_email_outbox_v1 q where state='pending' and available_at<=now()
      and (p_order is null or order_id=p_order)
    order by created_at,case kind when 'paid' then 0 when 'shipped' then 1 else 2 end,id
    for update skip locked limit 1
  ) update public.serenity_email_outbox_v1 q set state='sending',attempts=q.attempts+1,lease_id=gen_random_uuid(),leased_at=now()
    from candidate c where q.id=c.id returning q.*;
end $$;

create or replace function public.serenity_email_finish_v1(p_id uuid,p_lease uuid,p_result text,p_code text default null)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare changed integer;
begin
  if p_result not in ('sent','retry','review') then raise exception 'EMAIL_RESULT'; end if;
  update public.serenity_email_outbox_v1 set
    state=case when p_result='retry' and attempts<5 then 'pending' when p_result='retry' then 'failed' else p_result end,
    available_at=now()+interval '15 minutes',sent_at=case when p_result='sent' then now() else sent_at end,
    error_code=left(p_code,80),lease_id=null,leased_at=null
    where id=p_id and state='sending' and lease_id=p_lease;
  get diagnostics changed=row_count;
  return changed=1;
end $$;

revoke all on function public.serenity_email_enqueue_v1(uuid,text,text) from public,anon,authenticated;
revoke all on function public.serenity_email_order_event_v1() from public,anon,authenticated;
revoke all on function public.serenity_email_shipping_event_v1() from public,anon,authenticated;
revoke all on function public.serenity_email_claim_v1(uuid) from public,anon,authenticated;
revoke all on function public.serenity_email_finish_v1(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.serenity_email_claim_v1(uuid),public.serenity_email_finish_v1(uuid,uuid,text,text) to service_role;
commit;
