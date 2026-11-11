-- Cálculo pelo catálogo real e pelas configurações existentes. Nunca aceita preços do navegador.
create or replace function public.serenity_lunarity_policy_v1()
returns jsonb language plpgsql stable set search_path='' as $$
declare policy jsonb;
begin
 select to_jsonb(s) into policy from public.serenity_commerce_settings_v1 s where singleton;
 if policy is null or coalesce((policy->>'version')::bigint,0)<1
  or coalesce((policy->>'anodization_fee')::numeric,-1) not in(0,15)
  or jsonb_typeof(policy->'included_stems') is distinct from 'boolean'
  or jsonb_typeof(policy->'free_shipping_after_discounts') is distinct from 'boolean'
  or coalesce((policy->>'retail_free_shipping_minimum_cents')::bigint,-1)<0 then
  return jsonb_build_object('version',0,'anodization_fee',15,'included_stems',false,
   'preparation_options',false,'sterilization_all_products',false,'stem_fee',0,'sterilization_fee',0);
 end if;
 return policy || jsonb_build_object(
  'preparation_options',coalesce(policy->>'preparation_options','false')='true',
  'sterilization_all_products',coalesce(policy->>'sterilization_all_products','false')='true',
  'stem_fee',case when (policy->>'stem_fee')::numeric=5 then 5 else 0 end,
  'sterilization_fee',case when (policy->>'sterilization_fee')::numeric in(5,10) then (policy->>'sterilization_fee')::numeric else 0 end);
end $$;

