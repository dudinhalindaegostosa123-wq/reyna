-- Somente tabelas criadas pelo instalador; nunca concede leitura de clientes a anon.
do $$ declare tablename text; signature text;
begin
 foreach tablename in array array['products','product_variants','serenity_product_commercial',
  'serenity_commerce_settings_v1','serenity_promotion_campaigns','serenity_promotion_items'] loop
  if to_regclass('public.'||tablename) is not null then
   execute format('grant select on public.%I to service_role',tablename);
  end if;
 end loop;
 grant update(stock_quantity,stock_status) on public.products,public.product_variants to service_role;
 grant execute on function public.serenity_target_effective_price(uuid,uuid,numeric,numeric,timestamptz,timestamptz) to service_role;
 foreach tablename in array array[
  'serenity_customers','serenity_customer_accounts','serenity_wholesale_settings',
  'serenity_shipping_settings','serenity_shipping_quotes','serenity_orders','serenity_coupons',
  'serenity_coupon_products','serenity_coupon_redemptions','serenity_stock_reservations','serenity_stock_events',
  'serenity_checkout_rate_limits'
 ] loop
  execute format('alter table public.%I enable row level security',tablename);
  execute format('revoke all on public.%I from public,anon,authenticated',tablename);
  execute format('grant select,insert,update,delete on public.%I to service_role',tablename);
 end loop;
 -- Every newly installed routine has server-only execution. Existing price helpers are preserved.
 for signature in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname ~ '^serenity_(checkout|stock|wholesale|customer_account|customer_profile|admin_wholesale|shipping_settings_save|coupon_order_state|admin_order_status|lunarity_policy)'
 loop
  execute 'revoke all on function '||signature||' from public,anon,authenticated';
  execute 'grant execute on function '||signature||' to service_role';
 end loop;
end $$;
grant usage,select on sequence public.serenity_orders_number_seq,public.serenity_stock_events_id_seq to service_role;
revoke all on sequence public.serenity_orders_number_seq,public.serenity_stock_events_id_seq from public,anon,authenticated;
grant select on public.serenity_customer_accounts,public.serenity_customers,public.serenity_orders to authenticated;
create policy lunarity_account_self_read on public.serenity_customer_accounts for select to authenticated using(user_id=(select auth.uid()));
create policy lunarity_customer_self_read on public.serenity_customers for select to authenticated using(exists(
 select 1 from public.serenity_customer_accounts a where a.customer_id=id and a.user_id=(select auth.uid())
));
create policy lunarity_orders_self_read on public.serenity_orders for select to authenticated using(account_user_id=(select auth.uid()));
create trigger lunarity_stock_insert after insert on public.serenity_orders for each row execute function public.serenity_stock_order_trigger();
create trigger lunarity_stock_status after update of status on public.serenity_orders for each row
 when(old.status is distinct from new.status) execute function public.serenity_stock_order_trigger();
create trigger lunarity_coupon_status after update of status on public.serenity_orders for each row execute function public.serenity_coupon_order_state();

-- Initial status-only workflow: no shipment is marked as prepared or dispatched.
create view public.serenity_admin_order_workflow with(security_invoker=true) as
 select o.*,case o.status when 'pending' then 'awaiting_payment' when 'paid' then 'paid'
  when 'cancelled' then 'cancelled' when 'refunded' then 'refunded' else 'unknown' end as workflow_stage
 from public.serenity_orders o;
revoke all on public.serenity_admin_order_workflow from public,anon,authenticated;
grant select on public.serenity_admin_order_workflow to service_role;
