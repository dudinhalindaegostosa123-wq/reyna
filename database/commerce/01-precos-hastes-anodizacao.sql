begin;
select pg_advisory_xact_lock(7391542026);
lock table public.products,public.product_variants in share row exclusive mode;

create table if not exists public.serenity_commerce_settings_v1 (
  singleton boolean primary key default true check(singleton),
  version bigint not null check(version>0),
  anodization_fee numeric not null check(anodization_fee in(0,15)),
  included_stems boolean not null,
  retail_free_shipping_minimum_cents bigint not null check(retail_free_shipping_minimum_cents>=0),
  free_shipping_after_discounts boolean not null
);
alter table public.serenity_commerce_settings_v1 enable row level security;
revoke all on public.serenity_commerce_settings_v1 from public,anon,authenticated;
grant select on public.serenity_commerce_settings_v1 to anon,authenticated;
grant all on public.serenity_commerce_settings_v1 to service_role;
drop policy if exists commerce_public_read_v1 on public.serenity_commerce_settings_v1;
create policy commerce_public_read_v1 on public.serenity_commerce_settings_v1 for select to anon,authenticated using(true);

create table if not exists public.serenity_commerce_batches_v1 (
  id text primary key,applied_at timestamptz not null default now(),
  products integer not null,variants integer not null,backup jsonb not null
);
alter table public.serenity_commerce_batches_v1 enable row level security;
revoke all on public.serenity_commerce_batches_v1 from public,anon,authenticated;
grant all on public.serenity_commerce_batches_v1 to service_role;
create table if not exists public.serenity_commerce_functions_v1 (
  signature text primary key,definition text not null,saved_at timestamptz not null default now()
);
alter table public.serenity_commerce_functions_v1 enable row level security;
revoke all on public.serenity_commerce_functions_v1 from public,anon,authenticated;
grant all on public.serenity_commerce_functions_v1 to service_role;

create or replace function public.serenity_commerce_top_v1(p_product uuid)
returns boolean language sql stable set search_path='' as $$
  select coalesce(product_type in('simple','variable') and lower(coalesce(name,'')) !~ '(after.?care|soro|limpeza|higieni|pin[çc]a|porta.?joia|estojo|mostru[aá]rio|expositor|luvas?|alicate|instrumental|autoclave|esteriliz|agulha|cateter)' and (
    name ~* '(^|[^[:alnum:]_])topos?([^[:alnum:]_]|$)'
    or exists(select 1 from unnest(categories) category where lower(trim(category)) in('topo','topos'))
  ),false) from public.products where id=p_product;
$$;
revoke all on function public.serenity_commerce_top_v1(uuid) from public,anon,authenticated;
grant execute on function public.serenity_commerce_top_v1(uuid) to service_role;

create or replace function public.serenity_commerce_jewel_v1(p_product uuid)
returns boolean language sql stable set search_path='' as $$
  select coalesce(public.serenity_collection_is_jewel_v1(p_product),false)
    or coalesce(public.serenity_commerce_top_v1(p_product),false)
    or coalesce((select product_type in('simple','variable') and lower(coalesce(material,'')) ~ '(bioflex|ptfe)' and lower(coalesce(name,'')||' '||coalesce(array_to_string(categories,' '),'')) !~ '(after.?care|soro|limpeza|higieni|pin[çc]a|porta.?joia|estojo|mostru[aá]rio|expositor|luvas?|alicate|instrumental|autoclave|esteriliz|agulha|cateter)' from public.products where id=p_product),false);
$$;
revoke all on function public.serenity_commerce_jewel_v1(uuid) from public,anon,authenticated;
grant execute on function public.serenity_commerce_jewel_v1(uuid) to service_role;

create or replace function public.serenity_commerce_variant_stem_v1(p_attributes jsonb)
returns text language sql immutable set search_path='' as $$
  select substring(value from '(4|6|8|10)') from jsonb_each_text(case when jsonb_typeof(p_attributes)='object' then p_attributes else '{}'::jsonb end)
  where key ~* 'comprimento' and key !~* '(pedra|topo|cristal|zirc)' and value ~* '^[[:space:]]*(4|6|8|10)([.,]0)?[[:space:]]*mm[[:space:]]*$'
  order by key limit 1;
