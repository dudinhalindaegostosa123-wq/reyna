begin;
select pg_advisory_xact_lock(7391542030);

-- Requer 01 e 02 instalados. Somente novas solicitações e aprovações.
alter table public.serenity_email_outbox_v1 alter column order_id drop not null;
alter table public.serenity_email_outbox_v1
  add column if not exists account_user_id uuid references public.serenity_customer_accounts(user_id),
  add column if not exists event_version bigint;
alter table public.serenity_email_outbox_v1 drop constraint if exists serenity_email_outbox_v1_kind_check;
alter table public.serenity_email_outbox_v1 add constraint serenity_email_outbox_v1_kind_check
  check (kind in ('paid','owner_paid','shipped','delivered','wholesale_requested','wholesale_approved'));
alter table public.serenity_email_outbox_v1 drop constraint if exists serenity_email_scope_v1;
alter table public.serenity_email_outbox_v1 add constraint serenity_email_scope_v1 check (
  (kind in ('wholesale_requested','wholesale_approved') and order_id is null and account_user_id is not null and event_version is not null)
  or (kind in ('paid','owner_paid','shipped','delivered') and order_id is not null and account_user_id is null)
);
create unique index if not exists serenity_email_wholesale_event_v1
  on public.serenity_email_outbox_v1(account_user_id,kind,event_version);

create or replace function public.serenity_email_wholesale_event_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare previous_status text; event_kind text; destination text; customer_name text; customer_email text;
begin
  if tg_op='UPDATE' then previous_status:=old.wholesale_status; end if;
  if new.wholesale_status='pending' and previous_status is distinct from 'pending' then
    event_kind:='wholesale_requested';
  elsif new.wholesale_status='approved' and previous_status is distinct from 'approved' then
    event_kind:='wholesale_approved';
  else return new;
  end if;

  -- Utiliza o e-mail confirmado da conta, não um destinatário enviado pelo navegador.
  select c.name,lower(trim(u.email)) into customer_name,customer_email
  from public.serenity_customers c join auth.users u on u.id=new.user_id
  where c.id=new.customer_id and u.email_confirmed_at is not null;
  if not found then return new; end if;
  destination:=case when event_kind='wholesale_requested' then 'contato@serenitypiercings.com.br' else customer_email end;
  if destination is null or length(destination)>254 or destination !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return new; end if;

  -- Uma reaprovação substitui avisos de aprovação ainda pendentes, sem repetir enviados.
  if event_kind='wholesale_approved' then
    update public.serenity_email_outbox_v1 set state='failed',error_code='EMAIL_WHOLESALE_SUPERSEDED'
    where account_user_id=new.user_id and kind='wholesale_approved' and state='pending';
  end if;
  insert into public.serenity_email_outbox_v1(account_user_id,event_version,kind,recipient,payload)
  values(new.user_id,new.version,event_kind,destination,jsonb_build_object('name',customer_name,'email',customer_email))
  on conflict(account_user_id,kind,event_version) do nothing;
  return new;
end $$;

drop trigger if exists serenity_email_wholesale_event_v1 on public.serenity_customer_accounts;
create trigger serenity_email_wholesale_event_v1 after insert or update of wholesale_status on public.serenity_customer_accounts
for each row execute function public.serenity_email_wholesale_event_v1();

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

revoke all on function public.serenity_email_wholesale_event_v1() from public,anon,authenticated;
revoke all on function public.serenity_email_claim_v1(uuid) from public,anon,authenticated;
grant execute on function public.serenity_email_claim_v1(uuid) to service_role;
commit;
