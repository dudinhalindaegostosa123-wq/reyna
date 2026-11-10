import { getCommercePolicy } from '@/lib/commerce-server'
import 'server-only'

import { plainText } from './data'
import type { Product } from './data'
import {
  getStoreCategories,
  getStorePage,
  storageUrl,
} from './catalog-server'
import type { StorePage } from './catalog-server'
import { readWholesaleAccess } from './wholesale-server'

export const AREA_OPTIONS = [
  { value: 'all', label: 'Todas as regiões' },
  { value: 'orelha', label: 'Orelha' },
  { value: 'nariz', label: 'Nariz' },
  { value: 'boca', label: 'Boca' },
  { value: 'umbigo', label: 'Umbigo' },
  { value: 'sobrancelha', label: 'Sobrancelha' },
  { value: 'microdermal', label: 'Microdermal e surface' },
  { value: 'mamilo', label: 'Mamilo' },
  { value: 'intimos', label: 'Íntimos' },
]

export const JEWELRY_OPTIONS = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'argolas', label: 'Argolas' },
  { value: 'topo-labret-12', label: 'Labrets 1.2 mm' },
  {
    value: 'topo-rosca-16',
    label: 'Labrets 1.6 mm',
  },
  { value: 'push-pin', label: 'Labrets push pin' },
  { value: 'pedras-naturais', label: 'Pedras naturais' },
]

const AREA_SLUGS: Record<string, string[]> = {
  orelha: [
    'orelha',
    'conch',
    'concha',
    'daith',
    'flat',
    'helix',
    'forward-helix',
    'lobulo',
    'lobulos',
    'tragus',
    'transversal',
    'industrial',
    'rook',
    'snug',
    'anti-tragus',
    'antitragus',
    'anti-helix',
  ],
  nariz: [
    'nariz',
    'aba-nasal',
    'nasal',
    'septo',
    'septum',
    'bridge',
  ],
  boca: [
    'boca',
    'lingua',
    'boca-lingua',
    'boca-labio-superior',
    'boca-labio-inferior',
    'labio-superior',
    'labio-inferior',
  ],
  umbigo: ['umbigo', 'piercings-de-umbigo'],
  sobrancelha: ['sobrancelha'],
  microdermal: [
    'microdermal',
    'surface',
    'microdermal-e-surface',
  ],
  mamilo: ['mamilo', 'mamilos'],
  intimos: [
    'intimos',
    'genital-feminina',
    'genital-masculino',
    'genital-masculina',
    'genitais',
  ],
}

interface Subarea {
  value: string
  label: string
  slugs: string[]
}

const SUBAREAS: Record<string, Subarea[]> = {
  orelha: [
    {
      value: 'conch',
      label: 'Conch',
      slugs: ['conch', 'concha', 'orelha-conch'],
    },
    {
      value: 'daith',
      label: 'Daith',
      slugs: ['daith', 'orelha-daith'],
    },
    {
      value: 'flat',
      label: 'Flat',
      slugs: ['flat', 'orelha-flat'],
    },
    {
      value: 'helix',
      label: 'Hélix',
      slugs: ['helix', 'orelha-helix'],
    },
    {
      value: 'lobulo',
      label: 'Lóbulo',
      slugs: ['lobulo', 'lobulos', 'orelha-lobulo'],
    },
    {
      value: 'tragus',
      label: 'Tragus',
      slugs: ['tragus', 'orelha-tragus'],
    },
    {
      value: 'transversal',
      label: 'Transversal',
      slugs: [
        'transversal',
        'industrial',
        'orelha-transversal',
      ],
    },
  ],
  nariz: [
    {
      value: 'aba-nasal',
      label: 'Aba nasal',
      slugs: ['aba-nasal', 'nasal', 'nariz-aba-nasal'],
    },
    {
      value: 'septo',
      label: 'Septo',
      slugs: ['septo', 'septum', 'nariz-septo'],
    },
    {
      value: 'bridge',
      label: 'Bridge',
      slugs: ['bridge', 'nariz-bridge'],
    },
  ],
  boca: [
    {
      value: 'lingua',
      label: 'Língua',
      slugs: ['boca-lingua', 'lingua'],
    },
    {
      value: 'labio-superior',
      label: 'Lábio superior',
      slugs: ['boca-labio-superior', 'labio-superior'],
    },
    {
      value: 'labio-inferior',
      label: 'Lábio inferior',
      slugs: ['boca-labio-inferior', 'labio-inferior'],
    },
  ],
  microdermal: [
    {
      value: 'microdermal',
      label: 'Microdermal',
      slugs: ['microdermal'],
    },
    {
      value: 'surface',
      label: 'Surface',
      slugs: ['surface'],
    },
  ],
  intimos: [
    {
      value: 'feminina',
      label: 'Genital feminina',
      slugs: [
        'genital-feminina',
        'genitais-femininos',
        'intimos-feminina',
      ],
    },
    {
      value: 'masculina',
      label: 'Genital masculina',
      slugs: [
        'genital-masculino',
        'genital-masculina',
        'genitais-masculinos',
        'intimos-masculina',
      ],
    },
  ],
}

