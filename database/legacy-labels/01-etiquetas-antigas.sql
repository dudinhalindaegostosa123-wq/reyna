begin;
select pg_advisory_xact_lock(7391542026);

-- Registros exclusivamente logísticos: nunca cria uma venda em serenity_orders.
create table if not exists public.serenity_legacy_shipping_orders_v1 (
  id uuid primary key default gen_random_uuid(),
  legacy_id bigint not null unique references public.serenity_legacy_orders_v1(old_id),
  number bigint not null, created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  customer_snapshot jsonb not null, delivery_address jsonb not null,
  items jsonb not null, shipping_details jsonb not null,
  subtotal numeric not null, discount numeric not null default 0,
  shipping numeric not null default 0, total numeric not null,
  status text not null default 'paid' check(status='paid'),
  shipping_pending boolean not null default false,
  source text not null default 'legacy' check(source='legacy'),
  intent text not null check(intent in('new','existing')), actor uuid not null
);
create table if not exists public.serenity_legacy_label_drafts_v1
  (like public.serenity_label_drafts including defaults including constraints including indexes);
create table if not exists public.serenity_legacy_label_jobs_v1
  (like public.serenity_label_jobs including defaults including constraints including indexes);
create table if not exists public.serenity_legacy_label_purchases_v1
  (like public.serenity_label_purchases including defaults including constraints including indexes);
create table if not exists public.serenity_legacy_label_events_v1 (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.serenity_legacy_shipping_orders_v1(id),
  operation uuid, state text, remote_id uuid, actor uuid not null, created_at timestamptz not null default now()
);
create table if not exists public.serenity_legacy_label_purchase_events_v1 (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.serenity_legacy_shipping_orders_v1(id),
  phase text not null, actor uuid not null, created_at timestamptz not null default now()
);

do $install$
declare t text; f record; definition text; ref text[]; suffix text; signatures integer:=0;
begin
  foreach t in array array['shipping_orders','label_drafts','label_jobs','label_purchases','label_events','label_purchase_events'] loop
    execute format('alter table public.serenity_legacy_%I_v1 enable row level security',t);
    execute format('revoke all on public.serenity_legacy_%I_v1 from public,anon,authenticated',t);
    execute format('grant all on public.serenity_legacy_%I_v1 to service_role',t);
  end loop;
  foreach t in array array['drafts','jobs','purchases'] loop
    if not exists(select 1 from pg_constraint where conname='legacy_label_'||t||'_order_fk' and conrelid=to_regclass('public.serenity_legacy_label_'||t||'_v1')) then
      execute format('alter table public.serenity_legacy_label_%I_v1 add constraint %I foreign key(order_id) references public.serenity_legacy_shipping_orders_v1(id)',t,'legacy_label_'||t||'_order_fk');
    end if;
  end loop;
  -- Copia apenas as operações de etiqueta instaladas, mantendo seus locks e verificações.
  for f in select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array[
      'serenity_label_save_draft','serenity_label_job_quote','serenity_label_job_claim','serenity_label_job_finish',
      'serenity_label_purchase_review','serenity_label_purchase_observe','serenity_label_purchase_claim','serenity_label_purchase_note',
      'serenity_label_draft_job_guard','serenity_label_purchase_order_guard'])
  loop
    definition:=pg_get_functiondef(f.oid);
    for ref in select regexp_matches(definition,'public\.(serenity_[a-z0-9_]+)','g') loop
      if ref[1]<>all(array[f.proname,'serenity_orders','serenity_label_sender','serenity_shipping_settings',
        'serenity_label_drafts','serenity_label_jobs','serenity_label_purchases','serenity_label_events','serenity_label_purchase_events']) then
        raise exception 'A estrutura de etiquetas mudou (%). Nenhuma alteração aplicada.',ref[1];
      end if;
    end loop;
    definition:=replace(definition,'public.'||f.proname||'(', 'public.'||replace(f.proname,'serenity_label_','serenity_legacy_label_')||'_v1(');
    foreach suffix in array array['purchase_events','events','purchases','drafts','jobs'] loop
      definition:=replace(definition,'serenity_label_'||suffix,'serenity_legacy_label_'||suffix||'_v1');
    end loop;
    -- O nome da própria função já foi substituído e não contém os nomes de tabelas completos.
    definition:=replace(definition,'public.serenity_orders','public.serenity_legacy_shipping_orders_v1');
    execute definition;
    execute format('revoke all on function public.%I(%s) from public,anon,authenticated',replace(f.proname,'serenity_label_','serenity_legacy_label_')||'_v1',f.args);
    execute format('grant execute on function public.%I(%s) to service_role',replace(f.proname,'serenity_label_','serenity_legacy_label_')||'_v1',f.args);
    signatures:=signatures+1;
  end loop;
  if signatures<>10 then raise exception 'Funções de etiquetas incompletas. Nenhuma alteração aplicada.'; end if;
