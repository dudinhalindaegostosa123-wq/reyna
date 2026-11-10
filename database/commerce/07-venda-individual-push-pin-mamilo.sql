begin;
select pg_advisory_xact_lock(7391542026);
-- No price division: the current price becomes the price of one piece, as requested.
create table if not exists public.serenity_individual_sale_backup_v1 (
 entity text not null,id uuid not null,snapshot jsonb not null,saved_at timestamptz not null default now(),
 primary key(entity,id)
);
alter table public.serenity_individual_sale_backup_v1 enable row level security;
revoke all on public.serenity_individual_sale_backup_v1 from public,anon,authenticated;
grant all on public.serenity_individual_sale_backup_v1 to service_role;

create or replace function public.serenity_individual_product_v1(p_product uuid)
returns boolean language sql stable set search_path='' as $$
 select coalesce(p.product_type in('simple','variable') and
  (p.name||' '||coalesce(array_to_string(p.categories,' '),'')||' '||coalesce((to_jsonb(p)->'category_slugs')::text,'')) ~* '(^|[^[:alnum:]_])(push[[:space:]_-]*pin|threadless|mamilos?|nipples?)([^[:alnum:]_]|$)' and
  (p.name||' '||coalesce(array_to_string(p.categories,' '),'')||' '||coalesce((to_jsonb(p)->'category_slugs')::text,'')) !~* '(after.?care|soro|limpeza|higieni|pin[çc]a|porta.?joia|estojo|mostru[aá]rio|expositor|luvas?|alicate|instrumental|autoclave|agulha|cateter)',false)
 from public.products p where p.id=p_product;
$$;
create or replace function public.serenity_individual_title_v1(p_name text)
returns text language sql immutable set search_path='' as $$
 select regexp_replace(p_name,'\mpar[[:space:]]+(de[[:space:]]+)?(?=(piercings?|joias?|mamilos?|nipples?|push[[:space:]_-]*pin)\M)','','gi');
$$;
create or replace function public.serenity_sale_quantity_key_v1(p_key text)
returns boolean language sql immutable set search_path='' as $$
 select lower(p_key) ~ '(quantidade|apresenta|unidade.*venda|venda.*por|quantity|packaging)'
 and lower(p_key) !~ '(pedra|cristal|navete|esfera|pontos)';