export function getSubareaOptions(area: string) {
  const items = SUBAREAS[area] || []

  return items.length
    ? [
        { value: 'all', label: 'Todas' },
        ...items.map(({ value, label }) => ({
          value,
          label,
        })),
      ]
    : []
}

export function normalizeSubarea(
  area: string,
  value: string
): string {
  return (SUBAREAS[area] || []).some(
    item => item.value === value
  )
    ? value
    : 'all'
}

export function normalizeArea(value: string): string {
  return AREA_OPTIONS.some(item => item.value === value)
    ? value
    : 'all'
}

export function normalizeJewelry(value: string): string {
  if (value === 'micro-surface-16') return 'topo-rosca-16'
  return JEWELRY_OPTIONS.some(item => item.value === value)
    ? value
    : 'all'
}

export function supportsAreaFilter(slug: string): boolean {
  return supportsJewelryFilter(slug)
}

export function supportsJewelryFilter(slug: string): boolean {
  return ![
    'after-care',
    'hastes-e-conectores',
  ].includes(slug)
}

interface Options {
  category: string
  area: string
  subarea?: string
  jewelry?: string
  material?: string
  sort?: string
  page?: number
  perPage?: number
}

interface CatalogRow {
  id: string
  slug: string
  name: string
  product_type: string
  sku: string | null
  categories: string[]
  category_slugs: string[]
  price: number | null
  original_price: number | null
  price_available: boolean
  stock_quantity: number | null
  short_description: string
  material: string
  thumbnail_path: string | null
  storage_path: string | null
  in_stock: boolean
  featured: boolean
  tags: string[]
  wholesale_settings_version?: number
  wholesale_enabled?: boolean
}

const SELECT = [
  'id',
  'slug',
  'name',
  'product_type',
  'sku',
  'categories',
  'category_slugs',
  'price',
  'original_price',
  'price_available',
  'stock_quantity',
  'short_description',
  'material',
  'thumbnail_path',
  'storage_path',
  'in_stock',
  'featured',
  'tags',
].join(',')

const ROOT_RULES: Record<
  string,
  { words: string[]; exclude?: string[] }
> = {
  'piercings-de-titanio': {
    words: ['titanio'],
  },
  'piercings-de-ouro-18k': {
    words: ['ouro'],
    exclude: ['titanio', 'revestid', 'banhad'],
  },
  argolas: {
    words: ['argola'],
  },
  'labrets-studs': {
    words: ['labret', 'stud'],
  },
  'piercings-de-umbigo': {
    words: ['umbigo'],
  },
  brincos: {
    words: ['brinco'],
  },
}

