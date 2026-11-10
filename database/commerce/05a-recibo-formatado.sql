do $receipt$
declare original text;changed text;matches integer;
begin
 perform pg_advisory_xact_lock(7391542026);
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
end $receipt$;
