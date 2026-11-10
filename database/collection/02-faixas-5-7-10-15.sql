begin;
select pg_advisory_xact_lock(7391542026);
-- New quotes only. Existing payment snapshots and completed orders are preserved.
create table if not exists public.serenity_collection_tier_backups_v2 (
 signature text primary key,definition text not null,saved_at timestamptz not null default now()
);
alter table public.serenity_collection_tier_backups_v2 enable row level security;
revoke all on public.serenity_collection_tier_backups_v2 from public,anon,authenticated;
grant all on public.serenity_collection_tier_backups_v2 to service_role;
do $migration$
declare original text;changed text;assignment text;matches integer;
 pattern text:='percent[[:space:]]*:=[[:space:]]*case[^;]+end[[:space:]]*;';
begin
 original:=pg_get_functiondef('public.serenity_checkout_coupon_quote_v2(jsonb,text,text,uuid)'::regprocedure);
 if position('Serenity progressive tiers v2' in original)>0 then return;end if;
 if position('serenity_collection_coupon_base_v1' in original)=0
  or position('serenity_collection_is_jewel_v1' in original)=0
 then raise exception 'A campanha progressiva instalada mudou. Nenhuma alteração aplicada.';end if;
 select count(*) into matches from regexp_matches(original,pattern,'gi');
 select match[1] into assignment from regexp_matches(original,'('||pattern||')','i') as match;
 if matches<>1 or lower(regexp_replace(coalesce(assignment,''),'[[:space:]]','','g'))<>
  'percent:=casewhenunits>=4then20whenunits=3then15whenunits=2then10else0end;'
 then raise exception 'As faixas instaladas mudaram. Nenhuma alteração aplicada.';end if;
 insert into public.serenity_collection_tier_backups_v2(signature,definition)
 values('public.serenity_checkout_coupon_quote_v2(jsonb,text,text,uuid)',original) on conflict do nothing;
 changed:=regexp_replace(original,pattern,
  '/* Serenity progressive tiers v2 */ percent := case when units >= 5 then 15 when units = 4 then 10 when units = 3 then 7 when units = 2 then 5 else 0 end;','i');
 execute changed;
end $migration$;
notify pgrst,'reload schema';
commit;