end $install$;

drop trigger if exists legacy_draft_guard on public.serenity_legacy_label_drafts_v1;
create trigger legacy_draft_guard before insert or update on public.serenity_legacy_label_drafts_v1
for each row execute function public.serenity_legacy_label_draft_job_guard_v1();

-- Impede uma mesma etiqueta vinculada a dois pedidos, inclusive entre sites.
create or replace function public.serenity_legacy_label_remote_guard_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(7391542026);
  if new.remote_id is not null and (
    (tg_table_name='serenity_label_jobs' and exists(select 1 from public.serenity_legacy_label_jobs_v1 where remote_id=new.remote_id))
    or (tg_table_name='serenity_legacy_label_jobs_v1' and exists(select 1 from public.serenity_label_jobs where remote_id=new.remote_id))
  ) then raise exception 'LABEL_REMOTE_ALREADY_LINKED'; end if;
  return new;
end $$;
revoke all on function public.serenity_legacy_label_remote_guard_v1() from public,anon,authenticated;
drop trigger if exists legacy_remote_unique on public.serenity_label_jobs;
create trigger legacy_remote_unique before insert or update of remote_id on public.serenity_label_jobs for each row execute function public.serenity_legacy_label_remote_guard_v1();
drop trigger if exists legacy_remote_unique on public.serenity_legacy_label_jobs_v1;
create trigger legacy_remote_unique before insert or update of remote_id on public.serenity_legacy_label_jobs_v1 for each row execute function public.serenity_legacy_label_remote_guard_v1();

