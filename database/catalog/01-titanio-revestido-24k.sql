begin;
select pg_advisory_xact_lock(7391542026);
-- Content edits must not switch manually unavailable products back into stock.
drop trigger if exists serenity_unlimited_stock_v1 on public.products;
drop trigger if exists serenity_unlimited_stock_v1 on public.product_variants;
create table if not exists public.serenity_coating_rename_backup_v1 (
 entity text not null,id uuid not null,before_data jsonb not null,saved_at timestamptz not null default now(),primary key(entity,id)
);
alter table public.serenity_coating_rename_backup_v1 enable row level security;
revoke all on public.serenity_coating_rename_backup_v1 from public,anon,authenticated;
grant all on public.serenity_coating_rename_backup_v1 to service_role;
create or replace function public.serenity_coating_copy_v1(p_text text,p_coated boolean default false)
returns text language plpgsql immutable set search_path='' as $$
declare result text;
begin
 if p_text is null or p_text ~* '^https?://' then return p_text;end if;
 result:=regexp_replace(p_text,'((tit[aâ]nio|titanium)[[:space:]]+(revestid[oa]|banhad[oa]|folhead[oa])([[:space:]]+(de|em|com|a|à))?[[:space:]]+ouro[[:space:]]*)18[[:space:]]*k\M','\124K','gi');
 if p_coated then
  result:=regexp_replace(result,'(^|[[:space:]>])(ouro[[:space:]]*)18[[:space:]]*k\M(?![[:space:]]*maci[cç]o)','\1\224K','gi');
 end if;
 return result;
end $$;
create or replace function public.serenity_coating_json_v1(p_value jsonb,p_coated boolean default false)
returns jsonb language plpgsql immutable set search_path='' as $$
begin
 case jsonb_typeof(p_value)
  when 'string' then return to_jsonb(public.serenity_coating_copy_v1(p_value#>>'{}',p_coated));
  when 'array' then return coalesce((select jsonb_agg(public.serenity_coating_json_v1(value,p_coated) order by ord) from jsonb_array_elements(p_value) with ordinality as x(value,ord)),'[]'::jsonb);
  when 'object' then return coalesce((select jsonb_object_agg(key,public.serenity_coating_json_v1(value,p_coated)) from jsonb_each(p_value)),'{}'::jsonb);
  else return p_value;
 end case;
end $$;
revoke all on function public.serenity_coating_copy_v1(text,boolean),public.serenity_coating_json_v1(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.serenity_coating_copy_v1(text,boolean),public.serenity_coating_json_v1(jsonb,boolean) to service_role;
do $$
declare entity text; column_row record; expression text; assignments text; changes text; context text; alias_name text;
begin
 foreach entity in array array['products','product_variants'] loop
  assignments:='';changes:='';alias_name:='r';
  context:='exists(select 1 from public.products p where p.id='||case when entity='products' then 'r.id' else 'r.product_id' end||' and concat_ws('' '',p.material,p.name) ~* ''tit[aâ]nio|titanium'' and concat_ws('' '',p.material,p.name) ~* ''revestid|banhad|folhead|pvd'' and concat_ws('' '',p.material,p.name) ~* ''ouro|gold|dourad'' and coalesce(p.material,'''') !~* ''^(ouro|gold|prata|aço|aco|bioflex)'')';
  for column_row in select attname,format_type(atttypid,atttypmod) datatype from pg_attribute
   where attrelid=to_regclass('public.'||entity) and attnum>0 and not attisdropped and attgenerated=''
    and attname=any(array['name','material','short_description','description','seo_title','seo_description','tags','attributes']) loop
   if column_row.datatype in ('text','character varying') or column_row.datatype like 'character varying(%)' then
    expression:=format('public.serenity_coating_copy_v1(r.%I,(%s))',column_row.attname,context);
   elsif column_row.datatype='text[]' then
    expression:=format('case when r.%I is null then null else array(select public.serenity_coating_copy_v1(x,(%s)) from unnest(r.%I) x) end',column_row.attname,context,column_row.attname);
   elsif column_row.datatype in ('jsonb','json') then
    expression:=format('public.serenity_coating_json_v1(r.%I::jsonb,(%s))::%s',column_row.attname,context,column_row.datatype);
   else continue;
   end if;
   assignments:=assignments||case when assignments='' then '' else ',' end||format('%I=%s',column_row.attname,expression);
   changes:=changes||case when changes='' then '' else ' or ' end||format('r.%I is distinct from (%s)',column_row.attname,expression);
  end loop;
  if assignments<>'' then
   execute format('insert into public.serenity_coating_rename_backup_v1(entity,id,before_data) select %L,r.id,to_jsonb(r) from public.%I r where %s on conflict do nothing',entity,entity,changes);
   execute format('update public.%I r set %s where %s',entity,assignments,changes);
  end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