$$;
revoke all on function public.serenity_commerce_variant_stem_v1(jsonb) from public,anon,authenticated;
grant execute on function public.serenity_commerce_variant_stem_v1(jsonb) to service_role;

do $migration$
declare signature text;original text;changed text;pattern text;matches integer;previous jsonb;products_count integer;variants_count integer;
begin
  if to_regprocedure('public.serenity_collection_is_jewel_v1(uuid)') is null then raise exception 'Instale primeiro a campanha progressiva. Nenhuma alteração aplicada.'; end if;
  foreach signature in array array['public.serenity_checkout_quote(jsonb)','public.serenity_checkout_complete_order_v2(uuid)','public.serenity_checkout_start_v2(uuid,text,text,text,uuid,jsonb,jsonb,jsonb,bigint,text,uuid,text,text)','public.serenity_admin_create_order(uuid,uuid,uuid,jsonb)'] loop
    if signature='public.serenity_admin_create_order(uuid,uuid,uuid,jsonb)' and to_regprocedure(signature) is null then continue; end if;
    if to_regprocedure(signature) is null then raise exception 'Função necessária ausente: %. Nenhuma alteração aplicada.',signature; end if;
    original:=pg_get_functiondef(to_regprocedure(signature));
    insert into public.serenity_commerce_functions_v1(signature,definition) values(signature,original) on conflict do nothing;
    if position('Serenity commerce v1' in original)>0 then continue; end if;
    changed:=original;
    if signature='public.serenity_checkout_quote(jsonb)' then
      pattern:='fee[[:space:]]*:=[[:space:]]*15[[:space:]]*;';
      select count(*) into matches from regexp_matches(changed,pattern,'g');
      if matches<>1 then raise exception 'A cotação de anodização mudou. Nenhuma alteração aplicada.'; end if;
      changed:=regexp_replace(changed,pattern,'fee := coalesce((select anodization_fee from public.serenity_commerce_settings_v1 where singleton),15); -- Serenity commerce v1','g');
      pattern:='total[[:space:]]*:=[[:space:]]*total[[:space:]]*\+[[:space:]]*\([[:space:]]*price[[:space:]]*\+[[:space:]]*fee[[:space:]]*\)[[:space:]]*\*[[:space:]]*q[[:space:]]*;';
      select count(*) into matches from regexp_matches(changed,pattern,'g');
      if matches<>1 then raise exception 'A composição do preço mudou. Nenhuma alteração aplicada.'; end if;
      changed:=regexp_replace(changed,pattern,$patch$
      if coalesce((select included_stems from public.serenity_commerce_settings_v1 where singleton),false) and public.serenity_commerce_top_v1(p.id) then
        if public.serenity_commerce_variant_stem_v1(v.attributes) is not null then
          if coalesce(item->>'stem','')<>'' and item->>'stem'<>public.serenity_commerce_variant_stem_v1(v.attributes) then raise exception 'INVALID_STEM'; end if;
          item:=jsonb_set(item,'{stem}',to_jsonb(public.serenity_commerce_variant_stem_v1(v.attributes)));
        elsif coalesce(item->>'stem','') not in('4','6','8','10') then raise exception 'TOP_STEM_REQUIRED'; end if;
        label:=concat_ws(' · ',nullif(label,''),'Haste incluída: '||(item->>'stem')||' mm');
      elsif coalesce(item->>'stem','')<>'' then raise exception 'INVALID_STEM'; end if;
      total := total+(price+fee)*q;$patch$,'g');
      pattern:='''variant_id''[[:space:]]*,[[:space:]]*v\.id[[:space:]]*,';
      select count(*) into matches from regexp_matches(changed,pattern,'g');
      if matches<>1 then raise exception 'Os itens da cotação mudaram. Nenhuma alteração aplicada.'; end if;
      changed:=regexp_replace(changed,pattern,$patch$'variant_id',v.id,'cart_variant',coalesce(item->>'variant',''),'stem',coalesce(item->>'stem',''),'stem_locked',public.serenity_commerce_top_v1(p.id) and public.serenity_commerce_variant_stem_v1(v.attributes) is not null,$patch$,'g');
    elsif signature='public.serenity_admin_create_order(uuid,uuid,uuid,jsonb)' then
      pattern:='fee[[:space:]]*:=[[:space:]]*15[[:space:]]*;';
      select count(*) into matches from regexp_matches(changed,pattern,'g');
      if matches<>1 then raise exception 'A anodização do pedido manual mudou. Nenhuma alteração aplicada.'; end if;
      changed:=regexp_replace(changed,pattern,'fee := coalesce((select anodization_fee from public.serenity_commerce_settings_v1 where singleton),15); -- Serenity commerce v1','g');
      pattern:='subtotal[[:space:]]*:=[[:space:]]*subtotal[[:space:]]*\+[[:space:]]*\(unit[[:space:]]*\+[[:space:]]*fee\)[[:space:]]*\*[[:space:]]*qty[[:space:]]*;';
      select count(*) into matches from regexp_matches(changed,pattern,'g');
      if matches<>1 then raise exception 'O total do pedido manual mudou. Nenhuma alteração aplicada.'; end if;
      changed:=regexp_replace(changed,pattern,$patch$
      if coalesce((select included_stems from public.serenity_commerce_settings_v1 where singleton),false) and public.serenity_commerce_top_v1(product.id) then
        if public.serenity_commerce_variant_stem_v1(variation.attributes) is not null then
          if coalesce(item->>'stem','')<>'' and item->>'stem'<>public.serenity_commerce_variant_stem_v1(variation.attributes) then raise exception 'INVALID_STEM'; end if;
          item:=jsonb_set(item,'{stem}',to_jsonb(public.serenity_commerce_variant_stem_v1(variation.attributes)));
        elsif coalesce(item->>'stem','') not in('4','6','8','10') then raise exception 'TOP_STEM_REQUIRED'; end if;
      elsif coalesce(item->>'stem','')<>'' then raise exception 'INVALID_STEM'; end if;
      subtotal := subtotal+(unit+fee)*qty;$patch$,'g');
      pattern:='''variation''[[:space:]]*,[[:space:]]*variation\.name[[:space:]]*,';
      select count(*) into matches from regexp_matches(changed,pattern,'g');
      if matches<>1 then raise exception 'As opções do pedido manual mudaram. Nenhuma alteração aplicada.'; end if;
      changed:=regexp_replace(changed,pattern,$patch$'variation',concat_ws(' · ',nullif(variation.name,''),case when coalesce(item->>'stem','')<>'' then 'Haste incluída: '||(item->>'stem')||' mm' end),$patch$,'g');
      pattern:='''anodization_fee''[[:space:]]*,[[:space:]]*fee[[:space:]]*,';
      select count(*) into matches from regexp_matches(changed,pattern,'g');
      if matches<>1 then raise exception 'A personalização do pedido manual mudou. Nenhuma alteração aplicada.'; end if;
      changed:=regexp_replace(changed,pattern,$patch$'anodization_fee',fee,'stem_length_mm',nullif(item->>'stem',''),$patch$,'g');
    elsif signature like 'public.serenity_checkout_start_v2(%' then
      pattern:='amount[[:space:]]*:=[[:space:]]*\(quote[[:space:]]*->>[[:space:]]*''total_cents''\)::bigint[[:space:]]*\+[[:space:]]*delivery\.amount_cents[[:space:]]*;';
      select count(*) into matches from regexp_matches(changed,pattern,'g');
      if matches<>1 then raise exception 'A validação do frete mudou. Nenhuma alteração aplicada.'; end if;
      changed:=regexp_replace(changed,pattern,$patch$
      -- Serenity commerce v1: um cupom novo não pode reutilizar frete grátis sem atingir o mínimo.
      if delivery.snapshot ? 'free_shipping' then
        if coalesce(delivery.snapshot->>'pricing_mode','retail')<>'retail'
          or delivery.amount_cents<>0
          or (delivery.snapshot->'free_shipping'->>'minimum_cents')::bigint is distinct from (select retail_free_shipping_minimum_cents from public.serenity_commerce_settings_v1 where singleton)
          or (quote->>'total_cents')::bigint<(select retail_free_shipping_minimum_cents from public.serenity_commerce_settings_v1 where singleton)
        then raise exception 'SHIPPING_QUOTE_EXPIRED'; end if;
      end if;
      amount := (quote->>'total_cents')::bigint + delivery.amount_cents;$patch$,'g');
    else
      pattern:='color_name[[:space:]]+is[[:space:]]+null[[:space:]]+or[[:space:]]+fee[[:space:]]*<>[[:space:]]*15';
      select count(*) into matches from regexp_matches(changed,pattern,'g');
      if matches<>1 then raise exception 'A confirmação da anodização mudou. Nenhuma alteração aplicada.'; end if;
      -- Mantém a conclusão das tentativas antigas que já tinham adicional de R$15.
      changed:=regexp_replace(changed,pattern,'color_name is null or fee not in (0,15) /* Serenity commerce v1 */','g');
      pattern:='''anodization_fee''[[:space:]]*,[[:space:]]*fee[[:space:]]*,';
      select count(*) into matches from regexp_matches(changed,pattern,'g');
      if matches<>1 then raise exception 'O registro de personalização mudou. Nenhuma alteração aplicada.'; end if;
      changed:=regexp_replace(changed,pattern,$patch$'anodization_fee',fee,'stem_length_mm',nullif(item->>'stem',''),$patch$,'g');
    end if;
    execute changed;
  end loop;

  if not exists(select 1 from public.serenity_commerce_batches_v1 where id='joias-menos-18-2026-10-25-v1') then
    select jsonb_build_object(
      'products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'regular_price',p.regular_price,'sale_price',p.sale_price)),'[]'::jsonb) from public.products p where public.serenity_commerce_jewel_v1(p.id)),
      'variants',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'regular_price',v.regular_price,'sale_price',v.sale_price)),'[]'::jsonb) from public.product_variants v where public.serenity_commerce_jewel_v1(v.product_id))
    ) into previous;
    if exists(select 1 from public.products p where public.serenity_commerce_jewel_v1(p.id) and (coalesce(p.regular_price,0)<0 or coalesce(p.sale_price,0)<0 or coalesce(p.regular_price,0)::text in('NaN','Infinity','-Infinity') or coalesce(p.sale_price,0)::text in('NaN','Infinity','-Infinity')))
      or exists(select 1 from public.product_variants v where public.serenity_commerce_jewel_v1(v.product_id) and (coalesce(v.regular_price,0)<0 or coalesce(v.sale_price,0)<0 or coalesce(v.regular_price,0)::text in('NaN','Infinity','-Infinity') or coalesce(v.sale_price,0)::text in('NaN','Infinity','-Infinity')))
    then raise exception 'Há preços inválidos. Nenhuma alteração aplicada.'; end if;
    update public.products p set regular_price=round(p.regular_price*0.82,2),sale_price=round(p.sale_price*0.82,2) where public.serenity_commerce_jewel_v1(p.id);
    get diagnostics products_count=row_count;
    update public.product_variants v set regular_price=round(v.regular_price*0.82,2),sale_price=round(v.sale_price*0.82,2) where public.serenity_commerce_jewel_v1(v.product_id);
    get diagnostics variants_count=row_count;
    insert into public.serenity_commerce_batches_v1(id,products,variants,backup) values('joias-menos-18-2026-10-25-v1',products_count,variants_count,previous);
  end if;
end $migration$;

insert into public.serenity_commerce_settings_v1 values(true,1,0,true,45000,true) on conflict(singleton) do nothing;
select id,applied_at,products,variants from public.serenity_commerce_batches_v1 where id='joias-menos-18-2026-10-25-v1';
commit;
