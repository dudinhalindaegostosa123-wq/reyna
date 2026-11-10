CREATE OR REPLACE FUNCTION public.serenity_label_purchase_order_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status is distinct from old.status
    and exists(
      select 1
      from public.serenity_label_purchases
      where order_id=new.id
        and phase in ('buying','uncertain','generating')
    )
  then
    raise exception 'LABEL_PURCHASE_IN_PROGRESS';
  end if;

  return new;
end
$function$
;
