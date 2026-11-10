begin;
create table if not exists public.serenity_analytics_context_v1 (
 checkout_id uuid primary key references public.serenity_checkout_sessions_v2(id),
 context jsonb not null,created_at timestamptz not null default now()
);
create table if not exists public.serenity_analytics_outbox_v1 (
 order_id uuid primary key references public.serenity_orders(id),
 measurement_id text not null,context jsonb not null,payload jsonb not null,
 occurred_at timestamptz not null,state text not null default 'pending' check(state in('pending','sending','sent','review','blocked')),
 attempts integer not null default 0,lease_id uuid,leased_at timestamptz,sent_at timestamptz,error_code text,
 created_at timestamptz not null default now()
);
alter table public.serenity_analytics_context_v1 enable row level security;
alter table public.serenity_analytics_outbox_v1 enable row level security;
revoke all on public.serenity_analytics_context_v1,public.serenity_analytics_outbox_v1 from public,anon,authenticated;
grant all on public.serenity_analytics_context_v1,public.serenity_analytics_outbox_v1 to service_role;
create or replace function public.serenity_analytics_enqueue_v1(p_checkout uuid)
returns void language plpgsql security definer set search_path='' as $$
declare o public.serenity_orders%rowtype;a public.serenity_analytics_context_v1%rowtype;lines jsonb;
begin
 select * into a from public.serenity_analytics_context_v1 where checkout_id=p_checkout;
 if not found then return;end if;
 select orders.* into o from public.serenity_orders orders
 join public.serenity_checkout_sessions_v2 c on c.id=orders.id and c.order_id=orders.id and c.environment='production' and c.state='converted'
 where orders.id=p_checkout and orders.source='site' and orders.status='paid' and exists(
  select 1 from public.serenity_checkout_payments_v2 p where p.checkout_id=c.id and p.environment='production' and p.state='approved' and p.application_state='applied'
   and p.provider_status='approved' and p.provider_payment_id is not null and p.refunded_cents=0 and p.amount_cents=c.total_cents and p.amount_cents=round(orders.total*100)::bigint
 );
 if not found then return;end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'item_id',coalesce(nullif(to_jsonb(v)->>'woo_id',''),nullif(to_jsonb(pr)->>'woo_id',''),nullif(i->>'sku',''),i->>'product_id'),
  'name',i->>'name','quantity',i->'quantity','unit_price',i->'unit_price'
 )),'[]'::jsonb) into lines from jsonb_array_elements(o.items) i
 left join public.products pr on pr.id::text=i->>'product_id'
 left join public.product_variants v on v.id::text=i->>'variant_id';
 insert into public.serenity_analytics_outbox_v1(order_id,measurement_id,context,payload,occurred_at)
 values(o.id,a.context->>'measurementId',a.context,jsonb_build_object('subtotal',o.subtotal,'discount',o.discount,'shipping',o.shipping,'total',o.total,'items',lines),coalesce(o.paid_at,now()))
 on conflict(order_id) do nothing;