create or replace function public.serenity_legacy_label_start_v1(p_old bigint,p_intent text,p_actor uuid)
returns uuid language plpgsql set search_path='' as $$
declare old_order public.serenity_legacy_orders_v1%rowtype; found_id uuid; snapshot_items jsonb; item_subtotal numeric;
begin
  perform pg_advisory_xact_lock(7391542026);
  if p_actor is null or p_intent is null or p_intent not in('new','existing') then raise exception 'LEGACY_LABEL_INVALID'; end if;
  select * into old_order from public.serenity_legacy_orders_v1 where old_id=p_old for share;
  if not found or old_order.kind<>'shop_order' or not old_order.visible or old_order.needs_review
    or old_order.original_status not in('wc-processing','wc-completed')
    or exists(select 1 from public.serenity_legacy_orders_v1 where parent_id=p_old and kind='shop_order_refund')
  then raise exception 'LEGACY_LABEL_REVIEW'; end if;
  select id into found_id from public.serenity_legacy_shipping_orders_v1 where legacy_id=p_old for update;
  if found then
    if exists(select 1 from public.serenity_legacy_label_jobs_v1 where order_id=found_id and state in('creating','prepared','uncertain')) then return found_id; end if;
    update public.serenity_legacy_shipping_orders_v1 set intent=p_intent where id=found_id;
    return found_id;
  end if;
  if exists(select 1 from public.serenity_legacy_items_v1 where order_id=p_old and kind='line_item' and (
    coalesce(payload->>'quantidade','') !~ '^[1-9][0-9]{0,5}$' or coalesce(payload->>'total','') !~ '^[0-9]+([.][0-9]+)?$'
  )) then raise exception 'LEGACY_LABEL_ITEMS'; end if;
  -- Distribui centavos entre unidades, sem perder o total original da linha.
  with lines as (
    select name,(payload->>'quantidade')::bigint qty,
      round(((payload->>'total')::numeric+coalesce(nullif(nullif(payload->>'imposto','NULL'),''),'0')::numeric)*100)::bigint cents
    from public.serenity_legacy_items_v1 where order_id=p_old and kind='line_item'
  ), parts as (
    select name,part.quantity,part.unit_price from lines cross join lateral (
      values(qty-cents%qty,(cents/qty)::numeric/100),(cents%qty,(cents/qty+1)::numeric/100)
    ) part(quantity,unit_price) where part.quantity>0
  ) select jsonb_agg(jsonb_build_object('name',name,'quantity',quantity,'unit_price',unit_price)),sum(quantity*unit_price)
    into snapshot_items,item_subtotal from parts;
  if snapshot_items is null or item_subtotal<0 then raise exception 'LEGACY_LABEL_ITEMS'; end if;
  insert into public.serenity_legacy_shipping_orders_v1(legacy_id,number,created_at,customer_snapshot,delivery_address,items,shipping_details,subtotal,shipping,total,intent,actor)
  values(p_old,p_old,old_order.created_at,
    jsonb_build_object('name',concat_ws(' ',nullif(old_order.payload->>'primeiro_nome','NULL'),nullif(old_order.payload->>'sobrenome','NULL')),
      'email',coalesce(old_order.payload->>'email',''),'phone',coalesce(nullif(old_order.payload->>'telefone','NULL'),''),'document',''),
    case when coalesce(nullif(old_order.payload->>'entrega_endereco','NULL'),'')<>'' then
      jsonb_build_object('cep',coalesce(nullif(old_order.payload->>'entrega_cep','NULL'),''),'street',old_order.payload->>'entrega_endereco','complement',coalesce(nullif(old_order.payload->>'entrega_complemento','NULL'),''),'city',coalesce(nullif(old_order.payload->>'entrega_cidade','NULL'),''),'state',coalesce(nullif(old_order.payload->>'entrega_estado','NULL'),''))
    else jsonb_build_object('cep',coalesce(nullif(old_order.payload->>'cep','NULL'),''),'street',coalesce(nullif(old_order.payload->>'endereco','NULL'),''),'complement',coalesce(nullif(old_order.payload->>'complemento','NULL'),''),'city',coalesce(nullif(old_order.payload->>'cidade','NULL'),''),'state',coalesce(nullif(old_order.payload->>'estado','NULL'),'')) end,
    snapshot_items,'{"manual":false}'::jsonb,item_subtotal,
    coalesce((select sum((payload->>'custo_frete')::numeric) from public.serenity_legacy_items_v1 where order_id=p_old and kind='shipping' and payload->>'custo_frete' ~ '^[0-9]+([.][0-9]+)?$'),0),old_order.total,p_intent,p_actor)
  returning id into found_id;
  return found_id;
