import { isIndividualSale, individualVariations, unitTitle } from './individual-sale'
import { readFetch } from '@/lib/read-fetch'
import { rewriteStemDescription, labretCopy, coatedGoldCopy } from '@/lib/stem-description'
import { getCommercePolicy } from '@/lib/commerce-server'
import { DEFAULT_COMMERCE_POLICY,isTopProduct,existingVariantStem,isMicrodermalProduct } from '@/lib/commerce'
import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { plainText } from './data'
import { readWholesaleAccess } from '@/lib/wholesale-server'
import type { WholesaleRules } from '@/lib/wholesale-server'
import type {
  Category,
  Product,
  ImportedVariation,
} from './data'

interface Row {
  commerce_preparation_options?: boolean
  commerce_sterilization_all_products?: boolean
  commerce_sterilization_fee?: number
  commerce_stem_fee?: number
  commerce_anodization_fee?: number
  commerce_included_stems?: boolean
  database_id: string
  id: string
  woo_id: number | null
  slug: string
  name: string
  product_type: string
  visibility: string
  sku: string | null
  short_description: string
  description?: string
  material: string
  categories: string[]
  category_slugs: string[]
  tags: string[]
  featured: boolean
  price: number | null
  original_price: number | null
  price_available: boolean
  in_stock: boolean
  stock_quantity: number | null
  storage_path: string | null
  thumbnail_path: string | null
  original_path: string | null
  search_text: string
  seo_title?: string | null
  seo_description?: string | null
  related_woo_ids?: number[]
}

interface Media {
  id: string
  variant_id: string | null
  media_type: string
  storage_path: string | null
  source_url: string | null
  youtube_id: string | null
  position: number
}

interface VariantRow {
  id: string
  woo_id: number | null
  name: string
  sku: string | null
  attributes: Record<string, string>
  regular_price: number | null
  sale_price: number | null
  sale_starts_at: string | null
  sale_ends_at: string | null
  stock_status: string
  stock_quantity: number | null
}

interface ParentStock {
  stock_quantity: number | null
  stock_status: string
  sold_individually: boolean
}

export interface StoreCategory extends Category {
  materials: string[]
}

export interface StorePage {
  products: Product[]
  total: number
  page: number
  totalPages: number
}

interface Options {
  productIds?: string[]
  category?: string
  search?: string
  material?: string
  sort?: string
  page?: number
  perPage?: number
  featured?: boolean
}

const CATEGORY_GROUPS: Record<string, { name: string; slugs: string[] }> = {
  'correntes-e-pingentes': { name: 'Correntes e pingentes', slugs: ['correntes', 'pingentes', 'pingente'] },
  'topos-e-correntes': { name: 'Topos', slugs: ['topo', 'correntes'] },
}

const RULES: Record<string, {
  name: string
  words: string[]
  exclude?: string[]
}> = {
  'piercings-de-titanio': {
    name: 'Piercings de Titânio',
    words: ['titanio'],
  },
  'piercings-de-ouro-18k': {
    name: 'Piercings de Ouro 18k',
    words: ['ouro'],
    exclude: ['titanio', 'revestid', 'banhad'],
  },
  argolas: {
    name: 'Argolas',
    words: ['argola'],
  },
  'labrets-studs': {
    name: 'Labrets & Studs',
    words: ['labret', 'stud'],
  },
  'piercings-de-umbigo': {
    name: 'Piercings de Umbigo',
    words: ['umbigo'],
  },
  brincos: {
    name: 'Brincos',
    words: ['brinco'],
  },
}

const LIST_FIELDS = [
  'database_id',
  'id',
  'woo_id',
  'slug',
  'name',
  'product_type',
  'visibility',
  'sku',
  'short_description',
  'material',
  'categories',
  'category_slugs',
  'tags',
  'featured',
  'price',
  'original_price',
  'price_available',
  'in_stock',
  'stock_quantity',
  'storage_path',
  'thumbnail_path',
].join(',')

function config(privatePrices = false) {
  const url = process.env.SUPABASE_URL
    ?.trim()
    .replace(/\/$/, '')

  const key = privatePrices
    ? process.env.SUPABASE_SECRET_KEY?.trim()
    : process.env.SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!url || !key) {
    throw new Error(
      'A conexão do catálogo não está configurada.'
    )
  }

  return { url, key }
}

