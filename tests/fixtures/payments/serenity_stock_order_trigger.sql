CREATE OR REPLACE FUNCTION public.serenity_stock_order_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op='INSERT' then
    if new.status='pending' then
      perform public.serenity_stock_reserve(
        new.id,
        case
          when new.created_by=new.id and new.customer_id=new.id
          then null
          else new.created_by
        end
      );
    elsif new.status='paid' then
      perform public.serenity_stock_debit(new.id,new.created_by);
    end if;
  elsif new.status is distinct from old.status then
    if new.status='paid' then
      perform public.serenity_stock_debit(new.id,null);
    elsif new.status='cancelled' then
      perform public.serenity_stock_release(new.id,null);
    end if;
  end if;

  return new;
end
$function$
