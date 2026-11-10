CREATE OR REPLACE FUNCTION public.serenity_admin_create_order(p_id uuid, p_admin uuid, p_customer uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  customer public.serenity_customers%rowtype;
  product public.products%rowtype;
  variation public.product_variants%rowtype;
  existing public.serenity_orders%rowtype;
  item jsonb;
  entries jsonb := '[]'::jsonb;
  qty integer;
  unit numeric;
  fee numeric;
  unit_cost numeric;
  supplier text;
  color text;
  color_name text;
  subtotal numeric := 0;
  costs numeric := 0;
  missing integer := 0;
  discount numeric;
  shipping numeric;
  expenses numeric;
  status text;
begin
  perform pg_advisory_xact_lock(7391542026); -- Serenity stock mutex v1

  if p_id is null or p_admin is null then
    raise exception 'INVALID_ORDER';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));

  select *
  into existing
  from public.serenity_orders
  where id = p_id;

  if found then
    if existing.created_by is distinct from p_admin then
      raise exception 'INVALID_ORDER';
    end if;

    return existing.id;
  end if;

  select *
  into customer
  from public.serenity_customers
  where id = p_customer
  for share;

  if not found then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  if jsonb_typeof(p_payload->'items') is distinct from 'array' then
    raise exception 'INVALID_ITEMS';
  end if;

  if jsonb_array_length(p_payload->'items') not between 1 and 50 then
    raise exception 'INVALID_ITEMS';
  end if;

  status := p_payload->>'status';
  discount := (p_payload->>'discount')::numeric;
  shipping := (p_payload->>'shipping')::numeric;
  expenses := (p_payload->>'expenses')::numeric;

  if status is null
    or status not in ('pending','paid')
    or discount is null
    or shipping is null
    or expenses is null
    or discount::text in ('NaN','Infinity','-Infinity')
    or shipping::text in ('NaN','Infinity','-Infinity')
    or expenses::text in ('NaN','Infinity','-Infinity')
    or least(discount,shipping,expenses) < 0
    or greatest(discount,shipping,expenses) > 9999999.99
    or discount <> round(discount,2)
    or shipping <> round(shipping,2)
    or expenses <> round(expenses,2)
    or length(coalesce(p_payload->>'notes','')) > 2000
  then
    raise exception 'INVALID_TOTALS';
  end if;

  for item in
    select value from jsonb_array_elements(p_payload->'items')
  loop
    select *
    into product
    from public.products
    where id::text = item->>'product_id'
    for share;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND';
    end if;

    variation := null;

    if coalesce(item->>'variant_id','') <> '' then
      select *
      into variation
      from public.product_variants
      where id::text = item->>'variant_id'
        and product_id = product.id
      for share;

      if not found then
        raise exception 'INVALID_VARIANT_OWNER';
      end if;
    elsif product.product_type = 'variable' then
      raise exception 'VARIANT_REQUIRED';
    end if;

    if coalesce(item->>'quantity','') !~ '^[1-9][0-9]{0,3}$' then
      raise exception 'INVALID_QUANTITY';
    end if;

    qty := (item->>'quantity')::integer;
    unit := (item->>'unit_price')::numeric;

    if unit is null
      or unit::text in ('NaN','Infinity','-Infinity')
      or unit < 0
      or unit > 9999999.99
      or unit <> round(unit,2)
    then
      raise exception 'INVALID_PRICE';
    end if;

    color := coalesce(item->>'color','');
    fee := 0;
    color_name := null;

    if color <> '' then
      if not exists (
        select 1
        from unnest(product.tags) tag
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
      ) then
        raise exception 'INVALID_ANODIZATION';
      end if;

      select x.label
      into color_name
      from jsonb_to_recordset(
        '[
          {"code":"12","label":"Bronze Claro"},
          {"code":"15","label":"Bronze Escuro"},
          {"code":"18","label":"Berinjela"},
          {"code":"20","label":"Roxo Escuro"},
          {"code":"22","label":"Roxo"},
          {"code":"25","label":"Azul Escuro"},
          {"code":"28","label":"Azul"},
          {"code":"30","label":"Azul Médio"},
          {"code":"33","label":"Azul Céu"},
          {"code":"36","label":"Azul Claro"},
          {"code":"40","label":"Azul Gelo"},
          {"code":"42","label":"Azul Prateado"},
          {"code":"48","label":"Amarelo Pálido"},
          {"code":"55","label":"Amarelo Claro"},
          {"code":"61","label":"Amarelo"},
          {"code":"64","label":"Dourado"},
          {"code":"70","label":"Rose Gold"},
          {"code":"72","label":"Rosa Claro"},
          {"code":"75","label":"Rosa"},
          {"code":"80","label":"Fúcsia"},
          {"code":"85","label":"Fúcsia Escuro"},
          {"code":"90","label":"Roxo Vibrante"},
          {"code":"92","label":"Roxo Azulado"},
          {"code":"95","label":"Roxo Petróleo"},
          {"code":"103","label":"Verde Azulado"},
          {"code":"105","label":"Verde"}
        ]'
      ) as x(code text,label text)
      where x.code = color;

      if color_name is null then
        raise exception 'INVALID_ANODIZATION';
      end if;

      fee := 15;
    end if;

    unit_cost := null;
    supplier := null;

    select c.unit_cost, c.supplier_name
    into unit_cost, supplier
    from public.serenity_product_commercial c
    where c.entity_key in (
      'product:' || product.id::text,
      'variant:' || variation.id::text
    )
    order by
      (c.variant_id is not null and c.unit_cost is not null) desc,
      (c.unit_cost is not null) desc,
      (c.variant_id is not null) desc
    limit 1;

    if unit_cost is null then
      missing := missing + qty;
    else
      costs := costs + unit_cost * qty;
    end if;

    subtotal := subtotal + (unit + fee) * qty;

    entries := entries || jsonb_build_array(
      jsonb_build_object(
        'product_id',product.id,
        'variant_id',variation.id,
        'name',product.name,
        'variation',variation.name,
        'sku',coalesce(variation.sku,product.sku),
        'quantity',qty,
        'base_price',unit,
        'anodization',color_name,
        'voltage',nullif(color,''),
        'anodization_fee',fee,
        'unit_price',unit+fee,
        'unit_cost',unit_cost,
        'supplier',supplier
      )
    );
  end loop;

  if discount > subtotal then
    raise exception 'INVALID_DISCOUNT';
  end if;

  insert into public.serenity_orders (
    id,customer_id,customer_snapshot,items,
    subtotal,discount,shipping,expenses,total,
    cost,missing_costs,status,notes,created_by,paid_at
  )
  values (
    p_id,
    customer.id,
    jsonb_build_object(
      'name',customer.name,
      'email',customer.email,
      'phone',customer.phone
    ),
    entries,
    subtotal,
    discount,
    shipping,
    expenses,
    subtotal-discount+shipping,
    case when missing = 0 then costs end,
    missing,
    status,
    coalesce(p_payload->>'notes',''),
    p_admin,
    case when status = 'paid' then now() end
  );

  return p_id;
end
$function$;