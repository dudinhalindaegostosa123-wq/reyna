import Link from 'next/link'
import { redirect } from 'next/navigation'
import { adminDatabase } from '@/lib/admin-auth'
import { setMaterialReviewResolved } from './actions'

export const dynamic = 'force-dynamic'

const filters = {
  material: 'Material',
  price: 'Preço',
  stock: 'Estoque',
  sku: 'SKU',
}

type Filter = keyof typeof filters

type ReviewState =
  | 'pending'
  | 'resolved'
  | 'all'

interface Props {
  searchParams?: Record<
    string,
    string | string[] | undefined
  >
}

interface ReviewItem {
  product_id: string
  name: string
  sku: string | null
  status: string
  material: string | null
  material_count: number
  material_details: unknown
  material_signature: string | null
  material_resolved: boolean
  resolution_version: number
  resolution_note: string
  resolved_at: string | null
  price_count: number
  stock_count: number
  price_details: unknown
  stock_details: unknown
  sku_missing: boolean
}

const notices: Record<string, string> = {
  resolvido:
    'Revisão registrada como resolvida.',
  reaberto:
    'Produto devolvido à lista de pendentes.',
  alterado:
    'A revisão mudou em outra operação. A lista foi atualizada; confira antes de repetir.',
  invalido:
    'Confira os dados e marque a confirmação antes de registrar a revisão.',
  indisponivel:
    'Não foi possível confirmar a alteração. Confira a lista antes de tentar novamente.',
}

const read = (
  value: string | string[] | undefined
) => typeof value === 'string' ? value : ''

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

function detailsFrom(
  value: unknown
): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        item =>
          item &&
          typeof item === 'object' &&
          !Array.isArray(item)
      )
    : []
}

function text(value: unknown): string {
  return typeof value === 'string'
    ? value
    : ''
}

function savedDate(value: unknown): string {
  const timestamp = Date.parse(text(value))

  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(new Date(timestamp))
    : ''
}

