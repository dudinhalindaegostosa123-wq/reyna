-- Executar APÓS instalar 04 e o deploy correspondente estar Ready.
-- Antes: no Supabase → Vault, salvar o CRON_SECRET da Vercel como serenity_cron_secret.
-- Não colocar esse segredo no chat ou no GitHub.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $install$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='serenity_cron_secret' and length(decrypted_secret)>=32) then
    raise exception 'Cadastre no Vault um segredo chamado serenity_cron_secret, com o mesmo CRON_SECRET de Production da Vercel. Nenhum agendamento criado.';
  end if;
  perform cron.schedule('serenity-logistica-5-minutos','*/5 * * * *',$job$
    select net.http_get(
      url:='https://serenitypiercings.com.br/api/cron/rastreamento',
      headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='serenity_cron_secret' limit 1)),
      timeout_milliseconds:=55000
    );
  $job$);
  perform cron.schedule('serenity-emails-5-minutos','2-59/5 * * * *',$job$
    select net.http_get(
      url:='https://serenitypiercings.com.br/api/cron/emails',
      headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='serenity_cron_secret' limit 1)),
      timeout_milliseconds:=55000
    );
  $job$);
end $install$;
commit;
