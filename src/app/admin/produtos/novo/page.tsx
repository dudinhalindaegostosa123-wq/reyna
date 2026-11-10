import { getAdminClassification } from '@/lib/admin-classification'
import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { adminDatabase } from '@/lib/admin-auth'
import { emptyProduct } from '@/lib/admin-unified'
import UnifiedProductEditor from '../[id]/UnifiedProductEditor'

export const dynamic = 'force-dynamic'

export default async function NewProductPage() {
  const { db } = await adminDatabase()
  const rawOptions = await getAdminClassification(db)
  // O mapa de rótulos usa protótipo nulo no servidor. O editor do
  // navegador precisa receber objetos JSON simples, como na edição.
  const options = JSON.parse(JSON.stringify(rawOptions)) as typeof rawOptions

  const url = process.env.SUPABASE_URL?.trim()

  if (!url) throw new Error('ADMIN_CONFIGURATION')

  const bundle = {
    product: emptyProduct(randomUUID()),
    variants: [],
    commercial: {},
    media: [],
    version: '',
  }

  return <main className="mx-auto max-w-5xl px-4 py-7 sm:px-8 md:py-10">
    <Link href="/admin/produtos" className="text-xs text-[#81796C]">← Produtos</Link>
    <h1 className="mb-6 mt-6 text-2xl font-medium md:text-3xl">Novo produto</h1>
    <UnifiedProductEditor options={options} bundle={bundle} storageUrl={url} isNew />
  </main>
}
