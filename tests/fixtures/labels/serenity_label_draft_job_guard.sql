CREATE OR REPLACE FUNCTION public.serenity_label_draft_job_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if exists (
    select 1
    from public.serenity_label_jobs
    where order_id = new.order_id
      and state in (
        'creating', 'prepared', 'uncertain'
      )
  ) then
    raise exception 'LABEL_JOB_LOCKED';
  end if;

  return new;
end
$function$
;
