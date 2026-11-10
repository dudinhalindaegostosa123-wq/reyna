-- Após instalar 01 e confirmar o deploy Ready. Reutiliza o agendador de e-mails existente.
-- O Vault precisa conter serenity_cron_secret com o CRON_SECRET de Production.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='serenity_cron_secret' and length(decrypted_secret)>=32) then raise exception 'Cadastre serenity_cron_secret no Vault com o CRON_SECRET de Production. Não envie o valor pelo chat.';end if;
 perform cron.schedule('serenity-emails-5-minutos','2-59/5 * * * *',$job$
  select net.http_get(url:='https://serenitypiercings.com.br/api/cron/emails',headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='serenity_cron_secret' limit 1)),timeout_milliseconds:=55000);
 $job$);
end $$;
commit;
