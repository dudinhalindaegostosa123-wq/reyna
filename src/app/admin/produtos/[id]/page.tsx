import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAdminInventory } from '@/lib/admin-inventory'
import { getAdminClassification } from '@/lib/admin-classification'
import { adminDatabase } from '@/lib/admin-auth'
import type { EditorBundle } from '@/lib/admin-unified'
import UnifiedProductEditor from './UnifiedProductEditor'
import AdminCatalogSetupNotice from '@/components/admin/AdminCatalogSetupNotice'
import AdminDatabaseNotice from '@/components/admin/AdminDatabaseNotice'

export const dynamic = 'force-dynamic'

interface Props {
  params: {
    id: string
  }
  searchParams?: {
    salvo?: string
  }
}

// Converte os dados JSON em objetos simples,
// compatíveis com o componente do navegador.
function clientData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export default async function EditProduct({
  params,
  searchParams = {},
}: Props) {
  const { db } = await adminDatabase()

  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      params.id
    )
  ) {
    notFound()
  }

  let rawOptions
  try {
    rawOptions = await getAdminClassification(db)
  } catch (error) {
    return <AdminDatabaseNotice error={error} stage="categorias do editor" />
  }

  const result = await db.rpc(
    'serenity_admin_read_editor',
    {
      p_product_id: params.id,
    }
  )

  if (result.error?.code === 'PGRST202') return <AdminCatalogSetupNotice />

  if (result.error) {
    return <AdminDatabaseNotice error={result.error} stage="editor" />
  }

  if (!result.data) {
    notFound()
  }

  const bundle = clientData(
    result.data as EditorBundle
  )

  const options = clientData(rawOptions)

  let rawInventory
  let inventoryUnavailable = false
  try {
    const inventoryMap = await getAdminInventory(db, [String(bundle.product.id)])
    rawInventory = inventoryMap.get(String(bundle.product.id))
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'ADMIN_INVENTORY_NOT_INSTALLED') return <AdminDatabaseNotice error={error} stage="estoque do editor" />
    inventoryUnavailable = true
  }

  const inventory =
    rawInventory == null
      ? undefined
      : clientData(rawInventory)

  const url = process.env.SUPABASE_URL?.trim()

  if (!url) {
    throw new Error('ADMIN_CONFIGURATION')
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-7 sm:px-8 md:py-10">
      <Link
        href="/admin/produtos"
        className="text-xs text-[#81796C]"
      >
        ← Produtos
      </Link>

      <h1 className="mb-2 mt-6 text-2xl font-medium md:text-3xl">
        Editar produto
      </h1>

      <p className="mb-6 text-xs text-[#81796C]">
        {bundle.product.name}
      </p>

      {searchParams.salvo === '1' && (
        <p
          role="status"
          className="mb-5 rounded-2xl bg-[#EAF1E5] p-4 text-sm text-[#42603A]"
        >
          Todas as alterações foram salvas.
        </p>
      )}

      {inventoryUnavailable && <p role="status" className="mb-5 rounded-2xl border border-[#E5DED3] bg-white p-4 text-sm leading-6 text-[#625B51]">O resumo de reservas de estoque ainda não está instalado. Os campos do produto continuam disponíveis para edição.</p>}

      <UnifiedProductEditor
        key={bundle.version}
        bundle={bundle}
        options={options}
        inventory={inventory}
        storageUrl={url}
      />
    </main>
  )
}
