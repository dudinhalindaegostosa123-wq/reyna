import { plainText, type Product, type ImportedVariation } from './data'

export const MERCHANT_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || 'https://reyna-three.vercel.app'
export function merchantLink(product: Product, variation?: string): string {
  const url = new URL(`/produto/${encodeURIComponent(product.slug)}`, MERCHANT_ORIGIN)
  if (variation) url.searchParams.set('variacao', variation)
  return url.toString()
}
export function xmlText(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!))
}
function publicImage(value?: string): boolean {
  try { const url = new URL(value || ''); return url.protocol === 'https:' && !url.username && !url.password } catch { return false }
}
function validPrice(price: number, available?: boolean) { return available !== false && Number.isFinite(price) && price > 0 }
export function merchantXml(products: Product[]): string {
  const ids = new Set<string>()
  const items: string[] = []
  const tag = (key: string, value: unknown) => `<g:${key}>${xmlText(value)}</g:${key}>`
  for (const product of products) {
    const choices: (ImportedVariation | null)[] = product.variations === undefined ? [null] : product.variations
    for (const choice of choices) {
      const id = choice?.id || product.id
      const price = choice ? choice.price : product.price
      const available = choice ? choice.priceAvailable : product.priceAvailable
      const image = choice?.image || product.images[0]
      if (!id || ids.has(id) || !product.slug || !product.name || !validPrice(price, available) || !publicImage(image)) continue
      ids.add(id)
      const stock = choice ? choice.inStock : product.inStock
      const attributes = (choice as (ImportedVariation & { attributes?: Record<string, string> }) | null)?.attributes || {}
      const attribute = (pattern: RegExp) => Object.entries(attributes).filter(([key]) => pattern.test(key)).map(([, value]) => value).filter(Boolean).join(' / ')
      const description = plainText(product.description || product.longDescription || product.name).slice(0,5000)
      let item = tag('id',id) + tag('title', (product.name + (choice ? ` — ${choice.name}` : '')).slice(0,150)) + tag('description',description) + tag('link',merchantLink(product,choice?.id)) + tag('image_link',image) + tag('price',`${price.toFixed(2)} BRL`) + tag('availability',stock ? 'in_stock' : 'out_of_stock') + tag('condition','new')
      // No manufacturer brand, GTIN or MPN is inferred from the retailer or internal SKU.
      if (choice) item += tag('item_group_id',product.id)
      if (product.material) item += tag('material',product.material.slice(0,200))
      const size = attribute(/tamanho|medida|comprimento|espessura|diametro|diâmetro|size/i)
      const color = attribute(/cor|color/i)
      if (size) item += tag('size',size.slice(0,100))
      if (color) item += tag('color',color.slice(0,100))
      items.push(`<item>${item}</item>`)
    }
  }
  if (!items.length) throw new Error('MERCHANT_EMPTY_CATALOG')
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>Lunarity</title><link>${MERCHANT_ORIGIN}</link><description>Catálogo de joias Lunarity</description>${items.join('')}</channel></rss>`
}
export function productStructuredData(product: Product) {
  const choices = product.variations === undefined ? [null] : product.variations
  return {
    '@context':'https://schema.org', '@type':'Product', name:product.name,
    description:plainText(product.description || product.longDescription), image:product.images,
    ...(product.sku ? { sku:product.sku } : {}), material:product.material,
    url:merchantLink(product),
    offers:choices.filter(choice => validPrice(choice ? choice.price : product.price, choice ? choice.priceAvailable : product.priceAvailable)).map(choice => ({
      '@type':'Offer', url:merchantLink(product,choice?.id), priceCurrency:'BRL',
      price:(choice ? choice.price : product.price).toFixed(2),
      availability:`https://schema.org/${(choice ? choice.inStock : product.inStock) ? 'InStock' : 'OutOfStock'}`,
      itemCondition:'https://schema.org/NewCondition',
      seller:{ '@type':'Organization',name:'Lunarity' },
    })),
  }
}
