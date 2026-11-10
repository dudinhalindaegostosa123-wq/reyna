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

create or replace function public.serenity_checkout_quote(p_items jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb; source jsonb; item jsonb; entries jsonb:='[]'::jsonb; label text; idx integer:=0;
begin
 -- Serenity preparation v1: sem preço adicional; preserva o cálculo e o estoque existentes.
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'INVALID_CART'; end if;
 result:=public.serenity_preparation_quote_base_v1(p_items);
 for item in select value from jsonb_array_elements(result->'items') loop
  source:=p_items->idx; idx:=idx+1;
  if source ? 'sterilized' then
   if jsonb_typeof(source->'sterilized') is distinct from 'boolean' then raise exception 'INVALID_STERILIZATION'; end if;
   if (source->>'sterilized')::boolean and not public.serenity_commerce_jewel_v1((item->>'product_id')::uuid) then raise exception 'INVALID_STERILIZATION'; end if;
   label:=concat_ws(' · ',nullif(item->>'variation',''),'Esterilização solicitada: '||case when (source->>'sterilized')::boolean then 'Sim (gratuita)' else 'Não' end);
   item:=item||jsonb_build_object('sterilized',(source->>'sterilized')::boolean,'variation',label);
  end if;
  entries:=entries||jsonb_build_array(item);
 end loop;
 return jsonb_set(result,'{items}',entries);
end $$;
-- Preserva o acesso de serviço e não expõe a cotação bruta ao público.
revoke all on function public.serenity_checkout_quote(jsonb) from public,anon,authenticated;
grant execute on function public.serenity_checkout_quote(jsonb) to service_role;
update public.serenity_commerce_settings_v1 set preparation_options=true,version=version+1 where singleton and not preparation_options;
commit;
