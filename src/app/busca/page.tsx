import Link from 'next/link'
import { Search } from 'lucide-react'
import { getStorePage } from '@/lib/catalog-server'
import { normalizeStoneText, resolveStoneSearch } from '@/lib/stone-colors'
import { getStoneCollections } from '@/lib/stone-collections-server'
import ProductCard from '@/components/ui/ProductCard'

interface Props {
  searchParams?: Record<string, string | string[] | undefined>
}

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] || '' : input || ''
}

export const metadata = { title: 'Buscar produtos' }

export default async function SearchPage({ searchParams = {} }: Props) {
  const query = value(searchParams.q).trim().slice(0, 120)
  const collections=await getStoneCollections(true)
  const custom=collections.find(color=>color.id===value(searchParams.cor)) || collections.find(color=>normalizeStoneText(color.name)===normalizeStoneText(query))
  const selection = custom ? {color:custom.id,search:normalizeStoneText(custom.name)===normalizeStoneText(query)?'':query} : resolveStoneSearch(query,value(searchParams.cor))
  const colorGroup = collections.find(color=>color.id===selection.color)
  const hasSearch = query.length >= 2 || Boolean(colorGroup)
  const result = hasSearch
    ? await getStorePage({
        search: selection.search,
        ...(colorGroup ? {productIds:colorGroup.products.map(product=>product.id)} : {}),
        page: Number(value(searchParams.page)) || 1,
        perPage: 12,
      })
    : { products: [], total: 0, page: 1, totalPages: 0 }

  function href(page: number) {
    return `/busca?${new URLSearchParams({
      q: query, cor: selection.color, page: String(page),
    })}`
  }

  const pages = Array.from(new Set([
    1, result.page - 1, result.page,
    result.page + 1, result.totalPages,
  ])).filter((page) => page >= 1 && page <= result.totalPages)
    .sort((a, b) => a - b)

  return (
    <div className="min-h-screen bg-store-canvas">
      <div className="border-b border-store-border bg-store-surface">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="mb-6 font-display text-4xl font-light">Buscar</h1>

          <form action="/busca" method="get" className="flex flex-wrap items-center gap-3 border-b-2 border-store-selected pb-2">
            <Search size={18} strokeWidth={1.5} className="shrink-0 text-store-muted" />
            <input
              key={query}
              name="q"
              type="search"
              defaultValue={query}
              maxLength={120}
              placeholder="Buscar joias, cores, materiais..."
              aria-label="Buscar produtos"
              className="min-w-[120px] flex-1 bg-transparent text-[16px] outline-none placeholder:text-store-muted"
            />
            <button type="submit" className="text-xs uppercase tracking-wide">Buscar</button>
            {query && <Link href="/busca" className="text-xs text-store-muted">Limpar</Link>}
            <label className="sr-only" htmlFor="search-color">Cor da pedra</label>
            <select id="search-color" key={selection.color} name="cor" defaultValue={selection.color} className="min-h-[44px] w-full sm:w-auto sm:max-w-[160px] rounded-lg border border-store-border bg-store-surface px-2 text-xs"><option value="">Todas as cores</option>{collections.map(color=><option key={color.id} value={color.id}>{color.name}</option>)}</select>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10">
        {hasSearch ? (
          <>
            <p className="mb-6 text-[12px] uppercase tracking-wide text-store-muted">
              {result.total} resultado{result.total !== 1 ? 's' : ''} para “{query || colorGroup?.name}”
            </p>

            {result.products.length ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
                {result.products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="space-y-5 py-12 text-center text-sm text-store-muted">
                <p>Nenhum produto encontrado para esta busca. Tente o nome da peça, o material ou a referência.</p>
                <div className="flex flex-wrap justify-center gap-3">{[{name:'Todas as joias',href:'/categoria/todos'},{name:'Joias para orelha',href:'/orelha'},{name:'Montar meu projeto',href:'/projeto-auricular'}].map(link=><Link key={link.href} href={link.href} className="inline-flex min-h-[44px] items-center rounded-full border border-store-border px-5 text-xs text-store-text hover:bg-store-raised">{link.name}</Link>)}</div>
                <Link href="/ajuda" className="inline-flex min-h-[44px] items-center underline underline-offset-4">Precisa de ajuda para encontrar sua joia?</Link>
              </div>
            )}

            {result.totalPages > 1 && (
              <nav aria-label="Paginação da busca" className="mt-12 flex flex-wrap justify-center gap-2">
                {result.page > 1 && (
                  <Link prefetch={false} href={href(result.page - 1)} aria-label="Página anterior" className="border px-4 py-3 text-xs">←</Link>
                )}
                {pages.map((page, index) => (
                  <span key={page} className="flex items-center gap-2">
                    {index > 0 && page - pages[index - 1] > 1 && <span>…</span>}
                    <Link prefetch={false} href={href(page)} aria-current={page === result.page ? 'page' : undefined} className={`border px-4 py-3 text-xs ${page === result.page ? 'bg-black text-white' : ''}`}>
                      {page}
                    </Link>
                  </span>
                ))}
                {result.page < result.totalPages && (
                  <Link prefetch={false} href={href(result.page + 1)} aria-label="Próxima página" className="border px-4 py-3 text-xs">→</Link>
                )}
              </nav>
            )}
          </>
        ) : (
          <p className="py-20 text-center text-sm text-store-muted">
            Digite pelo menos 2 caracteres e pressione Buscar ou Enter.
          </p>
        )}
      </div>
    </div>
  )
}
