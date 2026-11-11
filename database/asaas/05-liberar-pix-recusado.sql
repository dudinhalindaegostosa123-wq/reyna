-- Recuperação administrativa de Pix recusado com HTTP 400 e sem cobrança criada.
-- O servidor deve consultar a conta Asaas e verificar ausência pela referência
-- exata ANTES de chamar esta função. Não aceita timeouts, cartão ou pagamento já criado.
begin;
create or replace function public.serenity_asaas_release_rejected_pix_v1(
 p_attempt uuid,p_expected_updated_at timestamptz,p_actor uuid
) returns jsonb language plpgsql set search_path='' as $$
declare attempt public.serenity_checkout_payments_v2%rowtype;checkout public.serenity_checkout_sessions_v2%rowtype;
 retry_available boolean;event jsonb;
begin
 perform pg_advisory_xact_lock(7391542026);
 if p_actor is null or not public.serenity_checkout_account_confirmed_v2(p_actor) then raise exception 'PAYMENT_ADMIN_REQUIRED';end if;
 select * into attempt from public.serenity_checkout_payments_v2 where id=p_attempt for update;
 if not found then raise exception 'PAYMENT_ATTEMPT_INVALID';end if;
 select * into checkout from public.serenity_checkout_sessions_v2 where id=attempt.checkout_id for update;
 if attempt.provider='asaas' and attempt.method='pix' and attempt.state='rejected'
  and attempt.last_error_code='ASAAS_REJECTED_NO_CHARGE' then
  return jsonb_build_object('released',true,'retry_available',checkout.state='pending' and checkout.expires_at>now()+interval '1 minute');
 end if;
 if attempt.provider<>'asaas' or attempt.method<>'pix' or attempt.state<>'uncertain'
  or attempt.application_state<>'review' or not attempt.blocks_new_attempt
  or attempt.last_error_code<>'ASAAS_HTTP_400' or attempt.provider_payment_id is not null
  or attempt.asaas_customer_id is null or attempt.lease_id is not null or attempt.lease_expires_at is not null
  or attempt.updated_at is distinct from p_expected_updated_at
  or checkout.order_id is not null or checkout.state not in('review','payment_pending','pending','expired')
  or exists(select 1 from public.serenity_orders where id=checkout.id)
  or exists(select 1 from public.serenity_checkout_payments_v2 where checkout_id=checkout.id and id<>attempt.id
    and (blocks_new_attempt or application_state='review' or state in('approved','refunded','charged_back'))) then
  raise exception 'PAYMENT_RECOVERY_UNAVAILABLE';
 end if;
 retry_available:=checkout.expires_at>now()+interval '1 minute' and not checkout.shipping_pending;
 update public.serenity_checkout_payments_v2 set state='rejected',application_state='applied',blocks_new_attempt=false,
  provider_status='rejected',provider_status_detail='http_400_no_charge',last_error_code='ASAAS_REJECTED_NO_CHARGE',updated_at=now()
 where id=attempt.id;
 update public.serenity_checkout_sessions_v2 set state=case when retry_available then 'pending' else 'expired' end,updated_at=now()
 where id=checkout.id;
 if not retry_available then
  update public.serenity_checkout_stock_v2 set state='released' where checkout_id=checkout.id and state='active';
  update public.serenity_checkout_coupon_v2 set state='released' where checkout_id=checkout.id and state='reserved';
 end if;
 event:=jsonb_build_object('state','rejected','reason','ASAAS_HTTP_400_NO_CHARGE','actor',p_actor);
 insert into public.serenity_checkout_payment_events_v2(attempt_id,source,event_key,snapshot)
 values(attempt.id,'admin',encode(sha256(convert_to(event::text,'UTF8')),'hex'),event)
 on conflict(attempt_id,event_key) do nothing;
 return jsonb_build_object('released',true,'retry_available',retry_available);
end $$;
revoke all on function public.serenity_asaas_release_rejected_pix_v1(uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.serenity_asaas_release_rejected_pix_v1(uuid,timestamptz,uuid) to service_role;
notify pgrst,'reload schema';
commit;

select to_regprocedure('public.serenity_asaas_release_rejected_pix_v1(uuid,timestamp with time zone,uuid)') is not null as recuperacao_pix_instalada;
