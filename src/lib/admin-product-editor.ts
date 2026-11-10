export interface Commercial {
  supplier_name?: string | null
  unit_cost?: number | null
}

export interface EditableProduct {
  id: string
  name: string
  sku: string | null
  regular_price: number | null
  sale_price: number | null
  stock_quantity: number | null
  stock_status: string
  commercial?: Commercial
  enabled?: boolean
  [key: string]: unknown
}

export interface ProductBundle {
  product: EditableProduct
  commercial: Commercial
  variants: EditableProduct[]
  version: string
}

export interface SaveState {
  error: string
}

export function amount(input: string, label: string): number | null {
  const value = input.trim()
  if (!value) return null

  const brazilian = /^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(value)

  if (!brazilian && !/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error(`${label}: use valores como 150,00, sem R$ ou sinal negativo.`)
  }

  const normalized = brazilian
    ? value.replace(/\./g, '').replace(',', '.')
    : value

  const result = Math.round(Number(normalized) * 100) / 100

  if (!Number.isFinite(result) || result > 9999999.99) {
    throw new Error(`${label}: valor acima do limite.`)
  }

  return result
}

export function quantity(input: string): number | null {
  if (!input.trim()) return null

  if (!/^\d+$/.test(input.trim()) || Number(input) > 100000000) {
    throw new Error(
      'Estoque: informe um número inteiro entre 0 e 100.000.000, ou deixe vazio.'
    )
  }

  return Number(input)
}

const PRODUCT_FIELDS = [
  'name',
  'sku',
  'short_description',
  'description',
  'material',
  'categories',
  'tags',
  'status',
  'visibility',
  'featured',
  'sold_individually',
  'regular_price',
  'sale_price',
  'sale_starts_at',
  'sale_ends_at',
  'stock_status',
  'stock_quantity',
  'seo_title',
  'seo_description',
]

const VARIANT_FIELDS = [
  'id',
  'name',
  'sku',
  'attributes',
  'regular_price',
  'sale_price',
  'sale_starts_at',
  'sale_ends_at',
  'stock_status',
  'stock_quantity',
  'enabled',
]

export function buildPayload(bundle: ProductBundle, form: FormData) {
  function read(key: string, limit = 300): string {
    const input = form.get(key)

    if (typeof input !== 'string' || input.length > limit) {
      throw new Error(`Campo ausente ou muito longo: ${key}`)
    }

    return input.trim()
  }

  function edit(row: EditableProduct, prefix: string, fields: string[]) {
    const result: Record<string, unknown> = {}

    fields.forEach((field) => {
      result[field] = row[field] ?? null
    })

    result.name = read(`${prefix}name`)

    if (!result.name) {
      throw new Error('Preencha o nome do produto e de cada variação.')
    }

    result.sku = read(`${prefix}sku`, 180) || null

    result.regular_price = amount(
      read(`${prefix}regular_price`, 40),
      'Preço base'
    )

    result.sale_price = amount(
      read(`${prefix}sale_price`, 40),
      'Preço promocional'
    )

    const pricesChanged =
      result.regular_price !== row.regular_price ||
      result.sale_price !== row.sale_price

    if (
      pricesChanged &&
      result.sale_price !== null &&
      (
        result.regular_price === null ||
        Number(result.sale_price) >= Number(result.regular_price)
      )
    ) {
      throw new Error(
        'O preço promocional deve ser menor que o preço base. Deixe vazio para remover a promoção.'
      )
    }

    result.stock_quantity = quantity(
      read(`${prefix}stock_quantity`, 40)
    )

    result.stock_status = read(`${prefix}stock_status`, 30)

    if (
      !['instock', 'outofstock', 'onbackorder'].includes(
        String(result.stock_status)
      )
    ) {
      throw new Error('Situação de estoque inválida.')
    }

    return result
  }

  function commercial(prefix: string) {
    return {
      supplier_name: read(`${prefix}supplier_name`, 180) || null,
      unit_cost: amount(
        read(`${prefix}unit_cost`, 40),
        'Custo unitário'
      ),
    }
  }

  const product = edit(bundle.product, 'p.', PRODUCT_FIELDS)

  product.status = read('p.status', 30)

  if (!['published', 'draft'].includes(String(product.status))) {
    throw new Error('Situação de publicação inválida.')
  }

  product.short_description = read('p.short_description', 20000)
  product.description = read('p.description', 500000)
  product.seo_title = read('p.seo_title', 300) || null
  product.seo_description = read('p.seo_description', 2000) || null

  const variants = bundle.variants.map((row) => {
    const prefix = `v.${row.id}.`

    return {
      ...edit(row, prefix, VARIANT_FIELDS),
      enabled: form.get(`${prefix}enabled`) === 'on',
      commercial: commercial(prefix),
    }
  })

  return {
    product,
    commercial: commercial('p.'),
    variants,
  }
}
