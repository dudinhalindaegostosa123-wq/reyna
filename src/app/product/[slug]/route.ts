import { LEGACY_PRODUCT_IDS } from '@/lib/legacy-product-links'
import { resolveLegacyProductLink } from '@/lib/catalog-server'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, {params}: {params:{slug:string}}) {
  const id = Object.prototype.hasOwnProperty.call(LEGACY_PRODUCT_IDS,params.slug) ? LEGACY_PRODUCT_IDS[params.slug] : null
  if (!id) return new Response('Produto não encontrado.', {status:404})
  try {
    const destination = await resolveLegacyProductLink(id,new URL(request.url).searchParams)
    if (!destination) return new Response('Produto ou variação não encontrado.', {status:404})
    return new Response(null,{status:301,headers:{Location:destination,'Cache-Control':'public, max-age=300'}})
  } catch {
    return new Response('Catálogo temporariamente indisponível.',{status:503,headers:{'Retry-After':'60','Cache-Control':'no-store'}})
  }
}
