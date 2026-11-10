-- Editor administrativo de produtos da Lunarity. Supabase NOVO, SQL Editor.
-- Nao reimporta produtos nem altera seus valores durante a instalacao.
BEGIN;
CREATE TABLE IF NOT EXISTS public.serenity_product_commercial (
  entity_key text PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  supplier_name text CHECK (supplier_name IS NULL OR char_length(supplier_name) <= 180),
  unit_cost numeric CHECK (unit_cost IS NULL OR (unit_cost >= 0 AND unit_cost::text NOT IN ('NaN','Infinity','-Infinity'))),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (entity_key = CASE WHEN variant_id IS NULL THEN 'product:' || product_id::text ELSE 'variant:' || variant_id::text END)
);
CREATE TABLE IF NOT EXISTS public.serenity_admin_photo_uploads (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  media jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.serenity_product_commercial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.serenity_admin_photo_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.serenity_product_commercial, public.serenity_admin_photo_uploads FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.serenity_product_commercial, public.serenity_admin_photo_uploads TO service_role;

CREATE OR REPLACE FUNCTION public.serenity_admin_read_product(p_product_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  bundle jsonb;
begin
  select jsonb_build_object(
    'product',
    to_jsonb(p),

    'commercial',
    coalesce(
      (
        select to_jsonb(c)
        from public.serenity_product_commercial c
        where c.entity_key = 'product:' || p.id::text
      ),
      '{}'::jsonb
    ),

    'variants',
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(v) || jsonb_build_object(
            'commercial',
            coalesce(
              (
                select to_jsonb(c)
                from public.serenity_product_commercial c
                where c.entity_key = 'variant:' || v.id::text
              ),
              '{}'::jsonb
            )
          )
          order by v.position, v.id
        )
        from public.product_variants v
        where v.product_id = p.id
      ),
      '[]'::jsonb
    )
  )
  into bundle
  from public.products p
  where p.id::text = p_product_id;

  if bundle is null then
    return null;
  end if;

  return bundle || jsonb_build_object(
    'version',
    md5(bundle::text)
  );
