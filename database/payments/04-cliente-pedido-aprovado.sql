begin;
select pg_advisory_xact_lock(7391542026);

-- Um perfil incompleto não pode esconder uma venda já paga.
-- Usa exclusivamente o snapshot e o proprietário do checkout aprovado;
-- não procura pessoas por e-mail e não altera permissões de conta/atacado.
create or replace function public.serenity_checkout_customer_for_order_v1(p_checkout uuid)
returns uuid language plpgsql set search_path='' as $$
declare c public.serenity_checkout_sessions_v2%rowtype; customer uuid;
begin
 perform pg_advisory_xact_lock(7391542026);
 select * into c from public.serenity_checkout_sessions_v2 where id=p_checkout for update;
 if not found or c.account_user_id is null or c.environment<>'production'
  or not exists(select 1 from public.serenity_checkout_payments_v2 p
   where p.checkout_id=c.id and p.environment='production' and p.state='approved'
    and p.provider_status='approved' and p.provider_payment_id is not null
    and p.amount_cents=c.total_cents and p.refunded_cents=0) then
  raise exception 'PAYMENT_APPROVAL_REQUIRED';
 end if;
 select a.customer_id into customer from public.serenity_customer_accounts a where a.user_id=c.account_user_id;
 if customer is not null then return customer; end if;
 if exists(select 1 from public.serenity_customers where id=c.id) then
  raise exception 'CUSTOMER_ORDER_CONFLICT';
 end if;
 insert into public.serenity_customers(id,name,email,phone)
 values(c.id,c.customer_snapshot->>'name',c.customer_snapshot->>'email',c.customer_snapshot->>'phone');
 update public.serenity_customer_accounts set customer_id=c.id
 where user_id=c.account_user_id and customer_id is null;
 return c.id;
end $$;
revoke all on function public.serenity_checkout_customer_for_order_v1(uuid) from public,anon,authenticated;
grant execute on function public.serenity_checkout_customer_for_order_v1(uuid) to service_role;

do $install$
declare target regprocedure; original text; changed text; matches integer;
 pattern constant text := 'if[[:space:]]+customer_id[[:space:]]+is[[:space:]]+null[[:space:]]+then[[:space:]]+raise[[:space:]]+exception[[:space:]]+''CUSTOMER_ACCOUNT_UNAVAILABLE'';[[:space:]]+end[[:space:]]+if;';
begin
 target:=coalesce(to_regprocedure('public.serenity_unlimited_complete_base_v1(uuid)'),to_regprocedure('public.serenity_checkout_complete_order_v2(uuid)'));
 if target is null then raise exception 'Conclusão de pagamento não instalada.'; end if;
 original:=pg_get_functiondef(target);
 if position('serenity_checkout_customer_for_order_v1(checkout.id)' in original)>0 then return; end if;
 select count(*) into matches from regexp_matches(original,pattern,'gi');
 if matches<>1 then raise exception 'A conclusão de clientes mudou. Nenhuma alteração aplicada.'; end if;
 changed:=regexp_replace(original,pattern,
  'if customer_id is null then customer_id := public.serenity_checkout_customer_for_order_v1(checkout.id); end if;','i');
 execute changed;
end $install$;
-- Preserva no painel o motivo técnico quando ele é um código conhecido,
-- sem salvar dados pessoais de mensagens de erro livres.
do $diagnostic$
declare original text; changed text; matches integer;
 pattern constant text := 'get stacked diagnostics code = returned_sqlstate;[[:space:]]*application := ''review''; error_code := ''PAYMENT_ORDER_'' [|][|] code;';
begin
 original:=pg_get_functiondef('public.serenity_checkout_observe_payment_v2(uuid,jsonb,text)'::regprocedure);
 if position('message_text; -- Serenity payment reason v1' in original)>0 then return; end if;
 select count(*) into matches from regexp_matches(original,pattern,'gi');
 if matches<>1 then
  -- Esta melhoria é opcional: não altera uma função desconhecida e não
  -- impede instalar a correção independente do cadastro do cliente.
  return;
 end if;
 changed:=regexp_replace(original,pattern,$patch$
 get stacked diagnostics code = returned_sqlstate, error_code = message_text; -- Serenity payment reason v1
 application := 'review';
 error_code := 'PAYMENT_ORDER_' || case when error_code ~ '^[A-Z][A-Z0-9_]{1,50}$' then error_code else code end;
 $patch$,'i');
 execute changed;
end $diagnostic$;
notify pgrst,'reload schema';
commit;