function isAreaCategory(
  slug: string,
  area: string
): boolean {
  if ((AREA_SLUGS[area] || []).includes(slug)) return true
  if (slug.startsWith(area + '-')) return true

  if (area === 'boca' && slug.startsWith('labio-')) {
    return true
  }

  if (
    area === 'microdermal' &&
    slug.startsWith('surface-')
  ) {
    return true
  }

  return (
    area === 'intimos' &&
    /^(genital|genitais|intimo|intimos)(-|$)/.test(slug)
  )
}

function logical(
  operator: 'and' | 'or',
  conditions: string[]
): string {
  return conditions.length === 1
    ? conditions[0]
    : `${operator}(${conditions.join(',')})`
}

function categoryMatches(slugs: string[]): string {
  return 'category_slugs.ov.{' + slugs.join(',') + '}'
}

export function buildAreaQuery(
  options: Options,
  categorySlugs: string[]
): URLSearchParams {
  const cleanSlugs = Array.from(
    new Set(
      categorySlugs.filter(slug =>
        /^[a-z0-9-]+$/.test(slug)
      )
    )
  )

  const requestedSize = Math.floor(options.perPage || 12)
  const size = Number.isFinite(requestedSize)
    ? Math.min(24, Math.max(1, requestedSize))
    : 12

  const requestedPage = Math.floor(options.page || 1)
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, requestedPage)
    : 1

  const area = supportsAreaFilter(options.category)
    ? normalizeArea(options.area)
    : 'all'

  const subarea = normalizeSubarea(
    area,
    options.subarea || 'all'
  )

  const jewelry = normalizeJewelry(
    options.jewelry || 'all'
  )

  const conditions: string[] = []

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

  const query = new URLSearchParams({
    select: SELECT,
    visibility: 'in.(visible,catalog)',
    limit: String(size),
    offset: String((page - 1) * size),
    order: orders[options.sort || 'default'] || orders.default,
  })

  if (options.category === 'destaques') {
    query.set('featured', 'eq.true')
  }

  if (
    !['todos', 'novidades', 'destaques'].includes(
      options.category
    )
  ) {
    if (cleanSlugs.includes(options.category)) {
      conditions.push(
        'category_slugs.cs.{' + options.category + '}'
      )
    } else {
      const rule = ROOT_RULES[options.category]

      if (!rule) {
        query.set('limit', '0')
      } else {
        conditions.push(
          logical(
            'or',
            rule.words.map(
              word => 'search_text.like.*' + word + '*'
            )
          )
        )

        ;(rule.exclude || []).forEach(word => {
          conditions.push(
            'search_text.not.like.*' + word + '*'
          )
        })
      }
    }
  }

  if (area !== 'all') {
    const selected = (SUBAREAS[area] || []).find(
      item => item.value === subarea
    )

    const matching = cleanSlugs.filter(slug =>
      selected
        ? selected.slugs.includes(slug)
        : isAreaCategory(slug, area)
    )

    if (!matching.length) {
      query.set('limit', '0')
    } else {
      conditions.push(categoryMatches(matching))
    }
  }

  if (jewelry !== 'all') {
    query.set('jewelry_filters', jewelry === 'topo-rosca-16'
      ? 'ov.{topo-rosca-16,micro-surface-16}'
      : `cs.{${jewelry}}`)
  }

  if (conditions.length) {
    query.set('and', '(' + conditions.join(',') + ')')
  }

  if (options.material && options.material !== 'all') {
    query.set('material', 'eq.' + options.material)
  }

  return query
}

function toProduct(row: CatalogRow): Product {
  const variable = row.product_type === 'variable'
  const image = storageUrl(
    row.thumbnail_path || row.storage_path
  )

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: (row.categories || [])[0] || 'Joias',
    categorySlug: (row.category_slugs || [])[0] || 'todos',
    categorySlugs: row.category_slugs || [],
    price: Number(row.price ?? 0),
    originalPrice:
      row.original_price == null
        ? undefined
        : Number(row.original_price),
    priceAvailable: row.price_available,
    stock: row.stock_quantity,
    sku: row.sku || '',
    description: plainText(row.short_description || ''),
    longDescription: '',
    material: row.material || '',
    images: image ? [image] : [],
    variants: variable
      ? [
          {
            type: 'variation',
            label: 'Variação',
            options: [],
          },
        ]
      : [],
    variations: variable ? [] : undefined,
    inStock: row.in_stock,
    isBestSeller: false,
    isFeatured: row.featured,
    isNew: false,
    tags: row.tags || [],
    related: [],
  }
}

