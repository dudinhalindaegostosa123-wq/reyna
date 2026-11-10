begin;
select pg_advisory_xact_lock(7391542026);
alter table public.serenity_commerce_settings_v1 add column if not exists stem_fee numeric not null default 0 check(stem_fee in(0,5));
alter table public.serenity_commerce_settings_v1 drop constraint if exists serenity_commerce_settings_v1_sterilization_fee_check;
alter table public.serenity_commerce_settings_v1 add constraint serenity_commerce_settings_v1_sterilization_fee_check check(sterilization_fee in(0,5,10));
-- Only future quotes use the new fees. Saved payment amounts remain unchanged.
do $migration$
declare original text; changed text; signature regprocedure; installed integer:=0; matches integer;
begin
 original:=pg_get_functiondef('public.serenity_checkout_quote(jsonb)'::regprocedure);
 if position('Serenity services v2' in original)=0 then
  if position('Serenity paid sterilization v1' in original)=0 then raise exception 'Instale primeiro a esterilização por peça.'; end if;
  changed:=replace(original,'preparation_fee:=5;', 'preparation_fee:=(select sterilization_fee from public.serenity_commerce_settings_v1 where singleton);');
  changed:=replace(changed,'''Sim (+ R$ 5,00 por peça)''', '''Sim (+ R$ ''||replace(to_char(preparation_fee,''FM990.00''),''.'','','')||'' por peça)''');
  if changed=original then raise exception 'A cotação de esterilização mudou.'; end if;
  if position('entries:=entries||jsonb_build_array(item);' in changed)=0 then raise exception 'A composição dos serviços mudou.'; end if;
  changed:=replace(changed,'entries:=entries||jsonb_build_array(item);',$patch$
    -- Serenity services v2
    if coalesce(item->>'stem','')<>'' then
      item:=item||jsonb_build_object('stem_fee',(select stem_fee from public.serenity_commerce_settings_v1 where singleton));
    else item:=item||jsonb_build_object('stem_fee',0); end if;
    added_cents:=added_cents+round((item->>'stem_fee')::numeric*100)::bigint*(item->>'quantity')::integer;
    item:=item||jsonb_build_object('line_total',(item->>'line_total')::numeric+(item->>'stem_fee')::numeric*(item->>'quantity')::integer,
      'variation',replace(coalesce(item->>'variation',''),'Haste incluída:',case when (item->>'stem_fee')::numeric>0 then 'Haste (+ R$ 5,00 por peça):' else 'Haste incluída:' end));
    entries:=entries||jsonb_build_array(item);$patch$);
  execute changed;
 end if;
 -- Patch the preserved completion implementation, including unlimited-sale wrappers.
 for signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and p.proname in('serenity_checkout_complete_order_v2','serenity_unlimited_complete_base_v1') loop
  original:=pg_get_functiondef(signature);
  if position('Serenity services completion v2' in original)>0 then installed:=installed+1;continue;end if;
  if position('Serenity paid sterilization v1' in original)=0 then continue;end if;
  changed:=replace(original,'not in(0,5)','not in(0,5,10)');
  changed:=replace(changed,'fee := (item->>''fee'')::numeric;', $patch$fee := (item->>'fee')::numeric;
    -- Serenity services completion v2: validate saved fees, never reprice a paid checkout.
    if coalesce((item->>'stem_fee')::numeric,0) not in(0,5)
      or (coalesce((item->>'stem_fee')::numeric,0)>0 and coalesce(item->>'stem','') not in('4','6','8','10'))
    then raise exception 'PAYMENT_AMOUNT_CHANGED';end if;$patch$);
  changed:=replace(changed,'unit+fee+coalesce((item->>''sterilization_fee'')::numeric,0)', 'unit+fee+coalesce((item->>''sterilization_fee'')::numeric,0)+coalesce((item->>''stem_fee'')::numeric,0)');
  changed:=replace(changed,'''sterilization_fee'',coalesce((item->>''sterilization_fee'')::numeric,0),', '''sterilization_fee'',coalesce((item->>''sterilization_fee'')::numeric,0),''stem_fee'',coalesce((item->>''stem_fee'')::numeric,0),');
  if position('Serenity services completion v2' in changed)=0 or changed=original then raise exception 'A conclusão de pedidos mudou.'; end if;
  execute changed; installed:=installed+1;
 end loop;
 if installed=0 then raise exception 'A implementação da conclusão não foi encontrada.';end if;
 -- The receipt also includes both services in the unit total.
 if to_regprocedure('public.serenity_guest_register_v1(uuid,text,text)') is not null then
  original:=pg_get_functiondef('public.serenity_guest_register_v1(uuid,text,text)'::regprocedure);
  if position('''stem_fee''' in original)=0 then
   select count(*) into matches from regexp_matches(original,
    $pattern$coalesce[[:space:]]*\([[:space:]]*\([[:space:]]*i[[:space:]]*->>[[:space:]]*'sterilization_fee'[[:space:]]*\)[[:space:]]*::[[:space:]]*numeric[[:space:]]*,[[:space:]]*0[[:space:]]*\)$pattern$,'gi');
   if matches<>1 then raise exception 'O recibo do checkout mudou. Nenhuma alteração aplicada.';end if;
   changed:=regexp_replace(original,
    $pattern$coalesce[[:space:]]*\([[:space:]]*\([[:space:]]*i[[:space:]]*->>[[:space:]]*'sterilization_fee'[[:space:]]*\)[[:space:]]*::[[:space:]]*numeric[[:space:]]*,[[:space:]]*0[[:space:]]*\)$pattern$,
    $replacement$coalesce((i->>'sterilization_fee')::numeric,0)+coalesce((i->>'stem_fee')::numeric,0)$replacement$,'gi');
   if changed=original then raise exception 'O recibo do checkout mudou.';end if;
   execute changed;
  end if;
 end if;
end $migration$;
update public.serenity_commerce_settings_v1 set sterilization_fee=10,stem_fee=5,anodization_fee=0,preparation_options=true,sterilization_all_products=true,version=version+1
 where singleton and (sterilization_fee<>10 or stem_fee<>5 or anodization_fee<>0 or not preparation_options or not sterilization_all_products);
notify pgrst,'reload schema';
commit;
