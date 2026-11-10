begin;
select pg_advisory_xact_lock(7391542026);
-- Preserve the installed eligibility rules; only add the material exclusions.
do $migration$
declare original text;
begin
 if to_regprocedure('public.serenity_collection_is_jewel_base_v3(uuid)') is null then
  original:=pg_get_functiondef('public.serenity_collection_is_jewel_v1(uuid)'::regprocedure);
  execute replace(original,'FUNCTION public.serenity_collection_is_jewel_v1(','FUNCTION public.serenity_collection_is_jewel_base_v3(');
 end if;
end $migration$;
create or replace function public.serenity_collection_is_jewel_v1(p_product uuid)
returns boolean language sql stable set search_path='' as $$
 select coalesce(public.serenity_collection_is_jewel_base_v3(p.id),false)
 and lower(coalesce(p.material,'')||' '||coalesce(p.name,'')||' '||coalesce(array_to_string(p.categories,' '),'')) !~ 'bio[[:space:]-]*flex'
 and not (
  -- Titanium with a gold coating is a different material from solid gold.
  lower(coalesce(nullif(btrim(p.material),''),p.name||' '||coalesce(array_to_string(p.categories,' '),''))) !~ '(tit[âa]nio|titanium|revestid|banhad|folhead|plated|pvd)'
  and lower(coalesce(nullif(btrim(p.material),''),p.name||' '||coalesce(array_to_string(p.categories,' '),''))) ~ '(ouro|gold)'
  and (lower(coalesce(p.material,'')) ~ '^[[:space:]]*(ouro|gold)[[:space:]]*$'
   or lower(coalesce(p.material,'')||' '||coalesce(p.name,'')||' '||coalesce(array_to_string(p.categories,' '),'')) ~ '(18[[:space:]-]*(k|kt|quilat|karat)|750)')
 )
 from public.products p where p.id=p_product;
$$;
revoke all on function public.serenity_collection_is_jewel_base_v3(uuid),public.serenity_collection_is_jewel_v1(uuid) from public,anon,authenticated;
grant execute on function public.serenity_collection_is_jewel_base_v3(uuid),public.serenity_collection_is_jewel_v1(uuid) to service_role;
notify pgrst,'reload schema';
commit;