$$;
create or replace function public.serenity_sale_presentation_v1(p_attributes jsonb)
returns text language plpgsql immutable set search_path='' as $$
declare item record; value text; kind text; found_kind text;
begin
 if jsonb_typeof(p_attributes) is distinct from 'object' then return null;end if;
 for item in select * from jsonb_each_text(p_attributes) loop
  if not public.serenity_sale_quantity_key_v1(item.key) then continue;end if;
  value:=regexp_replace(translate(lower(item.value),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[^a-z0-9]','','g');
  kind:=case when value in('unidade','unitario','unitaria','1unidade','individual','unit') then 'unit'
   when value in('par','pares','pair','2unidades','2pecas') then 'pair' else null end;
  if kind is null or found_kind is not null and found_kind<>kind then return null;end if;
  found_kind:=kind;
 end loop;
 return found_kind;
end $$;
create or replace function public.serenity_without_quantity_v1(p_attributes jsonb)
returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(p_attributes)
 where not public.serenity_sale_quantity_key_v1(key);
$$;

-- Keep unit SKU prices. If only a pair SKU exists for that combination, relabel it
-- as one piece at exactly its current price. Do not touch stock or saved orders.
do $normalize$
declare product record; variant record; unit_id uuid; attrs jsonb; item record;
begin
 lock table public.products,public.product_variants in share row exclusive mode;
 for product in select p.* from public.products p
  where p.status='published' and p.visibility<>'hidden' and public.serenity_individual_product_v1(p.id)
 loop
  if exists(
   select 1 from public.product_variants v where v.product_id=product.id and v.enabled
    and public.serenity_sale_presentation_v1(v.attributes) in('unit','pair')
   group by public.serenity_without_quantity_v1(v.attributes)
   having count(*) filter(where public.serenity_sale_presentation_v1(v.attributes)='unit')>1
    or count(*) filter(where public.serenity_sale_presentation_v1(v.attributes)='unit')=0
     and count(*) filter(where public.serenity_sale_presentation_v1(v.attributes)='pair')>1
  ) then raise exception 'Variações de venda duplicadas em %. Nenhuma alteração aplicada.',product.name;end if;
  if product.sold_individually then
   insert into public.serenity_individual_sale_backup_v1(entity,id,snapshot)
    values('products',product.id,to_jsonb(product)) on conflict do nothing;
   update public.products set sold_individually=false where id=product.id;
  end if;
  for variant in select v.* from public.product_variants v
   where v.product_id=product.id and v.enabled and public.serenity_sale_presentation_v1(v.attributes)='pair'
   order by v.id
  loop
   insert into public.serenity_individual_sale_backup_v1(entity,id,snapshot)
    values('product_variants',variant.id,to_jsonb(variant)) on conflict do nothing;
   select v.id into unit_id from public.product_variants v
    where v.product_id=product.id and v.enabled and v.id<>variant.id
     and public.serenity_sale_presentation_v1(v.attributes)='unit'
     and public.serenity_without_quantity_v1(v.attributes)=public.serenity_without_quantity_v1(variant.attributes)
    order by v.id limit 1;
   if unit_id is not null then
    update public.product_variants set enabled=false where id=variant.id;
   else
    attrs:=variant.attributes;
    for item in select * from jsonb_each_text(attrs) loop
     if public.serenity_sale_quantity_key_v1(item.key) then
      attrs:=jsonb_set(attrs,array[item.key],to_jsonb('Unidade'::text));
     end if;
    end loop;
    update public.product_variants set attributes=attrs,
     name=regexp_replace(coalesce(name,''),'\m(par|pares|pair)\M','Unidade','gi')
     where id=variant.id;
   end if;
  end loop;
 end loop;
end $normalize$;

-- Only new quotes are guarded; already-created payment snapshots keep their amounts.
do $install$
declare original text;changed text;
begin
 original:=pg_get_functiondef('public.serenity_checkout_quote(jsonb)'::regprocedure);
 if position('serenity_individual_quote_base_v1' in original)>0 then return;end if;
 if to_regprocedure('public.serenity_individual_quote_base_v1(jsonb)') is not null
  or position('Serenity services v2' in original)=0 then
  raise exception 'A cotação instalada mudou. Nenhuma alteração aplicada.';
 end if;
 changed:=replace(original,'FUNCTION public.serenity_checkout_quote(','FUNCTION public.serenity_individual_quote_base_v1(');
 if changed=original then raise exception 'Não foi possível preservar a cotação.';end if;
 execute changed;
 execute $wrapper$
  create or replace function public.serenity_checkout_quote(p_items jsonb)
  returns jsonb language plpgsql set search_path='' as $body$
  declare result jsonb;item jsonb;attrs jsonb;entries jsonb:='[]'::jsonb;
  begin
   result:=public.serenity_individual_quote_base_v1(p_items);
   for item in select value from jsonb_array_elements(result->'items') loop
    if public.serenity_individual_product_v1((item->>'product_id')::uuid) then
     if nullif(item->>'variant_id','') is not null then
      select attributes into attrs from public.product_variants where id=(item->>'variant_id')::uuid;
      if public.serenity_sale_presentation_v1(attrs)='pair' then raise exception 'UNIT_SALE_REQUIRED';end if;
     end if;
     item:=item||jsonb_build_object('name',public.serenity_individual_title_v1(item->>'name'),
      'variation',concat_ws(' · ',nullif(item->>'variation',''),'Venda por unidade'),'sale_unit','unit');
    end if;
    entries:=entries||jsonb_build_array(item);
   end loop;
   return jsonb_set(result,'{items}',entries);
  end $body$;
 $wrapper$;
end $install$;
revoke all on function public.serenity_individual_product_v1(uuid),public.serenity_individual_title_v1(text),public.serenity_sale_quantity_key_v1(text),public.serenity_sale_presentation_v1(jsonb),public.serenity_without_quantity_v1(jsonb),public.serenity_individual_quote_base_v1(jsonb),public.serenity_checkout_quote(jsonb) from public,anon,authenticated;
grant execute on function public.serenity_individual_product_v1(uuid),public.serenity_individual_title_v1(text),public.serenity_sale_quantity_key_v1(text),public.serenity_sale_presentation_v1(jsonb),public.serenity_without_quantity_v1(jsonb),public.serenity_individual_quote_base_v1(jsonb),public.serenity_checkout_quote(jsonb) to service_role;
notify pgrst,'reload schema';
select p.name as produto,count(*) filter(where v.enabled) as variacoes_ativas,
 count(*) filter(where v.enabled and public.serenity_sale_presentation_v1(v.attributes)='pair') as pares_ainda_ativos
 from public.products p left join public.product_variants v on v.product_id=p.id
 where p.status='published' and p.visibility<>'hidden' and public.serenity_individual_product_v1(p.id)
 group by p.id,p.name order by p.name;
commit;
