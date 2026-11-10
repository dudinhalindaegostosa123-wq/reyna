begin;
create or replace function public.serenity_legacy_import_options_v1(p_rows jsonb)
returns integer language plpgsql set search_path='' as $$
declare entry jsonb; current_item public.serenity_legacy_items_v1%rowtype; merged jsonb; changed integer:=0;
begin
  perform pg_advisory_xact_lock(7391542026);
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 10000 or octet_length(p_rows::text)>4000000 then raise exception 'LEGACY_OPTIONS_INVALID'; end if;
  for entry in select value from jsonb_array_elements(p_rows) loop
    if coalesce(entry->>'item_id','') !~ '^[1-9][0-9]{0,14}$' or coalesce(entry->>'order_id','') !~ '^[1-9][0-9]{0,14}$'
      or jsonb_typeof(entry->'options') is distinct from 'object' or entry->'options'='{}'::jsonb then raise exception 'LEGACY_OPTIONS_INVALID'; end if;
    if exists(select 1 from jsonb_each(entry->'options') x where length(x.key) not between 1 and 200 or jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>2000
      or (left(x.key,1)='_' and x.key !~* '(attribute|comprimento|tamanho|espessura|di[aâ]metro|length|haste|medida)')) then raise exception 'LEGACY_OPTIONS_INVALID'; end if;
    select * into current_item from public.serenity_legacy_items_v1 where old_id=(entry->>'item_id')::bigint and order_id=(entry->>'order_id')::bigint and kind='line_item' for update;
    if not found then raise exception 'LEGACY_OPTIONS_ITEM_NOT_FOUND'; end if;
    if exists(select 1 from jsonb_each(entry->'options') x where coalesce(current_item.payload->'opcoes_compra','{}'::jsonb) ? x.key and current_item.payload->'opcoes_compra'->x.key is distinct from x.value) then raise exception 'LEGACY_OPTIONS_CONFLICT'; end if;
    merged:=jsonb_set(current_item.payload,'{opcoes_compra}',coalesce(current_item.payload->'opcoes_compra','{}'::jsonb)||(entry->'options'));
    if merged is distinct from current_item.payload then
      update public.serenity_legacy_items_v1 set payload=merged where old_id=current_item.old_id;
      changed:=changed+1;
    end if;
  end loop;
  return changed;
end $$;
revoke all on function public.serenity_legacy_import_options_v1(jsonb) from public,anon,authenticated;
grant execute on function public.serenity_legacy_import_options_v1(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
