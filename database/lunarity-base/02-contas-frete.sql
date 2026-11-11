create or replace function public.serenity_checkout_document_valid(document text)
returns boolean language plpgsql immutable set search_path='' as $$
declare size integer; i integer; n integer; weight integer; remainder integer;
begin
 if document is null or document ~ '^(.)\1+$' then return false; end if;
 if document ~ '^[0-9]{11}$' then
  for size in 9..10 loop
   n:=0;
   for i in 1..size loop n:=n+substring(document,i,1)::integer*(size+2-i); end loop;
   if (n*10%11)%10<>substring(document,size+1,1)::integer then return false; end if;
  end loop;
  return true;
 elsif document ~ '^[A-Z0-9]{12}[0-9]{2}$' then
  for size in 12..13 loop
   n:=0;weight:=2;
   for i in reverse size..1 loop
    n:=n+(ascii(substring(document,i,1))-48)*weight;
    weight:=case when weight=9 then 2 else weight+1 end;
   end loop;
   remainder:=n%11;
   if (case when remainder<2 then 0 else 11-remainder end)<>substring(document,size+1,1)::integer then return false;end if;
  end loop;
  return true;
 end if;
 return false;
end $$;

create or replace function public.serenity_checkout_limit(p_key text,p_max integer)
returns boolean language plpgsql set search_path='' as $$
declare n integer;
begin
 if coalesce(p_key,'') !~ '^[a-f0-9]{64}$' or p_max is null or p_max not between 1 and 120 then return false;end if;
 insert into public.serenity_checkout_rate_limits as limits(key,window_started_at,hits) values(p_key,now(),1)
 on conflict(key) do update set
  hits=case when limits.window_started_at<=now()-interval '1 minute' then 1 else least(limits.hits+1,1000000) end,
  window_started_at=case when limits.window_started_at<=now()-interval '1 minute' then now() else limits.window_started_at end
 returning hits into n;
 return n<=p_max;
end $$;

create or replace function public.serenity_wholesale_context(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare settings public.serenity_wholesale_settings%rowtype;account public.serenity_customer_accounts%rowtype;confirmed boolean;
begin
 select * into settings from public.serenity_wholesale_settings where singleton;
 select * into account from public.serenity_customer_accounts where user_id=p_user;
 select exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) into confirmed;
 return jsonb_build_object('active',coalesce(settings.enabled and account.wholesale_status='approved' and confirmed,false),
 'discount_percent',settings.discount_percent,'minimum_products_cents',settings.minimum_products_cents,
 'settings_version',settings.version,'account_version',account.version);
end $$;

create or replace function public.serenity_wholesale_unit_price(p_regular numeric,p_current numeric)
returns numeric language plpgsql stable set search_path='' as $$
declare rules jsonb;who uuid;
begin
 who:=nullif(current_setting('serenity.wholesale_user',true),'')::uuid;
 rules:=public.serenity_wholesale_context(who);
 if rules->>'active' is distinct from 'true' then raise exception 'WHOLESALE_UNAVAILABLE';end if;
 return least(p_current,round(p_regular*(100-(rules->>'discount_percent')::numeric)/100,2));
end $$;

create or replace function public.serenity_customer_account_register(
 p_user uuid,p_email text,p_name text,p_phone text,p_document text,p_wholesale boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare customer uuid;existing public.serenity_customer_accounts%rowtype;
begin
 perform pg_advisory_xact_lock(7391542026);
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and lower(email)=lower(p_email))
  or coalesce(p_name,'')='' or length(p_name)>180 or p_name ~ '[[:cntrl:]]'
  or coalesce(p_phone,'') !~ '^[0-9]{10,11}$' or not public.serenity_checkout_document_valid(p_document)
  or p_wholesale is null then raise exception 'CUSTOMER_ACCOUNT_UNAVAILABLE';end if;
 select * into existing from public.serenity_customer_accounts where user_id=p_user;
 if found then return jsonb_build_object('user_id',existing.user_id,'customer_id',existing.customer_id);end if;
 customer:=gen_random_uuid();
 insert into public.serenity_customers(id,name,email,phone) values(customer,btrim(p_name),lower(p_email),p_phone);
 insert into public.serenity_customer_accounts(user_id,customer_id,document,wholesale_requested,wholesale_status,wholesale_requested_at)
 values(p_user,customer,p_document,p_wholesale,case when p_wholesale then 'pending' else 'not_requested' end,case when p_wholesale then now() end);
 return jsonb_build_object('user_id',p_user,'customer_id',customer);
end $$;

