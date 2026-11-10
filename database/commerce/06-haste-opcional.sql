begin;
select pg_advisory_xact_lock(7391542026);
-- Requires commerce/05. Only future quotes change; saved payments are not repriced.
do $migration$
declare original text;changed text;
begin
 original:=pg_get_functiondef('public.serenity_checkout_quote(jsonb)'::regprocedure);
 if position('Serenity services v2' in original)=0 then
  raise exception 'Instale primeiro commerce/05-servicos-esterilizacao-hastes.sql.';
 end if;
 original:=pg_get_functiondef('public.serenity_preparation_quote_base_v1(jsonb)'::regprocedure);
 if position('Serenity optional stem v1' in original)=0 then
  changed:=replace(original,
   'elsif coalesce(item->>''stem'','''') not in(''4'',''6'',''8'',''10'') then raise exception ''TOP_STEM_REQUIRED''; end if;',
   'elsif coalesce(item->>''stem'','''') not in('''',''6'',''8'') then raise exception ''INVALID_STEM''; end if; /* Serenity optional stem v1 */');
  if changed=original then raise exception 'A validação de hastes mudou. Nenhuma alteração aplicada.';end if;
  original:=changed;
  changed:=replace(original,
   'label:=concat_ws('' · '',nullif(label,''''),''Haste incluída: ''||(item->>''stem'')||'' mm'');',
   'if coalesce(item->>''stem'','''')<>'''' then label:=concat_ws('' · '',nullif(label,''''),''Haste incluída: ''||(item->>''stem'')||'' mm''); end if;');
  if changed=original then raise exception 'A descrição de hastes mudou. Nenhuma alteração aplicada.';end if;
  execute changed;
 end if;
end $migration$;
update public.serenity_commerce_settings_v1 set stem_fee=5,version=version+1
 where singleton and stem_fee<>5;
notify pgrst,'reload schema';
commit;
