import 'server-only'
import { getStoneOverrides } from './stone-overrides-server'
import { getStoneCatalogMetadata, getStorePage } from './catalog-server'
import { namedStoneColors, stoneAttributeColors } from './stone-colors'
import { getStoneDefinitions } from './stone-definitions-server'
import { matchesAreaSelection } from './catalog-area'

export async function getStoneCollections(includeEmpty = false) {
  const [{ products, variants }, overrides, definitions] = await Promise.all([getStoneCatalogMetadata(), getStoneOverrides(), getStoneDefinitions()])
  const names = new Map(products.map(product => [product.database_id, product.name]))
  const byParent = new Map<string, Set<string>>()
  variants.forEach(variant => {
    const found = byParent.get(variant.product_id) || new Set<string>()
    stoneAttributeColors(variant.attributes, names.get(variant.product_id) || '').forEach(color => found.add(color))
    byParent.set(variant.product_id, found)
  })
  const classified = products.map(product => {
    const colors = new Set<string>(namedStoneColors(product.name))
    byParent.get(product.database_id)?.forEach(color => colors.add(color))
    return { ...product, colors }
  })
  const manual = new Map(overrides.map(row => [`${row.color_id}:${row.product_id}`,row.included]))
  return definitions.map(color => ({ ...color,
    products: classified.filter(product => manual.get(`${color.id}:${product.database_id}`) ?? product.colors.has(color.id))
  })).filter(color => includeEmpty || color.products.length > 0)
}

export async function getStonePage(color: Awaited<ReturnType<typeof getStoneCollections>>[number], options: {
  area: string; subarea: string; material: string; sort: string; page: number
}) {
  const products = color.products.filter(product => matchesAreaSelection(product.category_slugs, options.area, options.subarea))
  const materials = Array.from(new Set(products.map(product => product.material).filter(Boolean))).sort()
  const result = await getStorePage({ productIds: products.map(product => product.id),
    material: options.material, sort: options.sort, page: options.page, perPage: 12 })
  return { ...result, materials }
}
