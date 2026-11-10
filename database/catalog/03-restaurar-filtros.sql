-- Lunarity: restaurar classificacao dos filtros no Supabase NOVO.
-- Recalcula apenas dados derivados; nao altera produtos, precos ou imagens.
BEGIN;

CREATE OR REPLACE FUNCTION public.serenity_filter_text_v1(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select regexp_replace(
    translate(
      lower(
        regexp_replace(
          coalesce(p_text, ''),
          '<[^>]*>',
          ' ',
          'g'
        )
      ),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'
    ),
    '[[:space:]]+',
    ' ',
    'g'
  );
$function$;

REVOKE ALL ON FUNCTION public.serenity_filter_text_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.serenity_filter_text_v1(text) TO service_role;
CREATE OR REPLACE FUNCTION public.serenity_jewelry_filters_v1(p_name text, p_categories text[], p_tags text[], p_attributes jsonb, p_description text, p_variants jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  identity_text text;
  title_text text;
  attributes_text text;
  description_text text;
  source jsonb;
  sources jsonb;
  is_top boolean;
  is_push boolean;
  size12 boolean;
  size16 boolean;
  result text[] := array[]::text[];
begin
  identity_text := public.serenity_filter_text_v1(
    coalesce(p_name, '') || ' ' ||
    coalesce(array_to_string(p_categories, ' '), '') || ' ' ||
    coalesce(array_to_string(p_tags, ' '), '')
  );

  description_text :=
    public.serenity_filter_text_v1(p_description);

  is_top :=
    identity_text ~ '(^|[^a-z])topos?([^a-z]|$)';

  if identity_text ~
    '(^|[^a-z])(argolas?|clicker)([^a-z]|$)'
  then
    result := array_append(result, 'argolas');
  end if;

  if identity_text ~ 'pedras?[ -]+natura(is|l)' then
    result := array_append(result, 'pedras-naturais');
  end if;

  sources := jsonb_build_array(
    jsonb_build_object(
      'name', p_name,
      'attributes', coalesce(p_attributes, '{}'::jsonb)
    )
  );

  if jsonb_typeof(p_variants) = 'array' then
    sources := sources || p_variants;
  end if;

  for source in
    select value
    from jsonb_array_elements(sources)
  loop
    title_text :=
      public.serenity_filter_text_v1(source ->> 'name');

    attributes_text := public.serenity_filter_text_v1(
      coalesce(source -> 'attributes', '{}'::jsonb)::text
    );

    is_push := (
      title_text || ' ' ||
      attributes_text || ' ' ||
      description_text
    ) ~
      'push[ -]*pin|threadless|sem[ -]+rosca|encaixe[ -]+por[ -]+pressao';

    size12 :=
      title_text ~
        '(^|[^0-9])1[.,]2[ ]*(mm|x|×)([^a-z]|$)'
      or (
        attributes_text ~ 'espessura|haste|labret|rosca'
        and attributes_text ~
          '(^|[^0-9])1[.,]2([^0-9]|$)'
      )
      or description_text ~
        '(haste|labret|espessura|compativel|rosca)[^.!?;]{0,80}1[.,]2[ ]*mm'
      or description_text ~
        '1[.,]2[ ]*mm[^.!?;]{0,40}(haste|labret|rosca)';

    size16 :=
      title_text ~
        '(^|[^0-9])1[.,]6[ ]*(mm|x|×)([^a-z]|$)'
      or (
        attributes_text ~ 'espessura|haste|labret|rosca'
        and attributes_text ~
          '(^|[^0-9])1[.,]6([^0-9]|$)'
      )
      or description_text ~
        '(haste|labret|espessura|compativel|rosca)[^.!?;]{0,80}1[.,]6[ ]*mm'
      or description_text ~
        '1[.,]6[ ]*mm[^.!?;]{0,40}(haste|labret|rosca)';

    if is_top and is_push then
      result := array_append(result, 'push-pin');
    end if;

    if is_top and size12 and not is_push then
      result := array_append(result, 'topo-labret-12');
    end if;

    if is_top and size16 and not is_push then
      if (
        identity_text || ' ' ||
        title_text || ' ' ||
        attributes_text || ' ' ||
        description_text
      ) ~ 'rosca[ -]+interna'
      then
        result := array_append(result, 'topo-rosca-16');
      end if;

      if (
        identity_text || ' ' ||
        title_text || ' ' ||
        attributes_text || ' ' ||
        description_text
      ) ~ 'microdermal|surface'
      then
        result := array_append(result, 'micro-surface-16');
      end if;
    end if;
  end loop;

  return array(
    select distinct value
    from unnest(result) as items(value)
    order by value
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.serenity_jewelry_filters_v1(text,text[],text[],jsonb,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.serenity_jewelry_filters_v1(text,text[],text[],jsonb,text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.serenity_refresh_jewelry_filter_v1(p_product uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.serenity_jewelry_filter_cache_v1 (
    product_id,
    jewelry_filters,
    updated_at
  )
  select
    p.id,
    public.serenity_jewelry_filters_v1(
      p.name,
      p.categories,
      p.tags,
      p.attributes,
      coalesce(p.short_description, '') || ' ' ||
        coalesce(p.description, ''),
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'name', v.name,
              'attributes', v.attributes
            )
          )
          from public.product_variants v
          where v.product_id = p.id
            and v.enabled = true
            and p.product_type = 'variable'
        ),
        '[]'::jsonb
      )
    ),
    now()
  from public.products p
  where p.id = p_product
  on conflict (product_id) do update
  set
    jewelry_filters = excluded.jewelry_filters,
    updated_at = excluded.updated_at;
end;
$function$;

REVOKE ALL ON FUNCTION public.serenity_refresh_jewelry_filter_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.serenity_refresh_jewelry_filter_v1(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.serenity_jewelry_filter_product_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.serenity_refresh_jewelry_filter_v1(new.id);
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.serenity_jewelry_filter_product_trigger_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.serenity_jewelry_filter_product_trigger_v1() TO service_role;
CREATE OR REPLACE FUNCTION public.serenity_jewelry_filter_variant_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if TG_OP = 'DELETE' then
    perform public.serenity_refresh_jewelry_filter_v1(
      old.product_id
    );
    return old;
  end if;

  if TG_OP = 'UPDATE' then
    if old.product_id is distinct from new.product_id then
      perform public.serenity_refresh_jewelry_filter_v1(
        old.product_id
      );
    end if;
  end if;

  perform public.serenity_refresh_jewelry_filter_v1(
    new.product_id
  );

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.serenity_jewelry_filter_variant_trigger_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.serenity_jewelry_filter_variant_trigger_v1() TO service_role;

DROP TRIGGER IF EXISTS lunarity_product_filters_v1 ON public.products;
CREATE TRIGGER lunarity_product_filters_v1 AFTER INSERT OR UPDATE OF name, categories, tags, attributes, short_description, description, product_type ON public.products
FOR EACH ROW EXECUTE FUNCTION public.serenity_jewelry_filter_product_trigger_v1();
DROP TRIGGER IF EXISTS lunarity_variant_filters_v1 ON public.product_variants;
CREATE TRIGGER lunarity_variant_filters_v1 AFTER INSERT OR UPDATE OF name, attributes, enabled, product_id OR DELETE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.serenity_jewelry_filter_variant_trigger_v1();

INSERT INTO public.serenity_jewelry_filter_cache_v1(product_id, jewelry_filters, updated_at)
SELECT p.id, public.serenity_jewelry_filters_v1(p.name, p.categories, p.tags, p.attributes,
  coalesce(p.short_description,'') || ' ' || coalesce(p.description,''),
  coalesce((SELECT jsonb_agg(jsonb_build_object('name',v.name,'attributes',v.attributes))
    FROM public.product_variants v WHERE v.product_id=p.id AND v.enabled=true AND p.product_type='variable'),'[]'::jsonb)), now()
FROM public.products p
ON CONFLICT (product_id) DO UPDATE SET jewelry_filters=excluded.jewelry_filters, updated_at=excluded.updated_at;

-- Filtros nao precisam calcular precos nem buscar galerias do catalogo completo.
CREATE OR REPLACE VIEW public.lunarity_catalog_facets_v1 WITH (security_barrier=true) AS
SELECT coalesce(p.woo_id::text,p.id::text) AS id, p.material, p.visibility,
  ARRAY(SELECT DISTINCT public.serenity_slug(category) FROM unnest(p.categories) AS c(category) WHERE btrim(category)<>'') AS category_slugs,
  coalesce(f.jewelry_filters,'{}'::text[]) AS jewelry_filters
FROM public.products p LEFT JOIN public.serenity_jewelry_filter_cache_v1 f ON f.product_id=p.id
WHERE p.status='published' AND p.visibility IN ('visible','catalog');
REVOKE ALL ON public.lunarity_catalog_facets_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lunarity_catalog_facets_v1 TO anon, authenticated, service_role;
ANALYZE public.serenity_jewelry_filter_cache_v1;
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT count(*) AS produtos_classificados FROM public.serenity_jewelry_filter_cache_v1;
