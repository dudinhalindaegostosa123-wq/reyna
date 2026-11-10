begin;
select pg_advisory_xact_lock(7391542026);
create or replace function public.serenity_legacy_document_valid_v1(value text)
returns boolean language plpgsql immutable set search_path='' as $$
declare n integer; i integer; total integer; weight integer; digit integer;
begin
  if value is null or value ~ '^(.)\1+$' then return false; end if;
  if value ~ '^[0-9]{11}$' then
    for n in 9..10 loop
      total:=0;
      for i in 1..n loop total:=total+substring(value,i,1)::integer*(n+2-i); end loop;
      if ((total*10)%11)%10<>substring(value,n+1,1)::integer then return false; end if;
    end loop;
    return true;
  elsif value ~ '^[A-Z0-9]{12}[0-9]{2}$' then
    for n in 12..13 loop
      total:=0;weight:=2;
      for i in reverse n..1 loop
        total:=total+(ascii(substring(value,i,1))-48)*weight;
        weight:=case when weight=9 then 2 else weight+1 end;
      end loop;
      digit:=case when total%11<2 then 0 else 11-total%11 end;
      if digit<>substring(value,n+1,1)::integer then return false; end if;
    end loop;
    return true;
  end if;
  return false;
end $$;
create or replace function public.serenity_legacy_person_key_v1(first_name text,last_name text)
returns text language sql immutable set search_path='' as $$
  select btrim(regexp_replace(translate(lower(concat_ws(' ',nullif(first_name,'NULL'),nullif(last_name,'NULL'))),
    'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn'),'[^a-z0-9]+',' ','g'));
$$;
revoke all on function public.serenity_legacy_document_valid_v1(text),public.serenity_legacy_person_key_v1(text,text) from public,anon,authenticated;
grant execute on function public.serenity_legacy_document_valid_v1(text),public.serenity_legacy_person_key_v1(text,text) to service_role;

create table if not exists public.serenity_legacy_documents_v1 (
  order_id bigint primary key references public.serenity_legacy_orders_v1(old_id),
  document text,
  state text not null check(state in('ready','review')),
  reason text not null check(reason in('matched','invalid','conflict','shared','recipient','previous_review')),
  recipient_key text not null,
  imported_by uuid not null, imported_at timestamptz not null default now(),
  check((state='ready' and document is not null and public.serenity_legacy_document_valid_v1(document)) or (state='review' and document is null))
);
alter table public.serenity_legacy_documents_v1 enable row level security;
revoke all on public.serenity_legacy_documents_v1 from public,anon,authenticated;
grant all on public.serenity_legacy_documents_v1 to service_role;

create or replace function public.serenity_legacy_import_documents_v1(p_rows jsonb,p_actor uuid)
returns jsonb language plpgsql set search_path='' as $$
declare entry jsonb; h public.serenity_legacy_orders_v1%rowtype; prior public.serenity_legacy_documents_v1%rowtype;
  candidate text; billing_key text; delivery_key text; names_count integer; why text; person_counts jsonb;
  ready_count integer:=0; review_count integer:=0; ignored_count integer:=0; review_rows jsonb:='[]';
begin
  perform pg_advisory_xact_lock(7391542026);
  if p_actor is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 10000 or octet_length(p_rows::text)>4000000 then raise exception 'LEGACY_DOCUMENTS_INVALID'; end if;
  -- Valida toda a estrutura antes de consultar documentos: não escreve valores inválidos.
  for entry in select value from jsonb_array_elements(p_rows) loop
    if coalesce(entry->>'order_id','') !~ '^[1-9][0-9]{0,14}$' or jsonb_typeof(entry->'documents') is distinct from 'array'
      or jsonb_typeof(entry->'invalid') is distinct from 'boolean' then raise exception 'LEGACY_DOCUMENTS_INVALID'; end if;
    if exists(select 1 from jsonb_array_elements(entry->'documents') d where jsonb_typeof(d)<>'string' or not public.serenity_legacy_document_valid_v1(d#>>'{}')) then raise exception 'LEGACY_DOCUMENTS_INVALID'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_rows) r group by r->>'order_id' having count(*)>1) then raise exception 'LEGACY_DOCUMENTS_INVALID'; end if;
  select coalesce(jsonb_object_agg(document,names),'{}'::jsonb) into person_counts from (
    select document,count(distinct person_key) names from (
      select d#>>'{}' document,public.serenity_legacy_person_key_v1(o.payload->>'primeiro_nome',o.payload->>'sobrenome') person_key
      from jsonb_array_elements(p_rows) r
      cross join lateral jsonb_array_elements(r->'documents') d
      join public.serenity_legacy_orders_v1 o on o.old_id=(r->>'order_id')::bigint
      union all
      select document,recipient_key from public.serenity_legacy_documents_v1 where state='ready'
    ) identities group by document
  ) counts;
  for entry in select value from jsonb_array_elements(p_rows) loop
    select * into h from public.serenity_legacy_orders_v1 where old_id=(entry->>'order_id')::bigint for share;
    if not found or h.kind<>'shop_order' or not h.visible or h.original_status in('trash','auto-draft') then ignored_count:=ignored_count+1;continue; end if;
    billing_key:=public.serenity_legacy_person_key_v1(h.payload->>'primeiro_nome',h.payload->>'sobrenome');
    delivery_key:=public.serenity_legacy_person_key_v1(h.payload->>'entrega_primeiro_nome',h.payload->>'entrega_sobrenome');
    candidate:=null;why:='matched';
    if (entry->>'invalid')::boolean or jsonb_array_length(entry->'documents')=0 then why:='invalid';
    elsif jsonb_array_length(entry->'documents')<>1 then why:='conflict';
    else
      candidate:=entry->'documents'->>0;
      -- Mesmo documento em nomes de cobrança diferentes: não escolhe um destinatário por suposição.
      names_count:=coalesce((person_counts->>candidate)::integer,0);
      if names_count>1 then why:='shared';
      elsif h.needs_review or billing_key='' or delivery_key='' or billing_key<>delivery_key then why:='recipient'; end if;
    end if;
    select * into prior from public.serenity_legacy_documents_v1 where order_id=h.old_id for update;
    if found and prior.state='ready' and (why<>'matched' or prior.document is distinct from candidate or prior.recipient_key<>delivery_key) then raise exception 'LEGACY_DOCUMENTS_CONFLICT'; end if;
    if found and prior.state='review' and why='matched' then why:='previous_review'; end if;
    if why='matched' then
      insert into public.serenity_legacy_documents_v1(order_id,document,state,reason,recipient_key,imported_by)
      values(h.old_id,candidate,'ready','matched',delivery_key,p_actor) on conflict(order_id) do nothing;
      ready_count:=ready_count+1;
    else
      insert into public.serenity_legacy_documents_v1(order_id,document,state,reason,recipient_key,imported_by)
      values(h.old_id,null,'review',why,delivery_key,p_actor) on conflict(order_id) do nothing;
      review_count:=review_count+1;
      review_rows:=review_rows||jsonb_build_array(jsonb_build_object('order_id',h.old_id,'reason',why));
    end if;
  end loop;
  return jsonb_build_object('ready',ready_count,'review',review_count,'ignored',ignored_count,'review_orders',review_rows);
end $$;
revoke all on function public.serenity_legacy_import_documents_v1(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.serenity_legacy_import_documents_v1(jsonb,uuid) to service_role;
notify pgrst,'reload schema';
commit;