end
$function$;
REVOKE ALL ON FUNCTION public.serenity_admin_read_product(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.serenity_admin_read_product(text) TO service_role;

CREATE OR REPLACE FUNCTION public.serenity_admin_save_product(p_product_id text, p_version text, p_payload jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  parent public.products%rowtype;
  data public.products%rowtype;
  variation public.product_variants%rowtype;
  item jsonb;
  current_bundle jsonb;
  incoming_count integer;
  existing_count integer;
begin
  perform pg_advisory_xact_lock(7391542026); -- Serenity stock mutex v1

  select *
  into parent
  from public.products
  where id::text = p_product_id
  for update;

  if not found then
    raise exception 'PRODUCT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  perform id
  from public.product_variants
  where product_id = parent.id
  order by id
  for update;

  current_bundle :=
    public.serenity_admin_read_product(p_product_id);

  if current_bundle->>'version' is distinct from p_version then
    raise exception 'STALE_PRODUCT'
      using errcode = '40001';
  end if;

  if jsonb_typeof(p_payload->'variants') is distinct from 'array' then
    raise exception 'INVALID_VARIANTS'
      using errcode = '22023';
  end if;

  incoming_count :=
    jsonb_array_length(p_payload->'variants');

  select count(*)
  into existing_count
  from public.product_variants
  where product_id = parent.id;

  if incoming_count <> existing_count
    or incoming_count <> (
      select count(distinct x->>'id')
      from jsonb_array_elements(p_payload->'variants') x
    )
  then
    raise exception 'INVALID_VARIANTS'
      using errcode = '22023';
  end if;

  for item in
    select value
    from jsonb_array_elements(p_payload->'variants')
  loop
    if not exists (
      select 1
      from public.product_variants
      where id::text = item->>'id'
        and product_id = parent.id
    ) then
      raise exception 'INVALID_VARIANT_OWNER'
        using errcode = '22023';
    end if;
  end loop;

  data := jsonb_populate_record(
    null::public.products,
    p_payload->'product'
  );

  if coalesce(btrim(data.name), '') = ''
    or data.status is null
    or data.status not in ('published', 'draft')
  then
    raise exception 'INVALID_PRODUCT'
      using errcode = '22023';
  end if;

  update public.products
  set
    name = data.name,
    sku = data.sku,
    short_description = data.short_description,
    description = data.description,
    material = data.material,
    categories = data.categories,
    tags = data.tags,
    status = data.status,
    visibility = data.visibility,
    featured = data.featured,
    sold_individually = data.sold_individually,
    regular_price = data.regular_price,
    sale_price = data.sale_price,
    sale_starts_at = data.sale_starts_at,
    sale_ends_at = data.sale_ends_at,
    stock_status = data.stock_status,
    stock_quantity = data.stock_quantity,
    seo_title = data.seo_title,
    seo_description = data.seo_description
  where id = parent.id;

  insert into public.serenity_product_commercial (
    entity_key,
    product_id,
    variant_id,
    supplier_name,
    unit_cost,
    updated_at
  )
  values (
    'product:' || parent.id::text,
    parent.id,
    null,
    nullif(
      btrim(p_payload->'commercial'->>'supplier_name'),
      ''
    ),
    nullif(
      p_payload->'commercial'->>'unit_cost',
      ''
    )::numeric,
    now()
  )
  on conflict (entity_key)
  do update set
    supplier_name = excluded.supplier_name,
    unit_cost = excluded.unit_cost,
    updated_at = excluded.updated_at;

  for item in
    select value
    from jsonb_array_elements(p_payload->'variants')
  loop
    variation := jsonb_populate_record(
      null::public.product_variants,
      item
    );

    update public.product_variants
    set
      name = variation.name,
      sku = variation.sku,
      attributes = variation.attributes,
      regular_price = variation.regular_price,
      sale_price = variation.sale_price,
      sale_starts_at = variation.sale_starts_at,
      sale_ends_at = variation.sale_ends_at,
      stock_status = variation.stock_status,
      stock_quantity = variation.stock_quantity,
      enabled = variation.enabled
    where id::text = item->>'id'
      and product_id = parent.id
    returning * into variation;

    insert into public.serenity_product_commercial (
      entity_key,
      product_id,
      variant_id,
      supplier_name,
      unit_cost,
      updated_at
    )
    values (
      'variant:' || variation.id::text,
      parent.id,
      variation.id,
      nullif(
        btrim(item->'commercial'->>'supplier_name'),
        ''
      ),
      nullif(
        item->'commercial'->>'unit_cost',
        ''
      )::numeric,
      now()
    )
    on conflict (entity_key)
    do update set
      supplier_name = excluded.supplier_name,
      unit_cost = excluded.unit_cost,
      updated_at = excluded.updated_at;
  end loop;

  return parent.id::text;
end
$function$;
REVOKE ALL ON FUNCTION public.serenity_admin_save_product(text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.serenity_admin_save_product(text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.serenity_admin_read_editor(p_product_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  bundle jsonb;
begin
  bundle := public.serenity_admin_read_product(p_product_id);

  if bundle is null then
    return null;
  end if;

  bundle := (bundle - 'version') || jsonb_build_object(
    'media',
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(m)
          order by m.position, m.id
        )
        from public.product_media m
        where m.product_id::text = p_product_id
      ),
      '[]'::jsonb
    )
  );

  return bundle || jsonb_build_object(
    'version',
    md5(bundle::text)
  );
end
$function$;
REVOKE ALL ON FUNCTION public.serenity_admin_read_editor(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.serenity_admin_read_editor(text) TO service_role;

CREATE OR REPLACE FUNCTION public.serenity_admin_save_editor(p_product_id uuid, p_admin_id uuid, p_version text, p_create boolean, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  parent public.products%rowtype;
  bundle jsonb;
  item jsonb;
  ticket public.serenity_admin_photo_uploads%rowtype;
  variant_ids uuid[];
  photo_ids uuid[];
  current_ids uuid[];
  position_index integer := 0;
  youtube text;
begin
  perform pg_advisory_xact_lock(7391542026); -- Serenity stock mutex v1

  if p_create then
    if exists (
      select 1
      from public.products
      where id = p_product_id
    ) then
      raise exception 'ALREADY_CREATED';
    end if;

    if coalesce(
      p_payload->'product'->>'slug',
      ''
    ) !~ '^[a-z0-9][a-z0-9-]{0,179}$'
      or coalesce(
        p_payload->'product'->>'product_type',
        ''
      ) not in ('simple', 'variable')
    then
      raise exception 'INVALID_PRODUCT';
    end if;

    insert into public.products(
      id,
      name,
      slug,
      product_type
    )
    values (
      p_product_id,
      p_payload->'product'->>'name',
      p_payload->'product'->>'slug',
      p_payload->'product'->>'product_type'
    );
  end if;

  select *
  into parent
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  perform id
  from public.product_variants
  where product_id = parent.id
  order by id
  for update;

  perform id
  from public.product_media
  where product_id = parent.id
  order by id
  for update;

  bundle := public.serenity_admin_read_editor(
    parent.id::text
  );

  if not p_create
    and bundle->>'version' is distinct from p_version
  then
    raise exception 'STALE_PRODUCT';
  end if;

  if jsonb_typeof(p_payload->'variants') is distinct from 'array'
    or jsonb_typeof(p_payload->'photos') is distinct from 'array'
  then
    raise exception 'INVALID_PAYLOAD';
  end if;

  select array_agg((x->>'id')::uuid)
  into variant_ids
  from jsonb_array_elements(p_payload->'variants') x;

  if (
    select count(*)
    from unnest(variant_ids)
  ) <> (
    select count(distinct x)
    from unnest(variant_ids) x
  ) then
    raise exception 'INVALID_VARIANTS';
  end if;

  if exists (
    select 1
    from public.product_variants
    where product_id = parent.id
      and not (
        id = any(
          coalesce(variant_ids, '{}'::uuid[])
        )
      )
  ) then
    raise exception 'MISSING_VARIANT';
  end if;

  if exists (
    select 1
    from public.product_variants
    where id = any(variant_ids)
      and product_id <> parent.id
  ) then
    raise exception 'INVALID_VARIANT_OWNER';
  end if;

  for item in
    select value
    from jsonb_array_elements(p_payload->'variants')
  loop
    if jsonb_typeof(
      item->'attributes'
    ) is distinct from 'object' then
      raise exception 'INVALID_ATTRIBUTES';
    end if;

    if not exists (
      select 1
      from public.product_variants
      where id = (item->>'id')::uuid
    ) then
      if item->'attributes' = '{}'::jsonb then
        raise exception 'INVALID_ATTRIBUTES';
      end if;

      insert into public.product_variants(
        id,
        product_id,
        name,
        attributes,
        position
      )
      values (
        (item->>'id')::uuid,
        parent.id,
        item->>'name',
        item->'attributes',
        (
          select coalesce(max(position), -1) + 1
          from public.product_variants
          where product_id = parent.id
        )
      );
    end if;
  end loop;

  if coalesce(array_length(variant_ids, 1), 0) > 0 then
    if parent.product_type not in ('simple', 'variable') then
      raise exception 'UNSUPPORTED_PRODUCT_TYPE';
    end if;

    update public.products
    set product_type = 'variable'
    where id = parent.id;
  end if;

  perform public.serenity_admin_save_product(
    parent.id::text,
    public.serenity_admin_read_product(
      parent.id::text
    )->>'version',
    p_payload
  );

  if exists (
    select 1
    from public.product_variants
    where product_id = parent.id
      and enabled
      and attributes <> '{}'::jsonb
    group by attributes
    having count(*) > 1
      and count(*) > (
        select count(*)
        from jsonb_array_elements(bundle->'variants') original
        where coalesce(
          (original->>'enabled')::boolean,
          true
        )
          and original->'attributes' =
            product_variants.attributes
      )
  ) then
    raise exception 'DUPLICATE_VARIANT';
  end if;

  select array_agg((x->>'id')::uuid)
  into photo_ids
  from jsonb_array_elements(p_payload->'photos') x;

  if (
    select count(*)
    from unnest(photo_ids)
  ) <> (
    select count(distinct x)
    from unnest(photo_ids) x
  ) then
    raise exception 'INVALID_PHOTOS';
  end if;

  select array_agg(id)
  into current_ids
  from public.product_media
  where product_id = parent.id
    and media_type = 'image';

  for item in
    select value
    from jsonb_array_elements(p_payload->'photos')
  loop
    if not (
      (item->>'id')::uuid = any(
        coalesce(current_ids, '{}'::uuid[])
      )
    ) then
      select *
      into ticket
      from public.serenity_admin_photo_uploads
      where id = (item->>'id')::uuid
        and product_id = parent.id
        and admin_id = p_admin_id
      for update;

      if not found then
        raise exception 'INVALID_PHOTO_UPLOAD';
      end if;

      insert into public.product_media(
        id,
        product_id,
        media_type,
        storage_path,
        thumbnail_path,
        original_path
      )
      values (
        ticket.id,
        parent.id,
        'image',
        ticket.media->>'storage_path',
        ticket.media->>'thumbnail_path',
        ticket.media->>'original_path'
      );

      delete from public.serenity_admin_photo_uploads
      where id = ticket.id;
    end if;

    update public.product_media
    set
      variant_id = nullif(
        item->>'variant_id',
        ''
      )::uuid,
      alt_text = coalesce(item->>'alt_text', ''),
      position = position_index
    where id = (item->>'id')::uuid
      and product_id = parent.id
      and media_type = 'image';

    if not found then
      raise exception 'INVALID_PHOTO_OWNER';
    end if;

    position_index := position_index + 1;
  end loop;

  delete from public.product_media
  where product_id = parent.id
    and media_type = 'image'
    and not (
      id = any(
        coalesce(photo_ids, '{}'::uuid[])
      )
    );

  if coalesce(
    (p_payload->>'video_changed')::boolean,
    false
  ) then
    youtube := nullif(p_payload->>'youtube_id', '');

    if youtube is not null
      and youtube !~ '^[A-Za-z0-9_-]{11}$'
    then
      raise exception 'INVALID_VIDEO';
    end if;

    delete from public.product_media
    where product_id = parent.id
      and media_type = 'youtube';

    if youtube is not null then
      insert into public.product_media(
        product_id,
        media_type,
        youtube_id,
        source_url,
        position
      )
      values (
        parent.id,
        'youtube',
        youtube,
        'https://www.youtube.com/watch?v=' || youtube,
        0
      );
    end if;
  end if;

  update public.products
  set updated_at = now()
  where id = parent.id;

  return parent.id;
end
$function$;
REVOKE ALL ON FUNCTION public.serenity_admin_save_editor(uuid,uuid,text,boolean,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.serenity_admin_save_editor(uuid,uuid,text,boolean,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.lunarity_admin_search_products(p_query text)
RETURNS SETOF public.products LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT p.* FROM public.products p
  WHERE NOT EXISTS (
    SELECT 1 FROM regexp_split_to_table(public.serenity_normalize(btrim(left(coalesce(p_query, ''), 100))), '\s+') AS terms(word)
    WHERE word <> '' AND strpos(public.serenity_normalize(concat_ws(' ', p.name, p.sku, p.woo_id::text)), word) = 0
  );
$function$;
REVOKE ALL ON FUNCTION public.lunarity_admin_search_products(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lunarity_admin_search_products(text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
