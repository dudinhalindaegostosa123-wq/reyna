begin;
select pg_advisory_xact_lock(7391542026);
-- Não recalcula preços nem altera pedidos/tentativas existentes.
alter table public.serenity_commerce_settings_v1 add column if not exists preparation_options boolean not null default false;
create table if not exists public.serenity_preparation_functions_v1(signature text primary key,definition text not null);
alter table public.serenity_preparation_functions_v1 enable row level security;
revoke all on public.serenity_preparation_functions_v1 from public,anon,authenticated;
grant all on public.serenity_preparation_functions_v1 to service_role;

create or replace function public.serenity_microdermal_top_v1(p_product uuid)
returns boolean language sql stable set search_path='' as $$
 select coalesce(name ~* '(^|[^[:alnum:]_])topos?([^[:alnum:]_]|$)' and name ~* 'microdermal' and name !~* 'base[[:space:]]+microdermal',false) from public.products where id=p_product;
$$;
revoke all on function public.serenity_microdermal_top_v1(uuid) from public,anon,authenticated;
grant execute on function public.serenity_microdermal_top_v1(uuid) to service_role;

do $$ declare original text; changed text; begin
 if to_regprocedure('public.serenity_commerce_top_v1(uuid)') is null then raise exception 'Instale primeiro as regras comerciais de hastes. Nenhuma alteração aplicada.'; end if;
 if to_regprocedure('public.serenity_preparation_top_base_v1(uuid)') is null then
  original:=pg_get_functiondef('public.serenity_commerce_top_v1(uuid)'::regprocedure);
  insert into public.serenity_preparation_functions_v1 values('public.serenity_commerce_top_v1(uuid)',original) on conflict do nothing;
  changed:=replace(original,'FUNCTION public.serenity_commerce_top_v1(','FUNCTION public.serenity_preparation_top_base_v1(');
  if changed=original then raise exception 'A identificação de topos mudou. Nenhuma alteração aplicada.'; end if;
  execute changed;
 end if;
 if to_regprocedure('public.serenity_preparation_quote_base_v1(jsonb)') is null then
  original:=pg_get_functiondef('public.serenity_checkout_quote(jsonb)'::regprocedure);
  if position('Serenity commerce v1' in original)=0 then raise exception 'A cotação comercial precisa estar instalada. Nenhuma alteração aplicada.'; end if;
  insert into public.serenity_preparation_functions_v1 values('public.serenity_checkout_quote(jsonb)',original) on conflict do nothing;
  changed:=replace(original,'FUNCTION public.serenity_checkout_quote(','FUNCTION public.serenity_preparation_quote_base_v1(');
  if changed=original then raise exception 'A cotação mudou. Nenhuma alteração aplicada.'; end if;
  execute changed;
 end if;
 original:=pg_get_functiondef('public.serenity_checkout_complete_order_v2(uuid)'::regprocedure);
 if position('Serenity preparation v1' in original)=0 then
  insert into public.serenity_preparation_functions_v1 values('public.serenity_checkout_complete_order_v2(uuid)',original) on conflict do nothing;
  changed:=regexp_replace(original,'''anodization_fee''[[:space:]]*,[[:space:]]*fee[[:space:]]*,',$patch$'anodization_fee',fee,'sterilized',case when item ? 'sterilized' then (item->>'sterilized')::boolean else null end, /* Serenity preparation v1 */$patch$,'g');
  if changed=original then raise exception 'A gravação das opções do pedido mudou. Nenhuma alteração aplicada.'; end if;
  execute changed;
 end if;
end $$;
revoke all on function public.serenity_preparation_top_base_v1(uuid),public.serenity_preparation_quote_base_v1(jsonb) from public,anon,authenticated;
grant execute on function public.serenity_preparation_top_base_v1(uuid),public.serenity_preparation_quote_base_v1(jsonb) to service_role;

create or replace function public.serenity_commerce_top_v1(p_product uuid)
returns boolean language sql stable set search_path='' as $$
 select coalesce(public.serenity_preparation_top_base_v1(p_product),false) and not coalesce((select name ~* 'microdermal' from public.products where id=p_product),false);
$$;

-- Todas as solicitações novas custam R$ 5 por peça. Preserva pagamentos anteriores.
alter table public.serenity_commerce_settings_v1
  add column if not exists sterilization_all_products boolean not null default false,
  add column if not exists sterilization_fee numeric not null default 0 check(sterilization_fee in(0,5));

create or replace function public.serenity_checkout_quote(p_items jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb; source jsonb; item jsonb; entries jsonb:='[]'::jsonb;
  label text; idx integer:=0; preparation_fee numeric; added_cents bigint:=0;
begin
  -- Serenity preparation v1 / Serenity paid sterilization v1.
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'INVALID_CART'; end if;
  result:=public.serenity_preparation_quote_base_v1(p_items);
  for item in select value from jsonb_array_elements(result->'items') loop
    source:=p_items->idx; idx:=idx+1;
    preparation_fee:=0;
    if source ? 'sterilized' then
      if jsonb_typeof(source->'sterilized') is distinct from 'boolean' then raise exception 'INVALID_STERILIZATION'; end if;
      if (source->>'sterilized')::boolean then preparation_fee:=5; end if;
      label:=concat_ws(' · ',nullif(item->>'variation',''),'Esterilização solicitada: '||case when preparation_fee>0 then 'Sim (+ R$ 5,00 por peça)' else 'Não' end);
      item:=item||jsonb_build_object('sterilized',(source->>'sterilized')::boolean,'variation',label);
    end if;
    item:=item||jsonb_build_object('sterilization_fee',preparation_fee,
      'line_total',(item->>'line_total')::numeric+preparation_fee*(item->>'quantity')::integer);
    added_cents:=added_cents+round(preparation_fee*100)::bigint*(item->>'quantity')::integer;
    entries:=entries||jsonb_build_array(item);
  end loop;
  return result||jsonb_build_object('items',entries,
    'total_cents',(result->>'total_cents')::bigint+added_cents,
    'total',((result->>'total_cents')::bigint+added_cents)/100.0);
end $$;
revoke all on function public.serenity_checkout_quote(jsonb) from public,anon,authenticated;
grant execute on function public.serenity_checkout_quote(jsonb) to service_role;

do $install$
declare original text; changed text;
begin
  original:=pg_get_functiondef('public.serenity_checkout_complete_order_v2(uuid)'::regprocedure);
  if position('Serenity paid sterilization v1' in original)=0 then
    insert into public.serenity_preparation_functions_v1(signature,definition)
    values('public.serenity_checkout_complete_order_v2(uuid):before-paid-sterilization-v1',original) on conflict do nothing;
    changed:=regexp_replace(original,'fee[[:space:]]*:=[[:space:]]*\(item->>''fee''\)::numeric[[:space:]]*;',$patch$
      fee := (item->>'fee')::numeric;
      -- Serenity paid sterilization v1: adicional do retrato da compra, não das regras atuais.
      if coalesce((item->>'sterilization_fee')::numeric,0) not in(0,5)
        or (coalesce((item->>'sterilization_fee')::numeric,0)>0 and (item->>'sterilized')::boolean is distinct from true)
      then raise exception 'PAYMENT_AMOUNT_CHANGED'; end if;
    $patch$,'g');
    if changed=original then raise exception 'A validação dos itens do pedido mudou. Nenhuma alteração aplicada.'; end if;
    original:=changed;
    changed:=regexp_replace(original,'subtotal[[:space:]]*:=[[:space:]]*subtotal[[:space:]]*\+[[:space:]]*\(unit[[:space:]]*\+[[:space:]]*fee\)[[:space:]]*\*[[:space:]]*qty[[:space:]]*;',$patch$subtotal := subtotal+(unit+fee+coalesce((item->>'sterilization_fee')::numeric,0))*qty;$patch$,'g');
    if changed=original then raise exception 'O subtotal dos itens mudou. Nenhuma alteração aplicada.'; end if;
    original:=changed;
    changed:=regexp_replace(original,'''unit_price''[[:space:]]*,[[:space:]]*unit[[:space:]]*\+[[:space:]]*fee[[:space:]]*,',$patch$'unit_price',unit+fee+coalesce((item->>'sterilization_fee')::numeric,0),$patch$,'g');
    if changed=original then raise exception 'O preço dos itens mudou. Nenhuma alteração aplicada.'; end if;
    original:=changed;
    changed:=regexp_replace(original,'''anodization_fee''[[:space:]]*,[[:space:]]*fee[[:space:]]*,',$patch$'anodization_fee',fee,'sterilization_fee',coalesce((item->>'sterilization_fee')::numeric,0),$patch$,'g');
    if changed=original then raise exception 'As opções dos itens mudaram. Nenhuma alteração aplicada.'; end if;
    execute changed;
  end if;
end $install$;

update public.serenity_commerce_settings_v1
set preparation_options=true,sterilization_all_products=true,sterilization_fee=5,version=version+1
where singleton and (not preparation_options or not sterilization_all_products or sterilization_fee<>5);
notify pgrst, 'reload schema';
commit;
