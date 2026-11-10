begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $install$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='serenity_cron_secret' and length(decrypted_secret)>=32) then raise exception 'Confira o segredo serenity_cron_secret no Vault, igual ao CRON_SECRET da Vercel.';end if;
 perform cron.schedule('serenity-analytics-5-minutos','3-59/5 * * * *',$job$
  select net.http_get(url:='https://serenitypiercings.com.br/api/cron/analytics',headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='serenity_cron_secret' limit 1)),timeout_milliseconds:=55000);
 $job$);
end $install$;
commit;
