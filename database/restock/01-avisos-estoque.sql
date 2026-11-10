begin;
create table if not exists public.serenity_restock_subscriptions_v1 (
 id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id) on delete cascade,variant_id uuid references public.product_variants(id) on delete cascade,
 email text not null,token text not null default (replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')),
 state text not null default 'waiting' check(state in('waiting','sending','sent','retry','review','cancelled')),
 attempts integer not null default 0,lease_id uuid,leased_at timestamptz,next_attempt_at timestamptz not null default now(),
 error_code text,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '90 days',sent_at timestamptz
);
create unique index if not exists serenity_restock_unique_v1 on public.serenity_restock_subscriptions_v1(product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid),email);
create index if not exists serenity_restock_waiting_v1 on public.serenity_restock_subscriptions_v1(state,next_attempt_at,created_at);
create table if not exists public.serenity_restock_rate_v1(bucket timestamptz not null,key text not null,requests integer not null,primary key(bucket,key));
alter table public.serenity_restock_subscriptions_v1 enable row level security;
alter table public.serenity_restock_rate_v1 enable row level security;
revoke all on public.serenity_restock_subscriptions_v1,public.serenity_restock_rate_v1 from public,anon,authenticated;
grant all on public.serenity_restock_subscriptions_v1,public.serenity_restock_rate_v1 to service_role;

create or replace function public.serenity_restock_available_v1(p_product uuid,p_variant uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select p.status='published' and p.visibility<>'hidden' and p.stock_status='instock' and (
  (p.product_type='simple' and p_variant is null and (p.stock_quantity is null or p.stock_quantity>coalesce((select sum(r.quantity) from public.serenity_stock_reservations r where r.product_id=p.id and r.variant_id is null and r.state='reserved' and r.expires_at>now()),0)))
  or (p.product_type='variable' and exists(select 1 from public.product_variants v where v.product_id=p.id and (p_variant is null or v.id=p_variant) and v.enabled and v.stock_status='instock' and (v.stock_quantity is null or v.stock_quantity>coalesce((select sum(r.quantity) from public.serenity_stock_reservations r where r.variant_id=v.id and r.state='reserved' and r.expires_at>now()),0))))
 ) from public.products p where p.id=p_product),false);
$$;
create or replace function public.serenity_restock_subscribe_v1(p_slug text,p_variant text,p_email text,p_key text)
returns void language plpgsql security definer set search_path='' as $$
declare product public.products%rowtype;variant uuid;normalized text:=lower(btrim(p_email));requests integer;
begin
 if p_slug is null or length(p_slug)>180 or p_key is null or p_key !~ '^[a-f0-9]{64}$' or normalized is null or length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'RESTOCK_INPUT';end if;
 perform pg_advisory_xact_lock(7391542026);
 select * into product from public.products where slug=p_slug and status='published' and visibility<>'hidden';
 if not found then raise exception 'RESTOCK_PRODUCT';end if;
 if coalesce(p_variant,'')<>'' then
  select v.id into variant from public.product_variants v where v.product_id=product.id and v.enabled and (v.id::text=p_variant or v.woo_id::text=p_variant);
  if not found or product.product_type<>'variable' then raise exception 'RESTOCK_VARIANT';end if;
 end if;
 if public.serenity_restock_available_v1(product.id,variant) then raise exception 'RESTOCK_AVAILABLE';end if;
 insert into public.serenity_restock_rate_v1 as rate(bucket,key,requests) values(date_trunc('hour',now()),p_key,1) on conflict(bucket,key) do update set requests=rate.requests+1 returning rate.requests into requests;
 if requests>20 then raise exception 'RESTOCK_RATE';end if;
 if (select count(*) from public.serenity_restock_subscriptions_v1 where email=normalized and state in('waiting','retry','sending') and expires_at>now())>=50 then raise exception 'RESTOCK_RATE';end if;
 insert into public.serenity_restock_subscriptions_v1 as s(product_id,variant_id,email) values(product.id,variant,normalized)
 on conflict(product_id,(coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)),email) do update set
 id=case when s.state in('sent','cancelled','review') or s.expires_at<now() then gen_random_uuid() else s.id end,
 token=case when s.state in('sent','cancelled','review') or s.expires_at<now() then replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','') else s.token end,
 state=case when s.state in('sent','cancelled','review') or s.expires_at<now() then 'waiting' else s.state end,
 attempts=case when s.state in('sent','cancelled','review') or s.expires_at<now() then 0 else s.attempts end,
 next_attempt_at=now(),expires_at=now()+interval '90 days';
 delete from public.serenity_restock_rate_v1 where bucket<now()-interval '2 days';
