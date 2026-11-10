import ProductStockBadge from '@/components/admin/ProductStockBadge'
import { getAdminInventory } from '@/lib/admin-inventory'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { adminDatabase } from '@/lib/admin-auth'
import { logout } from '../actions'
import type { InventoryRow } from '@/lib/inventory'

interface Props {
  searchParams?: Record<string, string | string[] | undefined>
}

interface AdminProduct {
  id: string
  woo_id: number | null
  name: string
  slug: string
  sku: string | null
  product_type: string
  status: string
  stock_status: string
  regular_price: number | null
}

const PER_PAGE = 24

const value = (input: string | string[] | undefined) =>
  Array.isArray(input) ? input[0] || '' : input || ''

const money = (input: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(input)

export default async function AdminProducts({ searchParams = {} }: Props) {
  const { db, user } = await adminDatabase()
  const search = value(searchParams.q).trim().slice(0, 100)
  const status = ['published', 'draft'].includes(value(searchParams.status))
    ? value(searchParams.status)
    : 'all'

  const page = Math.min(
    100000,
    Math.max(1, Math.floor(Number(value(searchParams.page)) || 1))
  )

  const safe = search
    .replace(/[^a-zA-Z0-9À-ÿ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  function href(nextPage: number) {
    const query = new URLSearchParams()
    if (search) query.set('q', search)
    if (status !== 'all') query.set('status', status)
    if (nextPage > 1) query.set('page', String(nextPage))

    return '/admin/produtos' +
      (query.toString() ? `?${query}` : '')
  }

  let query = db.from('products').select(
    'id,woo_id,name,slug,sku,product_type,status,stock_status,regular_price',
    { count: 'exact' }
  )

  if (status !== 'all') query = query.eq('status', status)

  if (safe) {
    const numeric = /^\d{1,12}$/.test(safe)
      ? `,woo_id.eq.${safe}`
      : ''

    query = query.or(
      `name.ilike.%${safe}%,sku.ilike.%${safe}%${numeric}`
    )
  }

  const [result, allCount, publishedCount, draftCount, variantCount] =
    await Promise.all([
      query
        .order('created_at', { ascending: false })
        .order('id')
        .range((page - 1) * PER_PAGE, page * PER_PAGE - 1),
      db.from('products').select('id', { count: 'exact', head: true }),
      db.from('products').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      db.from('products').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      db.from('product_variants').select('id', { count: 'exact', head: true }),
    ])

  if (result.error?.code === 'PGRST103' && page > 1) {
    redirect(href(1))
  }

  if (
    [result, allCount, publishedCount, draftCount, variantCount]
      .some((item) => item.error)
  ) {
    throw new Error('ADMIN_CATALOG_QUERY')
  }

  const products = (result.data || []) as AdminProduct[]
  let inventory = new Map<string, InventoryRow>()
  let inventoryUnavailable = false
  try {
    inventory = await getAdminInventory(db, products.map(product => String(product.id)))
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'ADMIN_INVENTORY_NOT_INSTALLED') throw error
    inventoryUnavailable = true
  }
  const total = result.count || 0
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <>
      <header className="border-b border-[#E5DED3] bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div>
            <p className="text-[13px] font-medium tracking-[0.18em]">LUNARITY</p>
            <p className="mt-1 text-[10px] text-[#947B57]">Administração da loja</p>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/" target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#81796C]">
              Ver loja ↗
            </Link>
            <form action={logout}>
              <button className="min-h-[40px] rounded-full border border-[#E5DED3] px-4 text-[12px]">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 md:py-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#947B57]">
              Catálogo
            </p>
            <h1 className="text-[28px] font-medium tracking-[-0.035em] md:text-[34px]">
              Seus produtos
            </h1><Link href="/admin/produtos/novo" className="mt-4 inline-flex min-h-[42px] items-center rounded-full bg-[#292621] px-5 text-xs text-white">+ Novo produto</Link>
            <p className="mt-2 text-[12px] text-[#81796C]">
              Consulte produtos publicados e rascunhos da Lunarity.
            </p>
          </div>
          <p className="max-w-full break-all text-[11px] text-[#81796C]">
            {user.email}
          </p>
        </div>

        {inventoryUnavailable && (
          <p role="status" className="mb-6 rounded-2xl border border-[#E5DED3] bg-white p-4 text-sm leading-6 text-[#625B51]">
            O catálogo está disponível. O resumo de estoque ainda precisa ser instalado neste banco;
            as quantidades serão mostradas como não disponíveis até a configuração ser concluída.
          </p>
        )}

        <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Produtos', allCount.count],
            ['Publicados', publishedCount.count],
            ['Rascunhos', draftCount.count],
            ['Variações', variantCount.count],
          ].map(([label, count]) => (
            <div key={String(label)} className="rounded-[20px] border border-[#E5DED3] bg-white px-5 py-4">
              <p className="text-[11px] text-[#81796C]">{label}</p>
              <p className="mt-2 text-[26px] font-medium tracking-[-0.03em]">
                {Number(count || 0).toLocaleString('pt-BR')}
              </p>
            </div>
          ))}
        </div>

        <section aria-label="Produtos do catálogo" className="overflow-hidden rounded-[24px] border border-[#E5DED3] bg-white">
          <form method="get" action="/admin/produtos" className="grid gap-3 border-b border-[#EDE7DF] p-4 sm:grid-cols-[1fr_170px_auto] sm:p-5">
            <label>
              <span className="sr-only">Buscar por nome, código ou ID</span>
              <input name="q" defaultValue={search} maxLength={100} placeholder="Buscar por nome, código ou ID…" className="min-h-[44px] w-full rounded-full border border-[#E5DED3] bg-[#FCFBF8] px-4 text-[16px] outline-none focus:border-[#947B57] sm:text-[13px]" />
            </label>

            <label>
              <span className="sr-only">Situação do produto</span>
              <select name="status" defaultValue={status} className="min-h-[44px] w-full rounded-full border border-[#E5DED3] bg-white px-4 text-[13px]">
                <option value="all">Todos os produtos</option>
                <option value="published">Publicados</option>
                <option value="draft">Rascunhos</option>
              </select>
            </label>

            <button className="min-h-[44px] rounded-full bg-[#292621] px-6 text-[12px] text-white">
              Buscar
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-[11px] text-[#81796C]">
            <p>
              {total.toLocaleString('pt-BR')}{' '}
              {total === 1 ? 'produto encontrado' : 'produtos encontrados'}
            </p>
            {(search || status !== 'all') && (
              <Link href="/admin/produtos" className="underline underline-offset-4">
                Limpar busca
              </Link>
            )}
          </div>

          <div className="hidden grid-cols-[minmax(0,1fr)_110px_120px_170px] gap-5 border-y border-[#EDE7DF] bg-[#FCFBF8] px-5 py-3 text-[10px] uppercase tracking-[0.08em] text-[#81796C] md:grid">
            <span>Produto</span>
            <span>Situação</span>
            <span>Preço base</span>
            <span>Estoque</span>
          </div>

          {products.length ? products.map((product) => (
            <article key={product.id} className="grid gap-3 border-b border-[#F0EBE3] px-5 py-4 last:border-0 md:grid-cols-[minmax(0,1fr)_110px_120px_170px] md:items-center md:gap-5">
              <div className="min-w-0">
                <h2 className="text-[13px] font-medium leading-6">
                  {product.name}
                </h2>
                <p className="mt-1 text-[10px] text-[#947B57]">
                  ID {product.woo_id || '—'} ·{' '}
                  {product.product_type === 'variable' ? 'Com variações' : 'Produto simples'}
                  {product.sku ? ` · SKU ${product.sku}` : ''}
                </p>
                <Link href={`/admin/produtos/${product.id}`} prefetch={false} className="mr-4 mt-2 inline-block py-1 text-xs font-medium text-[#625B51] underline underline-offset-4">Editar produto</Link>{product.status === 'published' && (
                  <Link href={`/produto/${product.slug}`} target="_blank" rel="noopener noreferrer" prefetch={false} className="mt-2 inline-block py-1 text-[10px] text-[#81796C] underline underline-offset-4">
                    Visualizar na loja ↗
                  </Link>
                )}
              </div>

              <div>
                <span className={`inline-block rounded-full px-3 py-1.5 text-[10px] ${
                  product.status === 'published'
                    ? 'bg-[#EDF2EA] text-[#52654B]'
                    : 'bg-[#F5EEDF] text-[#8A7045]'
                }`}>
                  {product.status === 'published'
                    ? 'Publicado'
                    : product.status === 'draft'
                      ? 'Rascunho'
                      : product.status}
                </span>
              </div>

              <p className="text-[12px] text-[#625B51]">
                <span className="mr-2 text-[10px] text-[#947B57] md:hidden">
                  Preço base:
                </span>
                {product.regular_price !== null
                  ? money(Number(product.regular_price))
                  : product.product_type === 'variable'
                    ? 'Nas variações'
                    : 'Não definido'}
              </p>

              <ProductStockBadge row={inventory.get(String(product.id))} />
            </article>
          )) : (
            <p className="px-5 py-14 text-center text-[13px] text-[#81796C]">
              Nenhum produto encontrado. Experimente outra busca.
            </p>
          )}

          <nav aria-label="Paginação de produtos" className="flex flex-wrap items-center justify-between gap-4 border-t border-[#EDE7DF] px-5 py-4 text-[11px] text-[#81796C]">
            <span>Página {page} de {totalPages}</span>
            <div className="flex gap-3">
              {page > 1 && (
                <Link href={href(page - 1)} prefetch={false} className="inline-flex min-h-[40px] items-center rounded-full border border-[#E5DED3] px-4">
                  ← Anterior
                </Link>
              )}
              {page < totalPages && (
                <Link href={href(page + 1)} prefetch={false} className="inline-flex min-h-[40px] items-center rounded-full border border-[#E5DED3] px-4">
                  Próxima →
                </Link>
              )}
            </div>
          </nav>
        </section>
      </main>
    </>
  )
}

// Lunarity: estoque geral das variações v2