create or replace function public.serenity_shipping_settings_save(p_data jsonb,p_version bigint)
returns bigint language plpgsql set search_path='' as $$
declare next_version bigint;
begin
 if jsonb_typeof(p_data)<>'object' or coalesce(p_data->>'origin','') !~ '^[0-9]{8}$'
  or coalesce(p_data->>'weight_g','') !~ '^[0-9]+$' or (p_data->>'weight_g')::integer not between 1 and 1000000
  or coalesce((p_data->>'height')::numeric,-1) not between 0.1 and 1000 or coalesce((p_data->>'width')::numeric,-1) not between 0.1 and 1000
  or coalesce((p_data->>'length')::numeric,-1) not between 0.1 and 1000 or jsonb_typeof(p_data->'enabled') is distinct from 'boolean'
  or jsonb_typeof(p_data->'manual_slugs') is distinct from 'array'
  or jsonb_array_length(p_data->'manual_slugs')>200
  or exists(select 1 from jsonb_array_elements_text(p_data->'manual_slugs') slug where slug !~ '^[a-zA-Z0-9_-]{1,180}$')
 then raise exception 'SHIPPING_CONFIGURATION';end if;
 update public.serenity_shipping_settings set
  origin=p_data->>'origin',weight_g=(p_data->>'weight_g')::integer,height=(p_data->>'height')::numeric,
  width=(p_data->>'width')::numeric,length=(p_data->>'length')::numeric,max_units=(p_data->>'max_units')::integer,
  enabled=(p_data->>'enabled')::boolean,contact_email=nullif(p_data->>'contact_email',''),
  manual_slugs=array(select jsonb_array_elements_text(p_data->'manual_slugs')),version=version+1
 where singleton and version=p_version returning version into next_version;
 if not found then raise exception 'SHIPPING_SETTINGS_CHANGED';end if;
 return next_version;
end $$;

create or replace function public.serenity_customer_profile_update(p_user uuid,p_name text,p_phone text,p_expected_name text,p_expected_phone text)
returns jsonb language plpgsql set search_path='' as $$
declare customer uuid;
begin
 if coalesce(btrim(p_name),'')='' or length(p_name)>180 or p_name ~ '[[:cntrl:]]'
  or coalesce(p_phone,'') !~ '^[0-9]{10,11}$' then raise exception 'CUSTOMER_PROFILE_UNAVAILABLE';end if;
 select customer_id into customer from public.serenity_customer_accounts where user_id=p_user;
 if customer is null then raise exception 'CUSTOMER_PROFILE_UNAVAILABLE';end if;
 update public.serenity_customers set name=btrim(p_name),phone=p_phone,updated_at=now()
 where id=customer and name is not distinct from p_expected_name and phone is not distinct from p_expected_phone;
 if not found then raise exception 'CUSTOMER_PROFILE_STALE';end if;
 return jsonb_build_object('name',btrim(p_name),'phone',p_phone);
end $$;

create or replace function public.serenity_admin_wholesale_settings_save(p_actor uuid,p_version bigint,p_enabled boolean,p_discount_percent numeric,p_minimum_products_cents bigint)
returns jsonb language plpgsql set search_path='' as $$
declare v bigint;
begin
 if p_actor is null or p_enabled is null or p_discount_percent is null or p_discount_percent not between 0 and 99.99
  or p_minimum_products_cents is null or p_minimum_products_cents not between 0 and 999999999 then raise exception 'WHOLESALE_INVALID';end if;
 update public.serenity_wholesale_settings set enabled=p_enabled,discount_percent=p_discount_percent,
  minimum_products_cents=p_minimum_products_cents,version=version+1 where singleton and version=p_version returning version into v;
 if not found then raise exception 'WHOLESALE_STALE';end if;
 return jsonb_build_object('version',v);
end $$;

create or replace function public.serenity_admin_wholesale_review(p_user uuid,p_actor uuid,p_version bigint,p_decision text)
returns jsonb language plpgsql set search_path='' as $$
declare account public.serenity_customer_accounts%rowtype;
begin
 perform pg_advisory_xact_lock(7391542026);
 if p_actor is null or p_decision not in('approved','rejected','suspended') or p_decision is null then raise exception 'WHOLESALE_INVALID';end if;
 select * into account from public.serenity_customer_accounts where user_id=p_user for update;
 if not found then raise exception 'WHOLESALE_ACCOUNT_NOT_FOUND';end if;
 if account.version<>p_version then raise exception 'WHOLESALE_STALE';end if;
 if account.wholesale_status='not_requested' then raise exception 'WHOLESALE_NOT_REQUESTED';end if;
 if p_decision='suspended' and account.wholesale_status<>'approved' then raise exception 'WHOLESALE_TRANSITION';end if;
 if not public.serenity_checkout_document_valid(account.document) then raise exception 'WHOLESALE_ACCOUNT_INVALID';end if;
 update public.serenity_customer_accounts set wholesale_status=p_decision,wholesale_reviewed_at=now(),wholesale_reviewed_by=p_actor,
  version=version+1,updated_at=now() where user_id=p_user;
 return jsonb_build_object('version',p_version+1,'status',p_decision);
end $$;
