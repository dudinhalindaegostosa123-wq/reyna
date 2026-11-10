CREATE OR REPLACE FUNCTION public.serenity_label_purchase_note(p_order uuid, p_operation uuid, p_note text, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  final_phase text;
begin
  perform pg_advisory_xact_lock(7391542026);

  if p_actor is null
    or p_note not in (
      'purchase_unknown',
      'generation_unknown',
      'generation_waiting'
    )
  then
    raise exception 'PURCHASE_INVALID';
  end if;

  update public.serenity_label_purchases
  set
    phase=case
      when phase='buying' then 'uncertain'
      else phase
    end,
    note=p_note,
    updated_at=now(),
    actor=p_actor
  where order_id=p_order
    and operation=p_operation
    and phase in ('buying','generating','uncertain')
  returning phase into final_phase;

  if found then
    insert into public.serenity_label_purchase_events(
      order_id,phase,actor
    ) values(p_order,final_phase,p_actor);
  end if;
end
$function$
;
