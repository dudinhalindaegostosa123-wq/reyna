begin;
select pg_advisory_xact_lock(7391542026);
create table if not exists public.serenity_campaign_limit_backups_v1 (
 signature text primary key,definition text not null,saved_at timestamptz not null default now()
);
alter table public.serenity_campaign_limit_backups_v1 enable row level security;
revoke all on public.serenity_campaign_limit_backups_v1 from public,anon,authenticated;
grant all on public.serenity_campaign_limit_backups_v1 to service_role;
do $migration$
declare fn record; original text; changed text; inspected text; found_save boolean:=false;
 item_length text:='jsonb_array_length\([[:space:]]*p_items[[:space:]]*\)';
begin
 for fn in select p.oid,p.proname,p.oid::regprocedure::text as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'serenity_promotion_%' and p.prokind='f' loop
  if fn.proname='serenity_promotion_save_draft' then found_save:=true;end if;
  original:=pg_get_functiondef(fn.oid);
  changed:=regexp_replace(original,item_length||'[[:space:]]+not[[:space:]]+between[[:space:]]+1[[:space:]]+and[[:space:]]+500\M','jsonb_array_length(p_items) < 1','gi');
  changed:=regexp_replace(changed,item_length||'[[:space:]]+between[[:space:]]+1[[:space:]]+and[[:space:]]+500\M','jsonb_array_length(p_items) >= 1','gi');
  changed:=regexp_replace(changed,item_length||'[[:space:]]*(>[[:space:]]*500|>=[[:space:]]*501)\M','false','gi');
  -- Never silently accept an unrecognized installation containing another 500-item check.
  inspected:=regexp_replace(changed,$rx$'([^']|'')*'$rx$,'','g');
  if inspected ~ '\m(500|501)\M' then
   raise exception 'Validação de limite não reconhecida em %. Nenhuma alteração aplicada. Envie a definição dessa função para adaptar a migração.',fn.signature;
  end if;
  if changed<>original then
   insert into public.serenity_campaign_limit_backups_v1(signature,definition) values(fn.signature,original) on conflict do nothing;
   execute changed;
  end if;
 end loop;
 if not found_save then raise exception 'A função serenity_promotion_save_draft não está instalada. Nenhuma alteração aplicada.';end if;
end $migration$;
notify pgrst,'reload schema';
commit;
