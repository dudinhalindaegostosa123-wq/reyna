begin;
create table if not exists public.serenity_checkout_contacts_v1 (
 id uuid primary key,
 token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
 name text not null check(length(btrim(name)) between 2 and 180),
 email text not null check(length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 100),
 estimated_cents bigint not null check(estimated_cents between 0 and 10000000000),
 environment text not null check(environment in('test','production')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists serenity_checkout_contacts_activity_v1 on public.serenity_checkout_contacts_v1(updated_at desc);
alter table public.serenity_checkout_contacts_v1 enable row level security;
revoke all on public.serenity_checkout_contacts_v1 from public,anon,authenticated;
grant select,insert,update,delete on public.serenity_checkout_contacts_v1 to service_role;
create or replace function public.serenity_checkout_contact_save_v1(p_id uuid,p_token_hash text,p_name text,p_email text,p_items jsonb,p_estimated_cents bigint,p_environment text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_id is null or p_token_hash is null or p_name is null or p_email is null or p_items is null or p_estimated_cents is null or p_environment is null then raise exception 'CONTACT_INVALID';end if;
 insert into public.serenity_checkout_contacts_v1(id,token_hash,name,email,items,estimated_cents,environment)
 values(p_id,p_token_hash,btrim(p_name),lower(btrim(p_email)),p_items,p_estimated_cents,p_environment)
 on conflict(id) do update set name=excluded.name,email=excluded.email,items=excluded.items,estimated_cents=excluded.estimated_cents,updated_at=now()
 where serenity_checkout_contacts_v1.token_hash=excluded.token_hash and serenity_checkout_contacts_v1.environment=excluded.environment;
 if not found then raise exception 'CONTACT_ACCESS';end if;
 -- Limit retention of these contact snapshots; payment/order history is independent.
 delete from public.serenity_checkout_contacts_v1 where updated_at<now()-interval '90 days';
end $$;
revoke all on function public.serenity_checkout_contact_save_v1(uuid,text,text,text,jsonb,bigint,text) from public,anon,authenticated;
grant execute on function public.serenity_checkout_contact_save_v1(uuid,text,text,text,jsonb,bigint,text) to service_role;
notify pgrst,'reload schema';
commit;
