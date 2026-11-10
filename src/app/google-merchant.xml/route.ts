import { getMerchantCatalog } from '@/lib/catalog-server'
import { merchantXml } from '@/lib/google-merchant'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  try {
    const xml = merchantXml(await getMerchantCatalog())
    return new Response(xml, { headers: {
      'Content-Type':'application/xml; charset=utf-8',
      'Cache-Control':'public, max-age=0, s-maxage=60',
      'X-Content-Type-Options':'nosniff',
    } })
  } catch {
    console.error('[google-merchant] CATALOG_UNAVAILABLE')
    return new Response('Catálogo temporariamente indisponível.', { status:503, headers:{ 'Cache-Control':'no-store','Retry-After':'60' } })
  }
}
