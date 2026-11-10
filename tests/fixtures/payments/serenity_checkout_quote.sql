CREATE OR REPLACE FUNCTION public.serenity_checkout_quote(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  p public.products%rowtype;
  v public.product_variants%rowtype;
  item jsonb;
  rows jsonb := '[]'::jsonb;
  q integer;
  grouped integer;
  parent_q integer;
  regular numeric;
  sale numeric;
  starts timestamptz;
  ends timestamptz;
  price numeric;
  fee numeric;
  total numeric := 0;
  label text;
begin
  perform pg_advisory_xact_lock(7391542026); -- Serenity stock mutex v1

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'INVALID_CART';
  end if;

  if jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'INVALID_CART';
  end if;

  for item in
    select value from jsonb_array_elements(p_items)
  loop
    if coalesce(item->>'quantity','') !~ '^[1-9][0-9]{0,2}$'
      or coalesce(item->>'slug','') !~ '^[a-zA-Z0-9_-]{1,180}$'
      or length(coalesce(item->>'variant','')) > 40
    then
      raise exception 'INVALID_CART';
    end if;
  end loop;

  for item in
    select value from jsonb_array_elements(p_items)
  loop
    select *
    into p
    from public.products
    where slug=item->>'slug'
    for share;

    if not found
      or p.status is distinct from 'published'
      or p.visibility='hidden'
    then
      raise exception 'PRODUCT_UNAVAILABLE';
    end if;

    q := (item->>'quantity')::integer;

    select sum((x->>'quantity')::integer)
    into parent_q
    from jsonb_array_elements(p_items) x
    where x->>'slug'=p.slug;

    if p.stock_status='outofstock'
      or (
        p.stock_quantity is not null
        and parent_q>p.stock_quantity
      )
      or (p.sold_individually and parent_q>1)
    then
      raise exception 'STOCK_CHANGED';
    end if;

    v := null;
    label := null;

    if p.product_type='variable' then
      select *
      into v
      from public.product_variants
      where product_id=p.id
        and (
          id::text=item->>'variant'
          or woo_id::text=item->>'variant'
        )
        and enabled=true
      for share;

      if not found then
        raise exception 'VARIANT_UNAVAILABLE';
      end if;

      select sum((x->>'quantity')::integer)
      into grouped
      from jsonb_array_elements(p_items) x
      where x->>'slug'=p.slug
        and (
          x->>'variant'=v.id::text
          or x->>'variant'=v.woo_id::text
        );

      if v.stock_status is distinct from 'instock'
        or (
          v.stock_quantity is not null
          and grouped>v.stock_quantity
        )
      then
        raise exception 'STOCK_CHANGED';
      end if;

      regular := v.regular_price;
      sale := v.sale_price;
      starts := v.sale_starts_at;
      ends := v.sale_ends_at;

      select string_agg(
        a.key||' '||a.value,
        ' / ' order by a.key
      )
      into label
      from jsonb_each_text(coalesce(v.attributes,'{}')) a
      where a.value<>'';

      label := coalesce(label,v.name);
    else
      if coalesce(item->>'variant','')<>''
        or p.stock_status is distinct from 'instock'
      then
        raise exception 'PRODUCT_UNAVAILABLE';
      end if;

      regular := p.regular_price;
      sale := p.sale_price;
      starts := p.sale_starts_at;
      ends := p.sale_ends_at;
    end if;

    if regular is null
      or regular<0
      or regular::text in ('NaN','Infinity','-Infinity')
    then
      raise exception 'PRICE_UNAVAILABLE';
    end if;

    price := public.serenity_target_effective_price(
      p.id, v.id, regular, sale, starts, ends
    );

    if nullif(current_setting('serenity.wholesale_user', true), '') is not null then
      price := public.serenity_wholesale_unit_price(regular, price);
    end if;

    fee := 0;

    if coalesce(item->>'color','')<>'' then
      if item->>'color' not in (
        '12','15','18','20','22','25','28','30','33',
        '36','40','42','48','55','61','64','70','72',
        '75','80','85','90','92','95','103','105'
      )
      or not exists (
        select 1
        from unnest(p.tags) tag
        where lower(
          btrim(
            translate(
              tag,
              'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ',
              'aaaaeeioooucAAAAEEIOOOUC'
            )
          )
        ) in (
          'anodizavel',
          'anodizaveis',
          'permite anodizacao',
          'aceita anodizacao'
        )
      )
      then
        raise exception 'INVALID_ANODIZATION';
      end if;

      fee := 15;
    end if;

    price := round(price,2);
    total := total+(price+fee)*q;

    rows := rows||jsonb_build_array(
      jsonb_build_object(
        'product_id',p.id,
        'variant_id',v.id,
        'slug',p.slug,
        'name',p.name,
        'variation',label,
        'quantity',q,
        'unit_price',price,
        'color',coalesce(item->>'color',''),
        'fee',fee,
        'line_total',(price+fee)*q
      )
    );
  end loop;

  perform public.serenity_stock_assert(nullif(current_setting('serenity.stock_quote_order',true),'')::uuid,rows); -- Serenity stock availability v1
  return jsonb_build_object(
    'items',rows,
    'total',total,
    'total_cents',(total*100)::bigint
  );
end
$function$