end $$;
create or replace function public.serenity_analytics_capture_v1(p_checkout uuid,p_access_hash text,p_context jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.serenity_checkout_sessions_v2%rowtype;clean jsonb;
begin
 if jsonb_typeof(p_context) is distinct from 'object' or length(p_context::text)>3000
  or coalesce(p_context->>'measurementId','')!~'^G-[A-Z0-9]{4,20}$'
  or coalesce(p_context->>'clientId','')!~'^[0-9]{1,20}\.[0-9]{1,20}$'
  or coalesce(p_context->>'sessionId','')!~'^[0-9]{1,16}$'
 then return false;end if;
 select * into c from public.serenity_checkout_sessions_v2 where id=p_checkout for share;
 if not found or c.environment<>'production' or c.access_hash is distinct from p_access_hash or c.access_expires_at<=now() or c.order_id is not null then return false;end if;
 clean:=jsonb_build_object('measurementId',p_context->>'measurementId','clientId',p_context->>'clientId','sessionId',p_context->>'sessionId');
 if length(p_context->>'gclid')<=256 and p_context->>'gclid' ~ '^[A-Za-z0-9_-]+$' then clean:=clean||jsonb_build_object('gclid',p_context->>'gclid');end if;
 if length(p_context->>'gbraid')<=256 and p_context->>'gbraid' ~ '^[A-Za-z0-9_-]+$' then clean:=clean||jsonb_build_object('gbraid',p_context->>'gbraid');end if;
 if length(p_context->>'wbraid')<=256 and p_context->>'wbraid' ~ '^[A-Za-z0-9_-]+$' then clean:=clean||jsonb_build_object('wbraid',p_context->>'wbraid');end if;
 if p_context->>'adUserData' in('granted','denied') then clean:=clean||jsonb_build_object('adUserData',p_context->>'adUserData');end if;
 if p_context->>'adPersonalization' in('granted','denied') then clean:=clean||jsonb_build_object('adPersonalization',p_context->>'adPersonalization');end if;
 insert into public.serenity_analytics_context_v1(checkout_id,context) values(c.id,clean) on conflict(checkout_id) do nothing;
 return true;
end $$;
create or replace function public.serenity_analytics_payment_trigger_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state='approved' and new.application_state='applied' then
  begin perform public.serenity_analytics_enqueue_v1(new.checkout_id);
  exception when others then raise log 'SERENITY_ANALYTICS_ENQUEUE_FAILED %',SQLSTATE;end;
 end if;
 return new;
end $$;
drop trigger if exists serenity_analytics_payment_v1 on public.serenity_checkout_payments_v2;
create trigger serenity_analytics_payment_v1 after insert or update of state,application_state on public.serenity_checkout_payments_v2
 for each row execute function public.serenity_analytics_payment_trigger_v1();
create or replace function public.serenity_analytics_claim_v1(p_limit integer default 3)
returns setof public.serenity_analytics_outbox_v1 language plpgsql security definer set search_path='' as $$
declare missing record;
begin
 for missing in select a.checkout_id from public.serenity_analytics_context_v1 a join public.serenity_orders o on o.id=a.checkout_id and o.status='paid' left join public.serenity_analytics_outbox_v1 q on q.order_id=o.id where q.order_id is null and o.paid_at>now()-interval '71 hours' order by o.paid_at limit 20 loop
  begin perform public.serenity_analytics_enqueue_v1(missing.checkout_id);exception when others then raise log 'SERENITY_ANALYTICS_ENQUEUE_FAILED %',SQLSTATE;end;
 end loop;
 update public.serenity_analytics_outbox_v1 set state='review',error_code='ANALYTICS_DELIVERY_UNCERTAIN' where state='sending' and leased_at<now()-interval '5 minutes';
 update public.serenity_analytics_outbox_v1 q set state='blocked',error_code='ANALYTICS_ORDER_INACTIVE' where state='pending' and not exists(select 1 from public.serenity_orders o where o.id=q.order_id and o.status='paid' and exists(select 1 from public.serenity_checkout_payments_v2 p where p.checkout_id=o.id and p.environment='production' and p.state='approved' and p.application_state='applied' and p.refunded_cents=0));
 update public.serenity_analytics_outbox_v1 set state='blocked',error_code='ANALYTICS_RETRY_EXHAUSTED' where state='pending' and attempts>=5;
 update public.serenity_analytics_outbox_v1 set state='blocked',error_code='ANALYTICS_EVENT_TOO_OLD' where state='pending' and occurred_at<now()-interval '71 hours';
 return query with candidate as(select order_id from public.serenity_analytics_outbox_v1 where state='pending' and attempts<5 order by created_at limit greatest(1,least(p_limit,10)) for update skip locked)
 update public.serenity_analytics_outbox_v1 q set state='sending',attempts=attempts+1,lease_id=gen_random_uuid(),leased_at=now()
 from candidate c where q.order_id=c.order_id returning q.*;
end $$;
create or replace function public.serenity_analytics_finish_v1(p_order uuid,p_lease uuid,p_state text,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_state not in('sent','review','blocked','pending') or (p_error is not null and p_error!~'^[A-Z0-9_]{1,80}$') then raise exception 'ANALYTICS_STATE';end if;
 update public.serenity_analytics_outbox_v1 set state=p_state,error_code=p_error,sent_at=case when p_state='sent' then now() else sent_at end where order_id=p_order and lease_id=p_lease and state='sending';
 return found;
end $$;
revoke all on function public.serenity_analytics_enqueue_v1(uuid),public.serenity_analytics_capture_v1(uuid,text,jsonb),public.serenity_analytics_payment_trigger_v1(),public.serenity_analytics_claim_v1(integer),public.serenity_analytics_finish_v1(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.serenity_analytics_capture_v1(uuid,text,jsonb),public.serenity_analytics_claim_v1(integer),public.serenity_analytics_finish_v1(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
