begin;
select pg_advisory_xact_lock(7391542026);
create or replace function public.serenity_price_category_slug_v1(p_name text)
returns text language sql immutable set search_path='' as $$
 select btrim(regexp_replace(lower(regexp_replace(normalize(coalesce(p_name,''),NFD),U&'[\0300-\036f]','','g')),'[^a-z0-9]+','-','g'),'-');
$$;
create or replace function public.serenity_price_category_matches_v1(p_product uuid,p_slug text)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.products p cross join lateral unnest(coalesce(p.categories,'{}'::text[])) as category(name)
  where p.id=p_product and public.serenity_price_category_slug_v1(category.name)=p_slug);
$$;
revoke all on function public.serenity_price_category_slug_v1(text),public.serenity_price_category_matches_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.serenity_price_category_slug_v1(text),public.serenity_price_category_matches_v1(uuid,text) to service_role;

do $repair$
declare signature text;original text;changed text;matches integer;parameter text;pattern text;
begin
 foreach signature in array array[
  'public.serenity_category_prices_v1(text,numeric,uuid,uuid,text)',
  'public.serenity_price_promotions_v1(text,text,numeric,uuid,uuid,text)'
 ] loop
  if to_regprocedure(signature) is null then continue;end if;
  original:=pg_get_functiondef(signature::regprocedure);
  if position('serenity_price_category_matches_v1' in original)>0 then continue;end if;
  parameter:=case when signature like 'public.serenity_category_prices_v1%' then 'p_category' else 'p_value' end;
  pattern:=parameter||$pattern$[[:space:]]*=[[:space:]]*any[[:space:]]*\([[:space:]]*coalesce[[:space:]]*\([[:space:]]*p[.]category_slugs[[:space:]]*,[[:space:]]*'[{}][{}]'[[:space:]]*::[[:space:]]*text[[:space:]]*\[[[:space:]]*\][[:space:]]*\)[[:space:]]*\)$pattern$;
  select count(*) into matches from regexp_matches(original,pattern,'gi');
  if matches<>2 then raise exception 'A seleção por categoria mudou: %. Nenhuma alteração aplicada.',signature;end if;
  changed:=regexp_replace(original,pattern,'public.serenity_price_category_matches_v1(p.id,'||parameter||')','gi');
  execute changed;
 end loop;
end $repair$;
notify pgrst,'reload schema';
commit;