end $$;
create or replace function public.serenity_restock_claim_v1()
returns table(id uuid,lease_id uuid,recipient text,name text,variation text,slug text,variant text,token text)
language plpgsql security definer set search_path='' as $$
declare job public.serenity_restock_subscriptions_v1%rowtype;
begin
 update public.serenity_restock_subscriptions_v1 s set state='review',error_code='EMAIL_DELIVERY_UNCERTAIN' where s.state='sending' and s.leased_at<now()-interval '10 minutes';
 delete from public.serenity_restock_subscriptions_v1 s where s.expires_at<now() and s.state<>'sending';
 select s.* into job from public.serenity_restock_subscriptions_v1 s where s.state in('waiting','retry') and s.expires_at>now() and s.next_attempt_at<=now()
 and public.serenity_restock_available_v1(s.product_id,s.variant_id) order by s.created_at,s.id for update skip locked limit 1;
 if not found then return;end if;
 update public.serenity_restock_subscriptions_v1 s set state='sending',lease_id=gen_random_uuid(),leased_at=now(),attempts=s.attempts+1 where s.id=job.id returning s.* into job;
 return query select job.id,job.lease_id,job.email,p.name,coalesce(v.name,''),p.slug,coalesce(v.woo_id::text,v.id::text,''),job.token from public.products p left join public.product_variants v on v.id=job.variant_id where p.id=job.product_id;
end $$;
create or replace function public.serenity_restock_ready_v1(p_id uuid,p_lease uuid)
returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.serenity_restock_subscriptions_v1 s where s.id=p_id and s.lease_id=p_lease and s.state='sending' and public.serenity_restock_available_v1(s.product_id,s.variant_id));
$$;
create or replace function public.serenity_restock_finish_v1(p_id uuid,p_lease uuid,p_result text,p_code text default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_result is null or p_result not in('sent','retry','review','waiting') then raise exception 'RESTOCK_INPUT';end if;
 update public.serenity_restock_subscriptions_v1 s set state=case when p_result='retry' and s.attempts>=5 then 'review' else p_result end,
 sent_at=case when p_result='sent' then now() else s.sent_at end,error_code=left(p_code,80),lease_id=null,leased_at=null,next_attempt_at=now()+interval '15 minutes'
 where s.id=p_id and s.lease_id=p_lease and s.state='sending';
 return found;
end $$;
create or replace function public.serenity_restock_cancel_v1(p_token text)
returns void language sql security definer set search_path='' as $$
 update public.serenity_restock_subscriptions_v1 set state='cancelled',lease_id=null,leased_at=null where token=p_token and length(p_token)=64;
$$;
revoke all on function public.serenity_restock_available_v1(uuid,uuid),public.serenity_restock_subscribe_v1(text,text,text,text),public.serenity_restock_claim_v1(),public.serenity_restock_ready_v1(uuid,uuid),public.serenity_restock_finish_v1(uuid,uuid,text,text),public.serenity_restock_cancel_v1(text) from public,anon,authenticated;
grant execute on function public.serenity_restock_available_v1(uuid,uuid),public.serenity_restock_subscribe_v1(text,text,text,text),public.serenity_restock_claim_v1(),public.serenity_restock_ready_v1(uuid,uuid),public.serenity_restock_finish_v1(uuid,uuid,text,text),public.serenity_restock_cancel_v1(text) to service_role;
notify pgrst,'reload schema';
commit;
