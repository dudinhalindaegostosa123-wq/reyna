-- Usa o segredo serenity_cron_secret já utilizado pelo rastreamento e e-mails.
-- Não salvar tokens do Mercado Pago neste SQL.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $install$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='serenity_cron_secret' and length(decrypted_secret)>=32) then
  raise exception 'O segredo serenity_cron_secret precisa existir no Vault e ser igual ao CRON_SECRET de Production da Vercel. Nenhuma alteração aplicada.';
 end if;
 perform cron.schedule('serenity-pagamentos-5-minutos','1-59/5 * * * *',$job$
  select net.http_get(
   url:='https://serenitypiercings.com.br/api/cron/pagamentos',
   headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='serenity_cron_secret' limit 1)),
   timeout_milliseconds:=55000
  );
 $job$);
end $install$;
commit;
