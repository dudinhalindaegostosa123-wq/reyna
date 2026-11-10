export interface ProductVariant {
  id: string
  name: string
  value: string
  inStock: boolean
}

export interface ImportedVariation {
  attributes?: Record<string,string>
  stemLength?: string
  id: string
  name: string
  sku: string
  price: number
  originalPrice?: number
  priceAvailable: boolean
  stock: number | null
  inStock: boolean
  image?: string
}

export interface Product {
  individualSale?: boolean
  originalName?: string
  technicalPreview?: {label:string;value:string}[]
  preparationOptions?: boolean
  preparationAllProducts?: boolean
  sterilizationFee?: number
  anodizationFee?: number
  stemFee?: number
  includesStem?: boolean
  id: string
  slug: string
  name: string
  category: string
  categorySlug: string
  categorySlugs?: string[]
  price: number
  originalPrice?: number
  priceAvailable?: boolean
  stock?: number | null
  sku?: string
  description: string
  longDescription: string
  material: string
  images: string[]
  youtubeShortId?: string
  variants: {
    type: string
    label: string
    options: ProductVariant[]
  }[]
  variations?: ImportedVariation[]
  inStock: boolean
  isBestSeller: boolean
  isFeatured?: boolean
  isNew: boolean
  tags: string[]
  related: string[]
}

export interface Category {
  id: string
  name: string
  slug: string
  description: string
  image: string
  count: number
}

export function plainText(value: string = ''): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|ul|ol|tr|td|th)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, number: string) => {
      const code = Number(number)
      return code >= 0 && code <= 1114111
        ? String.fromCodePoint(code)
        : ''
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function formatPrice(price: number): string {
  return price.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function resolveProductSelection(
  product: Product,
  selected: Record<string, string>
): ImportedVariation | null {
  if (product.variations) {
    return product.variations.find(
      (variation) => variation.id === selected['Variação']
    ) || null
  }

  return {
    id: product.id,
    name: product.name,
    sku: product.sku || '',
    price: product.price,
    originalPrice: product.originalPrice,
    priceAvailable: product.priceAvailable !== false,
    stock: product.stock ?? null,
    inStock: product.inStock,
    image: product.images[0],
  }
}

// Compatibilidade com componentes antigos.
// As páginas da loja consultam catalog-server.ts.
export const PRODUCTS: Product[] = []
export const CATEGORIES: Category[] = []

export function getProductBySlug(slug: string) {
  return PRODUCTS.find((product) => product.slug === slug)
}

export function getProductsByCategory(slug: string) {
  return PRODUCTS.filter((product) =>
    (product.categorySlugs || [product.categorySlug]).includes(slug)
  )
}

export function getBestSellers() {
  return PRODUCTS.filter((product) => product.isBestSeller)
}

export function getNewArrivals() {
  return PRODUCTS.filter((product) => product.isNew)
}

export function getRelatedProducts(product: Product) {
  return PRODUCTS.filter((item) => product.related.includes(item.id))
}

export function getPaginatedProducts(
  products: Product[],
  page: number,
  perPage: number = 12
) {
  const size = Math.max(1, Math.floor(perPage) || 12)
  const current = Math.max(1, Math.floor(page) || 1)

  return {
    products: products.slice((current - 1) * size, current * size),
    total: products.length,
    totalPages: Math.ceil(products.length / size),
  }
}