create or replace function public.serenity_checkout_quote(p_items jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 p public.products%rowtype;v public.product_variants%rowtype;item jsonb;entries jsonb:='[]';
 quantity integer;grouped integer;regular numeric;price numeric;fee numeric;total numeric:=0;
 label text;policy jsonb;is_top boolean;is_micro boolean;is_tool boolean;
 stem text;locked_stem text;sterilized boolean;sterilization_fee numeric;stem_fee numeric;
begin
 perform pg_advisory_xact_lock(7391542026);
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'INVALID_CART';end if;
 policy:=public.serenity_lunarity_policy_v1();
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item) is distinct from 'object'
   or coalesce(item->>'quantity','') !~ '^[1-9][0-9]{0,2}$'
   or coalesce(item->>'slug','') !~ '^[a-zA-Z0-9_-]{1,180}$'
   or coalesce(item->>'variant','') !~ '^(|[0-9]{1,12}|[a-fA-F0-9-]{36})$'
   or coalesce(item->>'color','') !~ '^(|[0-9]{2,3})$'
   or (item ? 'sterilized' and jsonb_typeof(item->'sterilized') is distinct from 'boolean')
   or coalesce(item->>'stem','') not in('','4','6','8','10') then raise exception 'INVALID_CART';end if;
 end loop;
 for item in select value from jsonb_array_elements(p_items) loop
  select * into p from public.products where slug=item->>'slug' for share;
  if not found or p.status<>'published' or p.visibility='hidden' or p.product_type not in('simple','variable') then raise exception 'PRODUCT_UNAVAILABLE';end if;
  quantity:=(item->>'quantity')::integer;
  select sum((x->>'quantity')::integer) into grouped from jsonb_array_elements(p_items) x where x->>'slug'=p.slug;
  if p.sold_individually and grouped>1 then raise exception 'STOCK_CHANGED';end if;
  v:=null;label:=null;
  if p.product_type='variable' then
   select * into v from public.product_variants where product_id=p.id and enabled and (id::text=item->>'variant' or woo_id::text=item->>'variant') for share;
   if not found then raise exception 'VARIANT_UNAVAILABLE';end if;
   regular:=v.regular_price;
   price:=public.serenity_target_effective_price(p.id,v.id,regular,v.sale_price,v.sale_starts_at,v.sale_ends_at);
   select string_agg(a.key||' '||a.value,' / ' order by a.key) into label from jsonb_each_text(v.attributes) a where a.value<>'';
   label:=coalesce(label,v.name);
   -- Same unit-only rule as individualVariations; do not relabel or edit existing SKUs.
   if (p.name||' '||array_to_string(p.categories,' ')) ~* '(push[[:space:]_-]*pin|threadless|mamilos?|nipples?)'
     and exists(select 1 from jsonb_each_text(v.attributes) a where
       a.key ~* '(quantidade|apresenta|unidade.*venda|venda.*por|quantity|packaging)'
       and a.key !~* '(pedra|cristal|navete|esfera|pontos)' and a.value ~* '^(par|pares|pair|2[[:space:]]*(unidades|peças|pecas))$') then raise exception 'UNIT_SALE_REQUIRED';end if;
  else
   if coalesce(item->>'variant','')<>'' then raise exception 'VARIANT_UNAVAILABLE';end if;
   regular:=p.regular_price;
   price:=public.serenity_target_effective_price(p.id,null,regular,p.sale_price,p.sale_starts_at,p.sale_ends_at);
  end if;
  if regular is null or regular<0 or regular::text in('NaN','Infinity','-Infinity')
   or price is null or price<0 or price::text in('NaN','Infinity','-Infinity') then raise exception 'PRICE_UNAVAILABLE';end if;
  if nullif(current_setting('serenity.wholesale_user',true),'') is not null then price:=public.serenity_wholesale_unit_price(regular,price);end if;
  fee:=0;
  if coalesce(item->>'color','')<>'' then
   if item->>'color' not in('12','15','18','20','22','25','28','30','33','36','40','42','48','55','61','64','70','72','75','80','85','90','92','95','103','105')
    or not exists(select 1 from unnest(p.tags) tag where btrim(translate(lower(tag),'áàãâéêíóôõúç','aaaaeeiooouc'))
      in('anodizavel','anodizaveis','permite anodizacao','aceita anodizacao')) then raise exception 'INVALID_ANODIZATION';end if;
   fee:=(policy->>'anodization_fee')::numeric;
  end if;
  is_tool:=p.name ~* '(after.?care|soro|limpeza|higieni|pin[çc]a|porta.?joia|estojo|mostru[aá]rio|expositor|luvas?|alicate|instrumental|autoclave|esteriliz|agulha|cateter)';
  is_top:=not is_tool and (p.name ~* '\mtopos?\M' or exists(select 1 from unnest(p.categories) c where lower(btrim(c)) in('topo','topos')));
  is_micro:=p.name ~* 'microdermal';
  stem:='';locked_stem:=null;stem_fee:=0;sterilization_fee:=0;sterilized:=null;
  if coalesce((policy->>'included_stems')::boolean,false) and is_top
   and not(is_micro and (policy->>'preparation_options')::boolean) then
   select substring(value from '(4|6|8|10)') into locked_stem from jsonb_each_text(coalesce(v.attributes,'{}'))
    where key ~* 'comprimento' and key !~* '(pedra|topo|cristal|zirc)'
      and value ~* '^[[:space:]]*(4|6|8|10)([.,]0)?[[:space:]]*mm[[:space:]]*$' order by key limit 1;
   if locked_stem is not null then
    if coalesce(item->>'stem','') not in('',locked_stem) then raise exception 'INVALID_STEM';end if;
    stem:=locked_stem;
   elsif (policy->>'preparation_options')::boolean then
    stem:=coalesce(item->>'stem','');
    if stem not in('','6','8') then raise exception 'INVALID_STEM';end if;
   else
    stem:=coalesce(item->>'stem','');
    if stem not in('4','6','8','10') then raise exception 'TOP_STEM_REQUIRED';end if;
   end if;
   if stem<>'' then
    stem_fee:=(policy->>'stem_fee')::numeric;
    label:=concat_ws(' · ',nullif(label,''),'Haste: '||stem||' mm');
   end if;
  elsif coalesce(item->>'stem','')<>'' then raise exception 'INVALID_STEM';end if;
  if item ? 'sterilized' then
   if not (policy->>'preparation_options')::boolean then raise exception 'INVALID_STERILIZATION';end if;
   sterilized:=(item->>'sterilized')::boolean;
   if sterilized and is_tool and not (policy->>'sterilization_all_products')::boolean then raise exception 'INVALID_STERILIZATION';end if;
   if sterilized then sterilization_fee:=(policy->>'sterilization_fee')::numeric;end if;
   label:=concat_ws(' · ',nullif(label,''),'Esterilização: '||case when sterilized then 'Sim' else 'Não' end);
  end if;
  price:=round(price,2);total:=total+(price+fee+stem_fee+sterilization_fee)*quantity;
  entries:=entries||jsonb_build_array(jsonb_build_object('product_id',p.id,'variant_id',v.id,'cart_variant',item->>'variant',
   'slug',p.slug,'name',p.name,'variation',label,'quantity',quantity,'unit_price',price,'color',coalesce(item->>'color',''),
   'fee',fee,'stem',stem,'stem_locked',locked_stem is not null,'stem_fee',stem_fee,'sterilized',sterilized,
   'sterilization_fee',sterilization_fee,'line_total',(price+fee+stem_fee+sterilization_fee)*quantity));
 end loop;
 perform public.serenity_stock_assert(nullif(current_setting('serenity.stock_quote_order',true),'')::uuid,entries);
 return jsonb_build_object('items',entries,'total',total,'total_cents',round(total*100)::bigint);
end $$;