end $$;
revoke all on function public.serenity_legacy_label_start_v1(bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.serenity_legacy_label_start_v1(bigint,text,uuid) to service_role;

create or replace function public.serenity_legacy_label_bind_v1(p_order uuid,p_remote uuid,p_context jsonb,p_selected jsonb,p_price numeric,p_actor uuid)
returns void language plpgsql set search_path='' as $$
declare operation_id uuid; o public.serenity_legacy_shipping_orders_v1%rowtype;
begin
  perform pg_advisory_xact_lock(7391542026);
  select * into o from public.serenity_legacy_shipping_orders_v1 where id=p_order for update;
  if not found or p_actor is null or p_remote is null or jsonb_typeof(p_context) is distinct from 'object'
    or jsonb_typeof(p_selected) is distinct from 'object' or not(p_context ? 'external_binding') then raise exception 'LEGACY_LABEL_INVALID'; end if;
  if exists(select 1 from public.serenity_legacy_label_jobs_v1 where order_id=p_order and state='prepared' and remote_id=p_remote) then return; end if;
  if exists(select 1 from public.serenity_legacy_label_jobs_v1 where order_id=p_order) then raise exception 'LABEL_JOB_LOCKED'; end if;
  operation_id:=gen_random_uuid();
  insert into public.serenity_legacy_label_jobs_v1(order_id,operation,state,order_version,sender_version,draft_version,settings_version,context,quotes,selected,quote_expires,remote_id,remote_price,actor)
  values(p_order,operation_id,'prepared',o.updated_at,0,0,0,p_context,jsonb_build_array(p_selected),p_selected,now(),p_remote,p_price,p_actor);
  update public.serenity_legacy_shipping_orders_v1 set intent='existing' where id=p_order;
  insert into public.serenity_legacy_label_events_v1(order_id,operation,state,remote_id,actor) values(p_order,operation_id,'prepared',p_remote,p_actor);
end $$;
revoke all on function public.serenity_legacy_label_bind_v1(uuid,uuid,jsonb,jsonb,numeric,uuid) from public,anon,authenticated;
grant execute on function public.serenity_legacy_label_bind_v1(uuid,uuid,jsonb,jsonb,numeric,uuid) to service_role;

-- Mesma central, com identificação explícita dos pedidos antigos.
create or replace view public.serenity_admin_label_center_v2 with(security_barrier=true) as
select c.*,'current'::text source_kind,null::bigint legacy_id,null::text legacy_intent from public.serenity_admin_label_center_v1 c
union all
select o.id,o.number,o.created_at,coalesce(nullif(o.customer_snapshot->>'name',''),'Cliente não informado'),o.shipping_pending,
  coalesce(o.shipping_details->>'company',''),coalesce(o.shipping_details->>'service',''),coalesce(j.state,'empty'),coalesce(p.phase,'empty'),
  case when j.state in('creating','uncertain') or p.phase in('buying','uncertain','blocked') then 'review'
    when o.intent='existing' and j.order_id is null then 'unverified'
    when p.phase in('paid','generating','ready') and p.carrier_status in('posted','delivered') then 'shipped'
    when p.phase in('paid','generating','ready') then 'purchased' else 'to_buy' end,
  'Conferir envio'::text,''::text,'Pedido do site antigo'::text,'legacy'::text,o.legacy_id,o.intent
from public.serenity_legacy_shipping_orders_v1 o
left join public.serenity_legacy_label_jobs_v1 j on j.order_id=o.id
left join public.serenity_legacy_label_purchases_v1 p on p.order_id=o.id
union all
select md5('serenity-legacy-label:'||h.old_id::text)::uuid,h.old_id,h.created_at,
  coalesce(nullif(concat_ws(' ',nullif(h.payload->>'primeiro_nome','NULL'),nullif(h.payload->>'sobrenome','NULL')),''),'Cliente não informado'),
  true,''::text,''::text,'empty'::text,'empty'::text,'unverified'::text,'Conferir etiqueta antiga'::text,''::text,'A importação não informa se a etiqueta já foi comprada.'::text,'legacy'::text,h.old_id,null::text
from public.serenity_legacy_orders_v1 h
where h.kind='shop_order' and h.visible and not h.needs_review and h.original_status in('wc-processing','wc-completed')
  and not exists(select 1 from public.serenity_legacy_shipping_orders_v1 where legacy_id=h.old_id)
  and not exists(select 1 from public.serenity_legacy_orders_v1 where parent_id=h.old_id and kind='shop_order_refund');
revoke all on public.serenity_admin_label_center_v2 from public,anon,authenticated;
grant select on public.serenity_admin_label_center_v2 to service_role;
grant usage,select on sequence public.serenity_legacy_label_events_v1_id_seq,public.serenity_legacy_label_purchase_events_v1_id_seq to service_role;
notify pgrst,'reload schema';
commit;