export async function getAreaPage(
  options: Options
): Promise<StorePage> {
  const area = supportsAreaFilter(options.category)
    ? normalizeArea(options.area)
    : 'all'

  const jewelry = supportsJewelryFilter(options.category)
    ? normalizeJewelry(options.jewelry || 'all')
    : 'all'

  if (area === 'all' && jewelry === 'all') {
    return getStorePage(options)
  }

  const categories = await getStoreCategories()

  const query = buildAreaQuery(
    { ...options, area, jewelry },
    categories.map(item => item.slug)
  )

  if (query.get('limit') === '0') {
    return {
      products: [],
      total: 0,
      page: 1,
      totalPages: 0,
    }
  }

  const url = process.env.SUPABASE_URL
    ?.trim()
    .replace(/\/$/, '')

  const { rules: pricing } = await readWholesaleAccess()
  const privatePrices = pricing?.active === true

  const key = privatePrices
    ? process.env.SUPABASE_SECRET_KEY?.trim()
    : process.env.SUPABASE_PUBLISHABLE_KEY?.trim()

  const table = privatePrices
    ? 'serenity_wholesale_filtered_catalog_v1'
    : 'serenity_filtered_catalog_v1'

  if (privatePrices) {
    query.set(
      'select',
      SELECT + ',wholesale_settings_version,wholesale_enabled'
    )
  }

  if (!url || !key) {
    throw new Error(
      'A conexão do catálogo não está configurada.'
    )
  }

  async function readPage() {
    const commerce = await getCommercePolicy()
    const headers: Record<string, string> = {
      apikey: key!,
      Prefer: 'count=exact',
      'X-Lunarity-Commerce': String(commerce.version),
    }

    if (privatePrices && key!.startsWith('eyJ')) {
      headers.Authorization = `Bearer ${key}`
    }

    const response = await fetch(
      url + `/rest/v1/${table}?` + query.toString(),
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
      }
    )

    if (!response.ok) {
      console.error(
        'Falha no filtro do catálogo:',
        response.status
      )

      throw new Error(
        'Não foi possível filtrar o catálogo.'
      )
    }

    const rows: CatalogRow[] = await response.json()
    const range = response.headers.get('content-range')
    const total = range
      ? Number(range.split('/')[1])
      : NaN

    if (!Array.isArray(rows) || !Number.isFinite(total)) {
      throw new Error(
        'Resposta inesperada do catálogo.'
      )
    }

    if (
      privatePrices &&
      rows.some(row =>
        row.wholesale_enabled !== true ||
        Number(row.wholesale_settings_version) !==
          pricing?.settings_version
      )
    ) {
      throw new Error(
        'As regras do atacado mudaram. Atualize a página.'
      )
    }

    return { rows, total }
  }

  let result = await readPage()
  const size = Number(query.get('limit'))
  let totalPages = Math.ceil(result.total / size)
  let page = Number(query.get('offset')) / size + 1

  if (totalPages > 0 && page > totalPages) {
    page = totalPages
    query.set('offset', String((page - 1) * size))
    result = await readPage()
    totalPages = Math.ceil(result.total / size)
  }

  return {
    products: result.rows.map(toProduct),
    total: result.total,
    page: result.total ? page : 1,
    totalPages,
  }
}

// Reuse the same category aliases as the existing region filters.
export function matchesAreaSelection(slugs: string[], area: string, subarea: string): boolean {
  if (area === 'all') return true
  const child = (SUBAREAS[area] || []).find(item => item.value === subarea)
  return child ? slugs.some(slug => child.slugs.includes(slug)) : slugs.some(slug => isAreaCategory(slug, area))
}
