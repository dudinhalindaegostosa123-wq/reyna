import Link from 'next/link'
import { redirect } from 'next/navigation'
import { adminDatabase } from '@/lib/admin-auth'

import CategoryForm from './CategoryForm'
import type { EditableCategory } from './CategoryForm'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams?: Record<
    string,
    string | string[] | undefined
  >
}

const PER_PAGE = 20

function text(
  value: string | string[] | undefined
): string {
  return typeof value === 'string' ? value : ''
}

function categoryFrom(value: unknown): EditableCategory {
  const row = value as Record<string, unknown>

  return {
    slug: String(row.slug || ''),
    name: String(row.name || ''),
    hidden_from_menu: row.hidden_from_menu === true,
    version: Number(row.version || 0),
    product_count: Number(row.product_count || 0),
  }
}

export default async function CategoriesPage({
  searchParams = {},
}: Props) {
  const { db } = await adminDatabase()

  const search = text(searchParams.q)
    .trim()
    .slice(0, 100)

  const safeSearch = search
    .replace(/[^a-zA-Z0-9À-ÿ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const requestedEdit = text(searchParams.edit)

  const validEdit =
    requestedEdit.length <= 180 &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(requestedEdit)

  const edit = validEdit ? requestedEdit : ''

  const invalidEdit = Boolean(
    requestedEdit && !validEdit
  )

  const requestedPage = Number(text(searchParams.page))

  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 100000)
      : 1

  function href(
    nextPage = 1,
    nextEdit = edit,
    nextSearch = search
  ) {
    const params = new URLSearchParams()

    if (nextSearch) params.set('q', nextSearch)
    if (nextEdit) params.set('edit', nextEdit)

    if (nextPage > 1) {
      params.set('page', String(nextPage))
    }

    const queryString = params.toString()

    return (
      '/admin/categorias' +
      (queryString ? `?${queryString}` : '')
    )
  }

  let query = db
    .from('serenity_admin_categories')
    .select(
      'slug,name,source_name,product_count,hidden_from_menu,version',
      { count: 'exact' }
    )

  if (search) {
    if (safeSearch) {
      query = query.or(
        `name.ilike.%${safeSearch}%,slug.ilike.%${safeSearch}%`
      )
    } else {
      query = query.eq('slug', '')
    }
  }

  const [list, selected] = await Promise.all([
    query
      .order('name')
      .order('slug')
      .range(
        (page - 1) * PER_PAGE,
        page * PER_PAGE - 1
      ),

    edit
      ? db
          .from('serenity_admin_categories')
          .select(
            'slug,name,source_name,product_count,hidden_from_menu,version'
          )
          .eq('slug', edit)
          .maybeSingle()
      : Promise.resolve({
          data: null,
          error: null,
        }),
  ])

  if (list.error?.code === 'PGRST103' && page > 1) {
    redirect(href())
  }

  if (list.error || selected.error) {
    throw new Error('ADMIN_CATEGORIES_QUERY')
  }

  const categories = (list.data || []).map(categoryFrom)

  const category = selected.data
    ? categoryFrom(selected.data)
    : undefined

  const total = list.count || 0
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))

  if (page > pages) {
    redirect(href(pages))
  }

  const missingCategory = Boolean(edit && !category)

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium">
            Categorias
          </h1>

          <p className="mt-3 text-sm text-[#81796C]">
            Organize as categorias da loja.
          </p>
        </div>

        <Link
          href="/admin/produtos"
          className="inline-flex min-h-[44px] items-center rounded-full border border-[#DDD4C7] bg-white px-5 text-xs"
        >
          Ver produtos
        </Link>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-[#E5DED3] bg-white">
          <div className="border-b border-[#E5DED3] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-medium">
                Categorias cadastradas
              </h2>

              <Link
                href={href(1, '')}
                className="inline-flex min-h-[44px] items-center rounded-full bg-[#292621] px-4 text-xs text-white"
              >
                + Nova categoria
              </Link>
            </div>

            <form
              key={search}
              method="get"
              action="/admin/categorias"
              className="mt-4 flex flex-wrap items-end gap-3"
            >
              {edit && (
                <input
                  type="hidden"
                  name="edit"
                  value={edit}
                />
              )}

              <label className="min-w-0 flex-1 text-xs text-[#625B51]">
                Buscar categoria

                <input
                  name="q"
                  defaultValue={search}
                  maxLength={100}
                  placeholder="Nome ou endereço"
                  className="mt-2 min-h-[44px] w-full rounded-xl border border-[#DDD4C7] bg-white px-3 text-base sm:text-sm"
                />
              </label>

              <button
                type="submit"
                className="min-h-[44px] rounded-full border border-[#DDD4C7] px-4 text-xs"
              >
                Buscar
              </button>
            </form>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#81796C]">
              <span>
                {total} categoria(s) encontrada(s)
              </span>

              {search && (
                <Link
                  href={href(1, edit, '')}
                  className="underline"
                >
                  Limpar busca
                </Link>
              )}
            </div>
          </div>

          {categories.length ? (
            <ul className="divide-y divide-[#EEE9E1]">
              {categories.map(item => {
                const active = item.slug === edit

                return (
                  <li key={item.slug}>
                    <Link
                      href={href(page, item.slug)}
                      aria-current={active ? 'page' : undefined}
                      className={`block px-5 py-4 transition-colors ${
                        active
                          ? 'bg-[#F1EBE1]'
                          : 'hover:bg-[#FCFBF8]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 break-words text-sm font-medium">
                          {item.name}
                        </p>

                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] ${
                            item.hidden_from_menu
                              ? 'bg-[#EFEAE2] text-[#756B5D]'
                              : 'bg-green-50 text-green-800'
                          }`}
                        >
                          {item.hidden_from_menu
                            ? 'Ocultar do menu'
                            : 'Exibir no menu'}
                        </span>
                      </div>

                      <p className="mt-2 text-xs text-[#81796C]">
                        {item.product_count} produto(s)
                      </p>

                      <p className="mt-1 break-all text-[11px] text-[#81796C]">
                        {item.slug}
                      </p>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="p-7 text-sm text-[#81796C]">
              {search
                ? 'Nenhuma categoria encontrada nesta busca.'
                : 'Nenhuma categoria cadastrada.'}
            </p>
          )}

          <nav
            aria-label="Paginação de categorias"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5DED3] p-5 text-xs"
          >
            <span className="text-[#81796C]">
              Página {page} de {pages}
            </span>

            <div className="flex gap-4">
              {page > 1 && (
                <Link href={href(page - 1)}>
                  ← Anterior
                </Link>
              )}

              {page < pages && (
                <Link href={href(page + 1)}>
                  Próxima →
                </Link>
              )}
            </div>
          </nav>

          <p className="border-t border-[#EEE9E1] px-5 py-4 text-[11px] leading-relaxed text-[#81796C]">
            A contagem inclui produtos em rascunho e fora
            de exibição na loja.
          </p>
        </section>

        <div className="min-w-0">
          {invalidEdit || missingCategory ? (
            <section className="rounded-2xl border border-[#E5DED3] bg-white p-5">
              <p role="alert" className="text-sm text-red-700">
                Categoria não encontrada.
              </p>

              <Link
                href={href(1, '')}
                className="mt-4 inline-flex min-h-[44px] items-center text-xs underline"
              >
                Voltar para nova categoria
              </Link>
            </section>
          ) : (
            <CategoryForm
              key={
                category
                  ? `${category.slug}-${category.version}`
                  : 'new'
              }
              category={category}
            />
          )}
        </div>
      </div>
    </main>
  )
}