export function storageUrl(
  path?: string | null
): string {
  if (!path) return ''

  return (
    `${config().url}/storage/v1/object/public/produtos/` +
    path.split('/').map(encodeURIComponent).join('/')
  )
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function slugify(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function read<T>(
  table: string,
  parameters: Record<string, string> | URLSearchParams,
  countExact = false,
  pricing?: WholesaleRules | null
): Promise<{ rows: T[]; total: number }> {
  const privatePrices = Boolean(pricing?.active) && (
    table === 'store_catalog' ||
    table === 'serenity_store_variants'
  )

  const { url, key } = config(privatePrices)
  const query = new URLSearchParams(parameters)

  if (privatePrices) {
    table = table === 'store_catalog'
      ? 'serenity_wholesale_catalog'
      : 'serenity_wholesale_variants'

    const fields = query.get('select')

    if (fields && fields !== '*') {
      query.set(
        'select',
        fields +
          ',wholesale_settings_version,wholesale_enabled'
      )
    }
  }

  const commerce = ['store_catalog','serenity_wholesale_catalog','serenity_store_variants','serenity_wholesale_variants'].includes(table) && /price|^\*$/.test(query.get('select') || '*') ? await getCommercePolicy() : DEFAULT_COMMERCE_POLICY
  const headers: Record<string, string> = {
    apikey: key,
    'X-Lunarity-Commerce': String(commerce.version),
  }

  if (countExact) {
    headers.Prefer = 'count=exact'
  }

  if (privatePrices && key.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${key}`
  }

  const response = await readFetch(
    `${url}/rest/v1/${table}?${query}`,
    {
      headers,
      ...(privatePrices
        ? { cache: 'no-store' as const }
        : {
            next: {
              revalidate: 60,
              tags: ['catalog'],
            },
          }),
    }, fetch
  )

  if (!response.ok) {
    let databaseCode = 'UNKNOWN'
    try {
      const failure: unknown = await response.json()
      const code = failure && typeof failure === 'object' && 'code' in failure ? String(failure.code) : ''
      // SQLSTATE/PostgREST codes are sufficient for diagnosis; no rows, URLs,
      // response details or credentials are written to logs.
      if (/^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(code)) databaseCode = code
    } catch { /* Upstream failures may return HTML rather than JSON. */ }
    console.error(
      'Falha no catálogo:',
      table,
      response.status,
      'código', databaseCode
    )

    throw new Error(
      'Não foi possível consultar o catálogo.'
    )
  }

  const rows: T[] = await response.json()

  if (!Array.isArray(rows)) {
    throw new Error(
      'Resposta inesperada do catálogo.'
    )
  }

  if (table === 'store_catalog' || table === 'serenity_wholesale_catalog') {
    for (const row of rows as unknown as Row[]) { row.commerce_preparation_options=commerce.preparation_options;row.commerce_sterilization_all_products=commerce.sterilization_all_products;row.commerce_sterilization_fee=commerce.sterilization_fee;row.commerce_stem_fee=commerce.stem_fee;row.commerce_anodization_fee=commerce.anodization_fee;row.commerce_included_stems=commerce.included_stems }
  }
  if (privatePrices) {
    const checked = rows as unknown as {
      wholesale_settings_version?: unknown
      wholesale_enabled?: unknown
    }[]

    if (
      checked.some(row =>
        Number(row.wholesale_settings_version) !==
          pricing?.settings_version ||
        row.wholesale_enabled !== true
      )
    ) {
      throw new Error(
        'As regras do atacado mudaram. Atualize a página.'
      )
    }
  }

  const range = response.headers.get('content-range')
  const count = range
    ? Number(range.split('/')[1])
    : NaN

  return {
    rows,
    total: Number.isFinite(count)
      ? count
      : rows.length,
  }
}

async function readAll<T>(
  table: string,
  select: string,
  filters: Record<string, string> = {},
  order = 'id.asc',
  pricing?: WholesaleRules | null
): Promise<T[]> {
  const result: T[] = []

  for (let offset = 0; ; offset += 500) {
    const page = await read<T>(
      table,
      {
        select,
        ...filters,
        order,
        limit: '500',
        offset: String(offset),
      },
      false,
      pricing
    )

    result.push(...page.rows)

    if (page.rows.length < 500) {
      return result
    }
  }
}

const metadata = unstable_cache(
  async (): Promise<Row[]> => {
    return readAll<Row>(
      'store_catalog',
      [
        'database_id',
        'id',
        'name',
        'material',
        'categories',
        'category_slugs',
        'featured',
        'visibility',
        'storage_path',
        'thumbnail_path',
        'search_text',
      ].join(','),
      {
        visibility: 'in.(visible,catalog)',
      },
      'woo_id.desc.nullslast,database_id.asc'
    )
  },
  ['serenity-category-metadata-v2'],
  {
    revalidate: 60,
    tags: ['catalog'],
  }
)

function matches(
  row: Row,
  slug: string,
  real: boolean
): boolean {
  if (slug === 'todos' || slug === 'novidades') {
    return true
  }

  if (slug === 'destaques') {
    return row.featured
  }

  const group = CATEGORY_GROUPS[slug]
  if (group) return group.slugs.some(category => row.category_slugs.includes(category))

  if (real) {
    return row.category_slugs.includes(slug)
  }

  const rule = RULES[slug]

  if (!rule) return false

  return (
    rule.words.some(word =>
      row.search_text.includes(word)
    ) &&
    !(rule.exclude || []).some(word =>
      row.search_text.includes(word)
    )
  )
}

function categoriesFrom(rows: Row[]): Category[] {
  const groups = new Map<string, {
    name: string
    ids: Set<string>
    image: string
  }>()

  rows.forEach(row => {
    row.categories.forEach(name => {
      const slug = slugify(name)

      if (!slug) return

      const group = groups.get(slug) || {
        name,
        ids: new Set<string>(),
        image: '',
      }

      group.ids.add(row.id)

      if (!group.image) {
        group.image = storageUrl(
          row.thumbnail_path || row.storage_path
        )
      }

      groups.set(slug, group)
    })
  })

  return Array.from(groups.entries())
    .map(([slug, group]) => ({
      id: slug,
      slug,
      name: labretCopy(group.name),
      description: '',
      image: group.image,
      count: group.ids.size,
    }))
    .sort((a, b) =>
      b.count - a.count ||
      a.name.localeCompare(b.name, 'pt-BR')
    )
}

export async function getStoreCategories():
  Promise<Category[]> {
  return categoriesFrom(await metadata())
}

export async function getStoreCategory(
  slug: string
): Promise<StoreCategory | null> {
  const rows = await metadata()

  const real = categoriesFrom(rows).find(
    item => item.slug === slug
  )

  const special: Record<string, string> = {
    todos: 'Todas as joias',
    novidades: 'Novidades',
    destaques: 'Destaques',
  }

  const name =
    CATEGORY_GROUPS[slug]?.name ||
    real?.name ||
    special[slug] ||
    RULES[slug]?.name

  if (!name) return null

  const scoped = rows.filter(row =>
    matches(row, slug, Boolean(real))
  )

  const imageRow = scoped.find(row =>
    row.thumbnail_path || row.storage_path
  )

  return {
    id: slug,
    slug,
    name: slug === 'topos-e-correntes' ? 'Topos' : slug === 'topo' ? 'Topo' : labretCopy(name),
    description: slug === 'novidades'
      ? 'Explore as últimas peças adicionadas ao catálogo.'
      : '',
    count: scoped.length,
    image: imageRow
      ? storageUrl(
          imageRow.thumbnail_path ||
          imageRow.storage_path
        )
      : '',
    materials: Array.from(
      new Set(
        scoped
          .map(row => row.material)
          .filter(Boolean)
      )
    ).sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    ),
  }
}

async function gridProducts(rows: Row[]): Promise<Product[]> {
  const products = rows.map(asProduct)
  if (!rows.length || rows.some(row => !/^[a-f0-9-]{36}$/i.test(row.database_id || ''))) return products
  try {
    const media = await read<Media & {product_id:string}>('product_media', {
      select: 'product_id,storage_path,position',
      product_id: `in.(${rows.map(row => row.database_id).join(',')})`,
      media_type: 'eq.image', order: 'position.asc,id.asc', limit:'500',
    })
    products.forEach((product,index) => {
      const row = rows[index]
      // The card uses a thumbnail, while media contains the full-size cover.
      // They are the same photo even though their URLs differ.
      const cover = new Set([storageUrl(row.storage_path), storageUrl(row.thumbnail_path)].filter(Boolean))
      const gallery = media.rows.filter(image => image.product_id === row.database_id)
        .map(image => storageUrl(image.storage_path)).filter(image => Boolean(image) && !cover.has(image))
      product.images = Array.from(new Set([...product.images, ...gallery])).slice(0,6)
    })
  } catch { /* Keep the cover photo when the gallery cannot be loaded. */ }
  return products
}

function asProduct(row: Row): Product {
  const coated=/titanio|titânio|titanium/i.test(row.material || '') && /revestid|banhad|folhead|pvd/i.test(row.material || '') && /ouro|gold|dourad/i.test(row.material || '')
  row={...row,name:coatedGoldCopy(row.name,coated),material:coatedGoldCopy(row.material || ''),description:coatedGoldCopy(row.description || '',coated),short_description:coatedGoldCopy(row.short_description || '',coated)}
  const variable = row.product_type === 'variable'

  const image = storageUrl(
    row.thumbnail_path || row.storage_path
  )

  return {
    id: row.id,
    individualSale: isIndividualSale(row),
    anodizationFee: row.commerce_anodization_fee ?? 15,
    preparationOptions: row.commerce_preparation_options === true,
    preparationAllProducts: row.commerce_sterilization_all_products === true,
    sterilizationFee: [5,10].includes(row.commerce_sterilization_fee || 0) ? row.commerce_sterilization_fee : 0,
    stemFee: row.commerce_stem_fee === 5 ? 5 : 0,
    includesStem: row.commerce_included_stems === true && isTopProduct(row) && !(row.commerce_preparation_options && isMicrodermalProduct(row)),
    slug: row.slug,
    name: labretCopy(isIndividualSale(row) ? unitTitle(row.name) : row.name), originalName: row.name,
    category: labretCopy(row.categories[0] || 'Joias'),
    categorySlug: slugify(
      row.categories[0] || 'todos'
    ),
    categorySlugs: row.category_slugs,
    price: Number(row.price ?? 0),
    originalPrice: row.original_price == null
      ? undefined
      : Number(row.original_price),
    priceAvailable: row.price_available,
    stock: row.stock_quantity,
    sku: row.sku || '',
    description: labretCopy(row.commerce_included_stems && isTopProduct(row) && !(row.commerce_preparation_options && isMicrodermalProduct(row)) ? rewriteStemDescription(plainText(row.short_description || ''),row.commerce_stem_fee || 0) : plainText(row.short_description || '')),
    longDescription: labretCopy(row.commerce_stem_fee && isTopProduct(row) && !isMicrodermalProduct(row) ? rewriteStemDescription(row.description || '',row.commerce_stem_fee) : row.description || ''),
    material: coatedGoldCopy(row.material || ''),
    images: image ? [image] : [],
    variants: variable
      ? [{
          type: 'variation',
          label: 'Variação',
          options: [],
        }]
      : [],
    variations: variable ? [] : undefined,
    inStock: row.in_stock,
    isBestSeller: false,
    isFeatured: row.featured,
    isNew: false,
    tags: row.tags,
    related: [],
  }
}

export async function getStorePage(
  options: Options = {}
): Promise<StorePage> {
  const { rules: pricing } = await readWholesaleAccess()

  const size = Math.min(
    24,
    Math.max(1, options.perPage || 12)
  )

  let page = Math.max(
    1,
    Math.floor(options.page || 1)
  )

  if (!Number.isFinite(page)) {
    page = 1
  }

  const query = new URLSearchParams({
    select: LIST_FIELDS,
    visibility: options.search
      ? 'in.(visible,search)'
      : 'in.(visible,catalog)',
    limit: String(size),
    offset: String((page - 1) * size),
  })

  if (options.productIds) {
    if (!options.productIds.length) return { products: [], total: 0, page: 1, totalPages: 0 }
    if (options.productIds.some(id => !/^[a-zA-Z0-9_-]{1,80}$/.test(id))) throw new Error('Seleção de produtos inválida.')
    query.set('id', `in.(${options.productIds.join(',')})`)
  }

  const orders: Record<string, string> = {
    default:
      'created_at.desc,woo_id.desc.nullslast,database_id.asc',
    'price-asc':
      'price.asc.nullslast,name.asc,database_id.asc',
    'price-desc':
      'price.desc.nullslast,name.asc,database_id.asc',
    'name-asc':
      'name.asc,database_id.asc',
  }

  query.set(
    'order',
    orders[options.sort || 'default'] ||
    orders.default
  )

  if (
    options.featured ||
    options.category === 'destaques'
  ) {
    query.set('featured', 'eq.true')
  }

  const slug = options.category

  if (
    slug &&
    !['todos', 'novidades', 'destaques'].includes(slug)
  ) {
    const rows = await metadata()

    const real = rows.some(row =>
      row.category_slugs.includes(slug)
    )

    const group = CATEGORY_GROUPS[slug]

    if (group) {
      query.set('category_slugs', `ov.{${group.slugs.join(',')}}`)
    } else if (real) {
      if (!/^[a-z0-9-]+$/.test(slug)) {
        throw new Error('Categoria inválida.')
      }

      query.set(
        'category_slugs',
        `cs.{${slug}}`
      )
    } else {
      const rule = RULES[slug]

      if (!rule) {
        return {
          products: [],
          total: 0,
          page: 1,
          totalPages: 0,
        }
      }

      if (rule.words.length === 1) {
        query.append(
          'search_text',
          `like.*${rule.words[0]}*`
        )
      } else {
        query.set(
          'or',
          `(${
            rule.words
              .map(word =>
                `search_text.like.*${word}*`
              )
              .join(',')
          })`
        )
      }

      ;(rule.exclude || []).forEach(word => {
        query.append(
          'search_text',
          `not.like.*${word}*`
        )
      })
    }
  }

  if (
    options.material &&
    options.material !== 'all'
  ) {
    const selected=options.material
    const coated=/tit[aâ]nio|titanium/i.test(selected) && /revestid|banhad|folhead|pvd/i.test(selected) && /ouro|gold/i.test(selected)
    if(coated){
      const current=coatedGoldCopy(selected)
      const previous=current.replace(/(ouro\s*)24\s*k/gi,(_,gold:string)=>gold+'18K')
      const aliases=Array.from(new Set([selected,current,previous,previous.replace(/18K/g,'18k')]))
      query.set('material',`in.(${aliases.map(value=>'"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"').join(',')})`)
    }else query.set('material',`eq.${selected}`)
  }

  const words = normalize(options.search || '')
    .replace(/[,*%_\\()"']/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)

  words.forEach(word => {
    if (/^(?:labrets?|topos?)$/.test(word)) {
      query.append('or', '(search_text.like.*labret*,search_text.like.*topo*)')
      return
    }
    query.append(
      'search_text',
      `like.*${word}*`
    )
  })

  let result = await read<Row>(
    'store_catalog',
    query,
    true,
    pricing
  )

  const totalPages = Math.ceil(
    result.total / size
  )

  if (totalPages > 0 && page > totalPages) {
    page = totalPages

    query.set(
      'offset',
      String((page - 1) * size)
    )

    result = await read<Row>(
      'store_catalog',
      query,
      true,
      pricing
    )
  }

  return {
    products: await gridProducts(result.rows),
    total: result.total,
    page: result.total === 0 ? 1 : page,
    totalPages,
  }
}

function variantPrice(row: VariantRow) {
  const regular = row.regular_price === null
    ? null
    : Number(row.regular_price)

  const sale = row.sale_price === null
    ? null
    : Number(row.sale_price)

  const now = Date.now()

  const active =
    regular !== null &&
    sale !== null &&
    sale >= 0 &&
    sale < regular &&
    (
      !row.sale_starts_at ||
      Date.parse(row.sale_starts_at) <= now
    ) &&
    (
      !row.sale_ends_at ||
      Date.parse(row.sale_ends_at) >= now
    )

  return {
    price: (active ? sale : regular) ?? 0,
    originalPrice: active
      ? regular!
      : undefined,
    priceAvailable: regular !== null,
  }
}

interface Asset {
  storage_path: string
}

let manifestPromise:
  Promise<Record<string, Asset>> | null = null

let manifestExpires = 0

async function imageManifest():
  Promise<Record<string, Asset>> {
  if (
    manifestPromise &&
    Date.now() < manifestExpires
  ) {
    return manifestPromise
  }

  manifestExpires = Date.now() + 300000

  manifestPromise = fetch(
    storageUrl('migracao-v1/manifesto.json'),
    {
      next: {
        revalidate: 300,
        tags: ['catalog'],
      },
    }
  )
    .then(async response => {
      if (!response.ok) {
        throw new Error(
          'Manifesto de imagens indisponível.'
        )
      }

      const data = await response.json()

      return (
        data.images || {}
      ) as Record<string, Asset>
    })
    .catch(error => {
      manifestPromise = null
      throw error
    })

  return manifestPromise
}

async function descriptionPhotos(
  description: string
): Promise<string[]> {
  const tags =
    description.match(/<img\b[^>]*>/gi) || []

  if (!tags.length) {
    return []
  }

  const manifest = await imageManifest()
  const photos: string[] = []

  tags.forEach(tag => {
    for (const field of [
      'data-src',
      'data-lazy-src',
      'src',
    ]) {
      const pattern = new RegExp(
        `\\b${field}\\s*=\\s*["']([^"']+)["']`,
        'i'
      )

      const match = tag.match(pattern)

      if (!match) continue

      try {
        const url = new URL(
          plainText(match[1]),
          'https://serenitypiercings.com.br/'
        )

        url.hash = ''

        const asset = manifest[url.toString()]

        if (asset) {
          photos.push(
            storageUrl(asset.storage_path)
          )
          break
        }
      } catch {
        // Referências inválidas são ignoradas.
      }
    }
  })

  return Array.from(new Set(photos))
}

async function relatedProducts(
  row: Row,
  pricing?: WholesaleRules | null
): Promise<Product[]> {
  const query = new URLSearchParams({
    select: LIST_FIELDS,
    visibility: 'in.(visible,catalog)',
    database_id: `neq.${row.database_id}`,
    order:
      'created_at.desc,woo_id.desc.nullslast,database_id.asc',
    limit: '4',
  })

  const primarySlug = slugify(
    row.categories[0] || ''
  )

  const categorySlug =
    row.category_slugs.includes(primarySlug)
      ? primarySlug
      : row.category_slugs[0]

  if (
    categorySlug &&
    /^[a-z0-9-]+$/.test(categorySlug)
  ) {
    query.set(
      'category_slugs',
      `cs.{${categorySlug}}`
    )
  }

  const result = await read<Row>(
    'store_catalog',
    query,
    false,
    pricing
  )

  return gridProducts(result.rows)
}

export const getStoreProduct = cache(
  async (slug: string) => {
    if (!/^[a-zA-Z0-9_-]{1,180}$/.test(slug)) {
      return null
    }

    const { rules: pricing } = await readWholesaleAccess()

    const base = await read<Row>(
      'store_catalog',
      {
        select: '*',
        slug: `eq.${slug}`,
        limit: '1',
      },
      false,
      pricing
    )

    const row = base.rows[0]

    if (!row) {
      return null
    }

    const [
      media,
      variants,
      parentResult,
      related,
      descriptionImages,
    ] = await Promise.all([
      readAll<Media>(
        'product_media',
        [
          'id',
          'variant_id',
          'media_type',
          'storage_path',
          'source_url',
          'youtube_id',
          'position',
        ].join(','),
        {
          product_id:
            `eq.${row.database_id}`,
        },
        'position.asc,id.asc'
      ),

      row.product_type === 'variable'
        ? readAll<VariantRow>(
            'serenity_store_variants',
            [
              'id',
              'woo_id',
              'name',
              'sku',
              'attributes',
              'regular_price',
              'sale_price',
              'sale_starts_at',
              'sale_ends_at',
              'stock_status',
              'stock_quantity',
            ].join(','),
            {
              product_id:
                `eq.${row.database_id}`,
              enabled: 'eq.true',
            },
            'position.asc,id.asc',
            pricing
          )
        : Promise.resolve<VariantRow[]>([]),

      read<ParentStock>('products', {
        select:
          'stock_quantity,stock_status,sold_individually',
        id: `eq.${row.database_id}`,
        limit: '1',
      }),

      relatedProducts(row, pricing),

      descriptionPhotos(
        row.description || ''
      ),
    ])

    const product = asProduct(row)
    const parent = parentResult.rows[0]

    const photos = media.filter(
      item => item.media_type === 'image'
    )

    const parentPhotos = photos.filter(
      item => item.variant_id === null
    )

    const gallery = Array.from(
      new Set(
        (
          parentPhotos.length
            ? parentPhotos
            : photos
        )
          .map(item =>
            storageUrl(item.storage_path)
          )
          .filter(Boolean)
      )
    )

    if (gallery.length) {
      product.images = gallery
    }

    if (row.product_type === 'variable') {
      const combinations: ImportedVariation[] =
        variants.map(variant => {
          const prices = variantPrice(variant)

          let stock = variant.stock_quantity

          if (
            parent?.stock_quantity !== null &&
            parent?.stock_quantity !== undefined
          ) {
            stock = stock === null
              ? parent.stock_quantity
              : Math.min(
                  stock,
                  parent.stock_quantity
                )
          }

          if (parent?.sold_individually) {
            stock = stock === null
              ? 1
              : Math.min(stock, 1)
          }

          const label = Object.entries(
            variant.attributes || {}
          )
            .filter(([, value]) =>
              Boolean(value)
            )
            .map(([name, value]) =>
              `${name} ${value}`
            )
            .join(' / ')

          const photo = photos.find(
            item =>
              item.variant_id === variant.id
          )

          return {
            id: variant.woo_id === null
              ? variant.id
              : String(variant.woo_id),
            name: label || variant.name,
            attributes: variant.attributes || {},
            sku: variant.sku || '',
            ...(product.includesStem?{stemLength:existingVariantStem(variant.attributes)}:{}),
            ...prices,
            stock,
            inStock:
              variant.stock_status === 'instock' &&
              parent?.stock_status !== 'outofstock' &&
              (stock === null || stock > 0) &&
              prices.priceAvailable,
            image: photo
              ? storageUrl(photo.storage_path)
              : undefined,
          }
        })

      const offered = product.individualSale ? individualVariations(combinations) : combinations
      product.variations = offered

      product.variants = [{
        type: 'variation',
        label: 'Variação',
        options: offered.map(variation => ({
          id: variation.id,
          name: variation.name,
          value: variation.id,
          inStock: variation.inStock,
        })),
      }]

      product.inStock = offered.some(
        item => item.inStock
      )
    } else if (parent?.sold_individually) {
      product.stock =
        product.stock === null ||
        product.stock === undefined
          ? 1
          : Math.min(product.stock, 1)
    }

    product.youtubeShortId = (
      media.find(item =>
        item.media_type === 'youtube' &&
        item.variant_id === null
      ) ||
      media.find(item =>
        item.media_type === 'youtube'
      )
    )?.youtube_id || undefined

    return {
      product,
      related,
      descriptionImages,
      seoTitle:
        row.seo_title &&
        !row.seo_title.includes('%')
          ? labretCopy(coatedGoldCopy(row.seo_title,(/revestid|banhad|folhead|pvd/i.test(row.material || '') && /ouro|gold|dourad/i.test(row.material || ''))))
          : product.name,
      seoDescription: coatedGoldCopy(labretCopy(product.includesStem ? rewriteStemDescription(plainText(row.seo_description || product.description || product.longDescription),product.stemFee || 0) : plainText(row.seo_description || product.description || product.longDescription)),(/revestid|banhad|folhead|pvd/i.test(row.material || '') && /ouro|gold|dourad/i.test(row.material || ''))).slice(0,180),
    }
  }
)

// Only public classification metadata is shared. Prices still follow the current customer's access.
export const getStoneCatalogMetadata = unstable_cache(async () => {
  const [products, variants] = await Promise.all([
    metadata(),
    readAll<{ product_id: string; attributes: Record<string, string> }>(
      'serenity_store_variants', 'id,product_id,attributes', { enabled: 'eq.true' }, 'id.asc'
    ),
  ])
  return { products, variants }
}, ['serenity-stone-catalog-metadata-v1'], { revalidate: 60, tags: ['catalog'] })

export async function getProjectSuggestionPage(parameters: URLSearchParams, requestedPage: number) {
  const { rules: pricing } = await readWholesaleAccess()
  const query = new URLSearchParams(parameters)
  query.set('limit', '0')
  query.set('offset', '0')
  const count = await read<Row>('store_catalog', query, true, pricing)
  const totalPages = Math.ceil(count.total / 12)
  const page = totalPages ? Math.min(requestedPage, totalPages) : 1
  if (!count.total) return { products: [], total: 0, totalPages: 0, page: 1 }
  query.set('limit', '12')
  query.set('offset', String((page - 1) * 12))
  const result = await read<Row>('store_catalog', query, false, pricing)
  return { page, total: count.total, totalPages, products: result.rows.map(row => ({
    id: row.id, slug: row.slug, name: labretCopy(row.name), originalName: row.name, price: Number(row.price ?? 0),
    variable: row.product_type === 'variable', image: storageUrl(row.thumbnail_path || row.storage_path),
  })) }
}

// Fetch large feed datasets with bounded parallel pages instead of a serial waterfall.
// Exact count comes from the same public view/filters; incomplete reads fail closed.
async function readMerchantAll<T>(table: string, select: string, filters: Record<string,string> = {}, order = 'id.asc'): Promise<T[]> {
  const parameters = { select, ...filters, order, limit:'500', offset:'0' }
  const first = await read<T>(table, parameters, true)
  const total = first.total
  if (!Number.isSafeInteger(total) || total < 0 || total > 100000) throw new Error('MERCHANT_CATALOG_SIZE')
  const rows = first.rows.slice()
  for (let offset = 500; offset < total; offset += 2000) {
    const offsets = [offset, offset+500, offset+1000, offset+1500].filter(value => value < total)
    const pages = await Promise.all(offsets.map(value => read<T>(table, {...parameters, offset:String(value)})))
    for (const page of pages) rows.push(...page.rows)
  }
  if (rows.length !== total) throw new Error('MERCHANT_INCOMPLETE_CATALOG')
  return rows
}

// Anonymous retail snapshot only: never consult customer cookies or wholesale views.
export async function getMerchantCatalog(): Promise<Product[]> {
  const [rows, variants, parents, media] = await Promise.all([
    readMerchantAll<Row>('store_catalog', LIST_FIELDS + ',description', { visibility: 'eq.visible' }, 'database_id.asc'),
    readMerchantAll<VariantRow & { product_id: string }>('serenity_store_variants', 'id,product_id,woo_id,name,sku,attributes,regular_price,sale_price,sale_starts_at,sale_ends_at,stock_status,stock_quantity', { enabled: 'eq.true' }),
    readMerchantAll<ParentStock & { id: string }>('products', 'id,stock_quantity,stock_status,sold_individually'),
    readMerchantAll<Media & { product_id: string }>('product_media', 'id,product_id,variant_id,media_type,storage_path,position', { media_type: 'eq.image' }, 'position.asc,id.asc'),
  ])
  const parentMap = new Map(parents.map(row => [row.id, row]))
  const variantMap = new Map<string, typeof variants>()
  const mediaMap = new Map<string, typeof media>()
  for (const variant of variants) variantMap.set(variant.product_id, [...(variantMap.get(variant.product_id) || []), variant])
  for (const photo of media) mediaMap.set(photo.product_id, [...(mediaMap.get(photo.product_id) || []), photo])
  return rows.map(row => {
    const product = asProduct(row)
    const parent = parentMap.get(row.database_id)
    const photos = mediaMap.get(row.database_id) || []
    const photo = photos.find(item => item.variant_id === null) || photos[0]
    if (photo?.storage_path) product.images = [storageUrl(photo.storage_path)]
    if (row.product_type === 'variable') {
      product.variations = (variantMap.get(row.database_id) || []).map(variant => {
        const prices = variantPrice(variant)
        let stock = variant.stock_quantity
        if (parent?.stock_quantity != null) stock = stock === null ? parent.stock_quantity : Math.min(stock, parent.stock_quantity)
        if (parent?.sold_individually) stock = stock === null ? 1 : Math.min(stock, 1)
        const image = photos.find(item => item.variant_id === variant.id)
        return {
          id: variant.woo_id === null ? variant.id : String(variant.woo_id),
          name: Object.entries(variant.attributes || {}).filter(([, value]) => Boolean(value)).map(([key, value]) => `${key} ${value}`).join(' / ') || variant.name,
          sku: variant.sku || '', ...prices, stock,
          inStock: variant.stock_status === 'instock' && parent?.stock_status !== 'outofstock' && (stock === null || stock > 0) && prices.priceAvailable,
          image: image?.storage_path ? storageUrl(image.storage_path) : undefined,
          attributes: variant.attributes,
        }
      })
      if(product.individualSale) product.variations = individualVariations(product.variations)
      product.inStock = product.variations.some(item => item.inStock)
    }
    return product
  })
}

// Resolve a verified legacy ID against the current public catalog, not a guessed slug.
export async function resolveLegacyProductLink(wooId: number, parameters: URLSearchParams): Promise<string | null> {
  const { matchLegacyVariant } = await import('./legacy-product-links')
  const base = await read<Row>('store_catalog', {select:'database_id,slug,product_type',woo_id:`eq.${wooId}`,limit:'1'})
  const row = base.rows[0]
  if (!row) return null
  const destination = new URL(`/produto/${encodeURIComponent(row.slug)}`, process.env.NEXT_PUBLIC_SITE_URL || 'https://reyna-three.vercel.app')
  if (Array.from(parameters.keys()).some(key => key.startsWith('attribute_'))) {
    if (row.product_type !== 'variable') return null
    const variants = await readAll<VariantRow>('serenity_store_variants', 'id,woo_id,attributes', {product_id:`eq.${row.database_id}`,enabled:'eq.true'})
    try {
      const match = matchLegacyVariant(variants,parameters)
      if (!match) return null
      destination.searchParams.set('variacao',match.id)
    } catch { return null }
  }
  return destination.toString()
}

export async function getStoreFilterProducts(category:string){
 const rows=await metadata()
 const real=rows.some(row=>row.category_slugs.includes(category))
 return rows.filter(row=>matches(row,category,real))
}
