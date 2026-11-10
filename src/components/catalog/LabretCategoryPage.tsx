import Link from 'next/link'

import {
  getStoreCategory,
  getStorePage,
} from '@/lib/catalog-server'

import CategoryPageClient from '@/app/categoria/[slug]/CategoryPageClient'

interface Props {
  categorySlug: string
  categoryName: string
  description: string
  searchParams?: Record<
    string,
    string | string[] | undefined
  >
}

function text(
  value: string | string[] | undefined
): string {
  return typeof value === 'string' ? value : ''
}

export default async function LabretCategoryPage({
  searchParams = {},
  categorySlug,
  categoryName,
  description,
}: Props) {
  const requestedSort = text(searchParams.sort)

  const sort = [
    'default',
    'price-asc',
    'price-desc',
    'name-asc',
  ].includes(requestedSort)
    ? requestedSort
    : 'default'

  const material = text(searchParams.material) || 'all'

  const requestedPage = Number(text(searchParams.page))

  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 100000)
      : 1

  const [category, result] = await Promise.all([
    getStoreCategory(categorySlug),

    getStorePage({
      category: categorySlug,
      material,
      sort,
      page,
      perPage: 12,
    }),

  ])

  return (
    <div className="[&_h1]:text-[24px] sm:[&_h1]:text-[28px] md:[&_h1]:text-[30px]">
      <nav aria-label="Caminho da página" className="mx-auto flex max-w-7xl items-center gap-2 px-4 pt-6 text-xs text-store-muted">
        <Link href="/categoria/labret" className="inline-flex min-h-[44px] items-center underline underline-offset-4">Labret</Link>
        <span aria-hidden="true">/</span><span aria-current="page">{categoryName}</span>
      </nav>
      <div className="mx-auto flex max-w-7xl flex-wrap gap-3 px-4 pt-2">
        <Link href="/categoria/topos-e-correntes" aria-current={categorySlug === 'topos-e-correntes' ? 'page' : undefined} className="inline-flex min-h-[44px] items-center rounded-full border border-store-border bg-store-surface px-4 text-xs aria-[current=page]:border-store-selected aria-[current=page]:bg-store-action aria-[current=page]:text-white">Topos</Link>
        <Link href="/categoria/hastes-e-conectores" aria-current={categorySlug === 'hastes-e-conectores' ? 'page' : undefined} className="inline-flex min-h-[44px] items-center rounded-full border border-store-border bg-store-surface px-4 text-xs aria-[current=page]:border-store-selected aria-[current=page]:bg-store-action aria-[current=page]:text-white">Hastes e conectores</Link>
      </div>
      <CategoryPageClient
        products={result.products}
        categoryName={categoryName}
        categoryDescription={description}
        materials={category?.materials || []}
        material={material}
        sort={sort}
        page={result.page}
        total={result.total}
        totalPages={result.totalPages}
      />
    </div>
  )
}
