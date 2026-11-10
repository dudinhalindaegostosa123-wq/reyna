begin;
alter table public.serenity_checkout_contacts_v1 add column if not exists phone text;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.serenity_checkout_contacts_v1'::regclass and conname='serenity_checkout_contact_phone_v1')then
  alter table public.serenity_checkout_contacts_v1 add constraint serenity_checkout_contact_phone_v1 check(phone is null or phone ~ '^55[1-9][0-9]{9,10}$');
 end if;
end $$;
-- The original seven-argument function stays available to older deployed clients.
create or replace function public.serenity_checkout_contact_save_v1(p_id uuid,p_token_hash text,p_name text,p_email text,p_items jsonb,p_estimated_cents bigint,p_environment text,p_phone text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_phone is not null and p_phone !~ '^55[1-9][0-9]{9,10}$' then raise exception 'CONTACT_PHONE';end if;
 perform public.serenity_checkout_contact_save_v1(p_id,p_token_hash,p_name,p_email,p_items,p_estimated_cents,p_environment);
 update public.serenity_checkout_contacts_v1 set phone=p_phone where id=p_id and token_hash=p_token_hash and environment=p_environment;
end $$;
revoke all on function public.serenity_checkout_contact_save_v1(uuid,text,text,text,jsonb,bigint,text,text) from public,anon,authenticated;
grant execute on function public.serenity_checkout_contact_save_v1(uuid,text,text,text,jsonb,bigint,text,text) to service_role;
notify pgrst,'reload schema';
commit;
