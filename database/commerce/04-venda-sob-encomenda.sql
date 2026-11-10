begin;
select pg_advisory_xact_lock(7391542026);

-- A loja trabalha com compra ao fornecedor, sem limite pelo saldo físico.
-- Os saldos existentes são preservados em backup privado antes da ativação.
create table if not exists public.serenity_unlimited_sales_v1 (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into public.serenity_unlimited_sales_v1 values(true,false) on conflict do nothing;
alter table public.serenity_unlimited_sales_v1 enable row level security;
revoke all on public.serenity_unlimited_sales_v1 from public,anon,authenticated;
grant all on public.serenity_unlimited_sales_v1 to service_role;
create table if not exists public.serenity_unlimited_stock_backup_v1 (
 entity text not null, id uuid not null, stock_status text, stock_quantity integer,
 saved_at timestamptz not null default now(), primary key(entity,id)
);
alter table public.serenity_unlimited_stock_backup_v1 enable row level security;
revoke all on public.serenity_unlimited_stock_backup_v1 from public,anon,authenticated;
grant all on public.serenity_unlimited_stock_backup_v1 to service_role;

create or replace function public.serenity_unlimited_sales_enabled_v1()
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select enabled from public.serenity_unlimited_sales_v1 where singleton),false);
$$;
revoke all on function public.serenity_unlimited_sales_enabled_v1() from public,anon,authenticated;
grant execute on function public.serenity_unlimited_sales_enabled_v1() to service_role;

create or replace function public.serenity_unlimited_stock_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare eligible boolean;
begin
 if not public.serenity_unlimited_sales_enabled_v1() then return new; end if;
 if tg_table_name='products' then
  eligible:=new.status='published' and new.visibility<>'hidden';
 else
  select new.enabled and p.status='published' and p.visibility<>'hidden' into eligible
   from public.products p where p.id=new.product_id;
 end if;
 if coalesce(eligible,false) then
  insert into public.serenity_unlimited_stock_backup_v1(entity,id,stock_status,stock_quantity)
   values(tg_table_name,new.id,new.stock_status,new.stock_quantity) on conflict do nothing;
  new.stock_quantity:=null;
  new.stock_status:='instock';
 end if;
 return new;
end $$;
revoke all on function public.serenity_unlimited_stock_v1() from public,anon,authenticated;
drop trigger if exists serenity_unlimited_stock_v1 on public.products;
create trigger serenity_unlimited_stock_v1 before insert or update on public.products
 for each row execute function public.serenity_unlimited_stock_v1();
drop trigger if exists serenity_unlimited_stock_v1 on public.product_variants;
create trigger serenity_unlimited_stock_v1 before insert or update on public.product_variants
 for each row execute function public.serenity_unlimited_stock_v1();
update public.serenity_unlimited_sales_v1 set enabled=true where singleton;
update public.products set stock_quantity=stock_quantity where status='published' and visibility<>'hidden';
update public.product_variants v set stock_quantity=v.stock_quantity from public.products p
 where v.product_id=p.id and v.enabled and p.status='published' and p.visibility<>'hidden';

-- A conclusão original mantém validações financeiras, estoque, variações,
-- cupons, preços salvos, frete e idempotência. Só a data de expiração deixa
-- de bloquear um pagamento já aprovado quando esse modo está ativo.
do $$
declare original text; changed text; matches integer;
begin
 if to_regprocedure('public.serenity_unlimited_complete_base_v1(uuid)') is null then
  original:=pg_get_functiondef('public.serenity_checkout_complete_order_v2(uuid)'::regprocedure);
  select count(*) into matches from regexp_matches(original,'or checkout[.]expires_at <= now\(\)','g');
  if matches<>1 then raise exception 'A validação de expiração mudou. Nenhuma alteração aplicada.'; end if;
  changed:=replace(original,'or checkout.expires_at <= now()',
   'or (checkout.expires_at <= now() and not public.serenity_unlimited_sales_enabled_v1())');
  changed:=replace(changed,'public.serenity_checkout_complete_order_v2(', 'public.serenity_unlimited_complete_base_v1(');
  if changed=original then raise exception 'Não foi possível preservar a conclusão original.'; end if;
  execute changed;
 end if;
end $$;
revoke all on function public.serenity_unlimited_complete_base_v1(uuid) from public,anon,authenticated;
grant execute on function public.serenity_unlimited_complete_base_v1(uuid) to service_role;

create or replace function public.serenity_checkout_complete_order_v2(p_attempt uuid)
returns uuid language plpgsql set search_path='' as $$
declare p public.serenity_checkout_payments_v2%rowtype;
 c public.serenity_checkout_sessions_v2%rowtype; until_at timestamptz:=now()+interval '15 minutes';
begin
 perform pg_advisory_xact_lock(7391542026);
 select * into p from public.serenity_checkout_payments_v2 where id=p_attempt for update;
 if public.serenity_unlimited_sales_enabled_v1() and found
   and p.environment='production' and p.state='approved' and p.provider_status='approved'
   and p.provider_payment_id is not null and p.refunded_cents=0 then
  select * into c from public.serenity_checkout_sessions_v2 where id=p.checkout_id for update;
  if found and c.order_id is null and c.environment='production'
    and c.total_cents=p.amount_cents and not c.shipping_pending
    and c.state in ('pending','payment_pending','review','expired') then
   -- Não renova o acesso do navegador nem muda data, preço ou valor do pagamento.
   if c.state='expired' then
    update public.serenity_checkout_sessions_v2 set state='review',updated_at=now() where id=c.id;
   end if;
   perform public.serenity_stock_assert(c.id,c.order_items);
   update public.serenity_checkout_stock_v2 set state='released' where checkout_id=c.id and state='active';
   insert into public.serenity_checkout_stock_v2(checkout_id,entity_key,product_id,variant_id,quantity,state,expires_at)
    select c.id,coalesce(nullif(x->>'variant_id',''),'product:'||(x->>'product_id')),
     (x->>'product_id')::uuid,nullif(x->>'variant_id','')::uuid,sum((x->>'quantity')::integer)::integer,'active',until_at
    from jsonb_array_elements(c.order_items) x group by 1,2,3,4
   on conflict(checkout_id,entity_key) do update set quantity=excluded.quantity,state='active',expires_at=excluded.expires_at;
   -- Os limites, o snapshot e o valor do cupom ainda são checados pela função original.
   update public.serenity_checkout_coupon_v2 set state='reserved',expires_at=until_at
    where checkout_id=c.id and state in ('reserved','released');
  end if;
 end if;
 return public.serenity_unlimited_complete_base_v1(p_attempt);
end $$;
revoke all on function public.serenity_checkout_complete_order_v2(uuid) from public,anon,authenticated;
grant execute on function public.serenity_checkout_complete_order_v2(uuid) to service_role;
update public.serenity_commerce_settings_v1 set version=version+1 where singleton;
notify pgrst,'reload schema';
commit;