export default async function QualityPage({
  searchParams = {},
}: Props) {
  const { db } = await adminDatabase()

  const requested = read(searchParams.rule)

  const aliases: Record<string, Filter> = {
    material_review: 'material',
    variant_price: 'price',
    variant_stock: 'stock',
  }

  const rule: Filter =
    Object.prototype.hasOwnProperty.call(
      filters,
      requested
    )
      ? requested as Filter
      : Object.prototype.hasOwnProperty.call(
          aliases,
          requested
        )
        ? aliases[requested]
        : 'material'

  const requestedState = read(
    searchParams.state
  )

  const state: ReviewState = [
    'pending',
    'resolved',
    'all',
  ].includes(requestedState)
    ? requestedState as ReviewState
    : 'pending'

  const search = read(searchParams.q)
    .trim()
    .slice(0, 120)

  const words = normalize(search)
    .replace(/[,*%_\\()"']/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)

  const rawPage = Number(
    read(searchParams.page)
  )

  const page =
    Number.isSafeInteger(rawPage) &&
    rawPage > 0
      ? Math.min(rawPage, 100000)
      : 1

  const size = 20

  const href = (
    nextRule = rule,
    nextPage = 1,
    nextState = state
  ) => {
    const params = new URLSearchParams({
      rule: nextRule,
    })

    if (search) {
      params.set('q', search)
    }

    if (nextRule === 'material') {
      params.set('state', nextState)
    }

    if (nextPage > 1) {
      params.set('page', String(nextPage))
    }

    return `/admin/qualidade?${params}`
  }

  const queryFor = (
    category: Filter,
    countOnly: boolean
  ) => {
    let query = db
      .from('serenity_admin_catalog_review_v2')
      .select(
        countOnly ? 'product_id' : '*',
        {
          count: 'exact',
          head: countOnly,
        }
      )

    if (category === 'material') {
      query = query.gt('material_count', 0)

      if (state !== 'all') {
        query = query.eq(
          'material_resolved',
          state === 'resolved'
        )
      }
    } else if (category === 'price') {
      query = query.gt('price_count', 0)
    } else if (category === 'stock') {
      query = query.gt('stock_count', 0)
    } else {
      query = query.eq('sku_missing', true)
    }

    words.forEach(word => {
      query = query.ilike(
        'search_text',
        `%${word}%`
      )
    })

    return query
  }

  const [
    result,
    materialCount,
    priceCount,
    stockCount,
    skuCount,
  ] = await Promise.all([
    queryFor(rule, false)
      .order('name')
      .order('product_id')
      .range(
        (page - 1) * size,
        page * size - 1
      ),

    queryFor('material', true),
    queryFor('price', true),
    queryFor('stock', true),
    queryFor('sku', true),
  ])

  const counts = {
    material: materialCount,
    price: priceCount,
    stock: stockCount,
    sku: skuCount,
  }

  const total = result.count ?? 0

  const pages = Math.max(
    1,
    Math.ceil(total / size)
  )

  if (
    result.error?.code === 'PGRST103' &&
    page > 1
  ) {
    redirect(href(rule))
  }

  if (!result.error && page > pages) {
    redirect(href(rule, pages))
  }

  const items = (
    result.data ?? []
  ) as unknown as ReviewItem[]

  const notice = read(searchParams.aviso)

  const noticeText =
    Object.prototype.hasOwnProperty.call(
      notices,
      notice
    )
      ? notices[notice]
      : ''

  const success =
    notice === 'resolvido' ||
    notice === 'reaberto'

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium">
            Revisão do catálogo
          </h1>

          <p className="mt-2 text-sm text-[#756B5D]">
            Confira cada produto e organize
            o que falta revisar.
          </p>
        </div>

        <Link
          href="/admin/produtos"
          className="inline-flex min-h-[44px] items-center rounded-full border border-[#DDD4C7] bg-white px-5 text-xs"
        >
          Ver produtos
        </Link>
      </div>

      <nav
        aria-label="Tipos de revisão"
        className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {(
          Object.entries(filters) as [
            Filter,
            string,
          ][]
        ).map(([key, name]) => (
          <Link
            key={key}
            href={href(key)}
            aria-current={
              rule === key ? 'page' : undefined
            }
            className={`flex min-h-[64px] items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
              rule === key
                ? 'border-[#292621] bg-[#292621] text-white'
                : 'border-[#E5DED3] bg-white text-[#756B5D] hover:bg-[#F1EBE1]'
            }`}
          >
            <span>{name}</span>

            <span className="font-medium">
              {counts[key].error
                ? '—'
                : counts[key].count ?? 0}
            </span>
          </Link>
        ))}
      </nav>

      <form
        action="/admin/qualidade"
        method="get"
        className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[#E5DED3] bg-white p-4"
      >
        <input
          type="hidden"
          name="rule"
          value={rule}
        />

        <label className="min-w-0 flex-1 basis-60 text-xs">
          Buscar produto

          <input
            name="q"
            defaultValue={search}
            maxLength={120}
            placeholder="Nome, SKU ou código"
            className="mt-2 min-h-[44px] w-full rounded-xl border border-[#DDD4C7] px-3 text-base sm:text-sm"
          />
        </label>

        {rule === 'material' && (
          <label className="text-xs">
            Situação

            <select
              name="state"
              defaultValue={state}
              className="mt-2 block min-h-[44px] rounded-xl border border-[#DDD4C7] bg-white px-3 text-sm"
            >
              <option value="pending">
                Pendentes
              </option>
              <option value="resolved">
                Resolvidos
              </option>
              <option value="all">
                Todos
              </option>
            </select>
          </label>
        )}

        <button className="min-h-[44px] rounded-full bg-[#292621] px-6 text-xs text-white">
          Buscar
        </button>

        {search && (
          <Link
            href={`/admin/qualidade?rule=${rule}${
              rule === 'material'
                ? `&state=${state}`
                : ''
            }`}
            className="inline-flex min-h-[44px] items-center px-2 text-xs underline"
          >
            Limpar busca
          </Link>
        )}
      </form>

      <details className="mt-4 text-xs text-[#756B5D]">
        <summary className="cursor-pointer py-2 underline">
          Como funciona
        </summary>

        <div className="mt-2 space-y-2 rounded-2xl border border-[#E5DED3] bg-white p-4 leading-relaxed">
          <p>
            <strong>Material:</strong> reúne as
            pendências do CSV por produto. Após conferir
            o cadastro, você pode registrar a revisão
            como resolvida. Isso não altera material
            nem preço. Se surgirem novas informações
            na lista importada, o produto volta
            a ficar pendente.
          </p>

          <p>
            <strong>Preço e estoque:</strong> mostram
            campos vazios no produto ou em variações
            habilitadas. Ao corrigir o cadastro e
            atualizar esta página, os avisos
            desaparecem. Valores iguais a zero
            não entram nesses filtros.
          </p>

          <p>
            <strong>SKU é opcional.</strong>{' '}
            Quantidade de estoque vazia pode ser
            intencional. Os filtros incluem
            produtos em rascunho.
          </p>
        </div>
      </details>

      {noticeText && (
        <p
          role={success ? 'status' : 'alert'}
          className={`mt-4 rounded-2xl border p-4 text-sm ${
            success
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          {noticeText}
        </p>
      )}

      <section className="mt-5 overflow-hidden rounded-3xl border border-[#E5DED3] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5DED3] px-5 py-4">
          <h2 className="text-sm font-medium">
            {filters[rule]}

            {rule === 'material'
              ? ` · ${
                  state === 'pending'
                    ? 'Pendentes'
                    : state === 'resolved'
                      ? 'Resolvidos'
                      : 'Todos'
                }`
              : ''}
          </h2>

          {!result.error && (
            <span className="text-xs text-[#756B5D]">
              {total} produto(s)
            </span>
          )}
        </div>

        {result.error ? (
          <div
            role="alert"
            className="p-6"
          >
            <p className="text-sm text-red-700">
              Não foi possível carregar esta revisão.
            </p>

            <Link
              href={href(rule, page)}
              className="mt-3 inline-flex min-h-[44px] items-center text-xs underline"
            >
              Tentar novamente
            </Link>
          </div>
        ) : items.length ? (
          <ul className="divide-y divide-[#EEE8DE]">
            {items.map(item => {
              const details = detailsFrom(
                rule === 'material'
                  ? item.material_details
                  : rule === 'price'
                    ? item.price_details
                    : item.stock_details
              )

              const count =
                rule === 'material'
                  ? item.material_count
                  : rule === 'price'
                    ? item.price_count
                    : rule === 'stock'
                      ? item.stock_count
                      : 1

              const version = Number(
                item.resolution_version
              )

              const canResolve =
                rule === 'material' &&
                Boolean(item.material_signature) &&
                Number.isSafeInteger(version) &&
                version >= 0

              return (
                <li
                  key={item.product_id}
                  className="p-5 sm:p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 basis-64">
                      <h3 className="break-words text-sm font-medium">
                        {item.name || 'Sem nome'}
                      </h3>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#756B5D]">
                        {item.sku && (
                          <span>
                            SKU: {item.sku}
                          </span>
                        )}

                        {item.status === 'draft' && (
                          <span className="rounded-full bg-[#F2EDE5] px-2 py-1">
                            Rascunho
                          </span>
                        )}

                        {rule === 'material' &&
                          item.material_resolved && (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-800">
                              Resolvido
                            </span>
                          )}
                      </div>

                      <p className="mt-3 text-xs leading-relaxed text-[#756B5D]">
                        {rule === 'material'
                          ? `${count} observação(ões) para conferir.`
                          : rule === 'price'
                            ? `${count} preço(s) normal(is) sem preenchimento.`
                            : rule === 'stock'
                              ? `${count} quantidade(s) de estoque sem definição.`
                              : 'SKU não preenchido. Este código é opcional.'}
                      </p>
                    </div>

                    <Link
                      href={`/admin/produtos/${item.product_id}`}
                      className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-[#DDD4C7] px-5 text-xs"
                    >
                      Revisar produto →
                    </Link>
                  </div>

                  {rule !== 'sku' &&
                    details.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer py-2 text-xs underline">
                          Ver pendências ({details.length})
                        </summary>

                        <ul className="mt-2 space-y-3 rounded-2xl bg-[#F8F6F1] p-4">
                          {details.map((detail, index) => (
                            <li
                              key={index}
                              className="text-xs leading-relaxed"
                            >
                              <p>
                                {text(detail.reason)}
                              </p>

                              {(
                                text(detail.variant_id) ||
                                text(detail.variant_name)
                              ) && (
                                <p className="mt-1 break-words text-[#756B5D]">
                                  Variação:{' '}
                                  {text(detail.variant_name) ||
                                    text(detail.name) ||
                                    text(detail.variant_id)}

                                  {text(detail.sku)
                                    ? ` · SKU: ${text(detail.sku)}`
                                    : ''}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                  {rule === 'material' &&
                    item.material_resolved && (
                      <p className="mt-3 text-xs leading-relaxed text-[#756B5D]">
                        {item.resolved_at
                          ? `Revisado em ${savedDate(item.resolved_at)}.`
                          : 'Revisão concluída.'}

                        {item.resolution_note
                          ? ` ${item.resolution_note}`
                          : ''}
                      </p>
                    )}

                  {canResolve && (
                    <details className="mt-3">
                      <summary className="cursor-pointer py-2 text-xs underline">
                        {item.material_resolved
                          ? 'Reabrir revisão'
                          : 'Concluir revisão'}
                      </summary>

                      <form
                        action={setMaterialReviewResolved}
                        className="mt-2 rounded-2xl border border-[#E5DED3] p-4"
                      >
                        <input
                          type="hidden"
                          name="product_id"
                          value={item.product_id}
                        />

                        <input
                          type="hidden"
                          name="signature"
                          value={
                            item.material_signature || ''
                          }
                        />

                        <input
                          type="hidden"
                          name="version"
                          value={version}
                        />

                        <input
                          type="hidden"
                          name="resolved"
                          value={
                            item.material_resolved
                              ? 'false'
                              : 'true'
                          }
                        />

                        <input
                          type="hidden"
                          name="return_to"
                          value={href(rule, page)}
                        />

                        <label className="block text-xs">
                          Observação opcional

                          <input
                            name="note"
                            maxLength={500}
                            className="mt-2 min-h-[44px] w-full rounded-xl border border-[#DDD4C7] px-3 text-sm"
                            placeholder="Ex.: material conferido no cadastro"
                          />
                        </label>

                        <label className="mt-4 flex items-start gap-3 text-xs leading-relaxed">
                          <input
                            type="checkbox"
                            name="confirmed"
                            required
                            className="mt-0.5 h-4 w-4 shrink-0"
                          />

                          <span>
                            {item.material_resolved
                              ? 'Quero devolver este produto à lista de pendentes.'
                              : 'Conferi as pendências deste produto e quero registrar a revisão como resolvida.'}
                          </span>
                        </label>

                        <button className="mt-4 min-h-[44px] rounded-full bg-[#292621] px-5 text-xs text-white">
                          {item.material_resolved
                            ? 'Reabrir pendência'
                            : 'Marcar como resolvido'}
                        </button>
                      </form>
                    </details>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="p-8 text-sm text-[#756B5D]">
            {search
              ? 'Nenhum produto encontrado para essa busca.'
              : rule === 'material' &&
                  state === 'pending'
                ? 'Nenhuma revisão de material pendente.'
                : 'Nenhum produto neste filtro.'}
          </div>
        )}

        {!result.error && (
          <nav
            aria-label="Paginação da revisão"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5DED3] p-5 text-xs"
          >
            <span className="text-[#756B5D]">
              Página {page} de {pages}
            </span>

            <div className="flex gap-4">
              {page > 1 && (
                <Link
                  href={href(rule, page - 1)}
                  className="inline-flex min-h-[44px] items-center underline"
                >
                  ← Anterior
                </Link>
              )}

              {page < pages && (
                <Link
                  href={href(rule, page + 1)}
                  className="inline-flex min-h-[44px] items-center underline"
                >
                  Próxima →
                </Link>
              )}
            </div>
          </nav>
        )}
      </section>
    </main>
  )
}
