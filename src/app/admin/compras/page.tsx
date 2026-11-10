import Link from 'next/link'
import type { Metadata } from 'next'
import { adminDatabase } from '@/lib/admin-auth'
import ProcurementLineForm from '@/components/admin/ProcurementLineForm'
import {
  PROCUREMENT_TABS,
  GROUP_FIELDS,
  procurementTab,
  procurementSearch,
  procurementQuery,
  procurementHref,
} from '@/lib/admin-procurement'
import type {
  ProcurementGroup,
  ProcurementLine,
} from '@/lib/admin-procurement'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Compras do fornecedor',
  robots: { index: false, follow: false },
}

interface Props {
  searchParams?: Record<
    string,
    string | string[] | undefined
  >
}

const first = (
  value: string | string[] | undefined
) =>
  Array.isArray(value)
    ? value[0] || ''
    : value || ''

const positive = (value: string) =>
  Number.isSafeInteger(Number(value)) &&
  Number(value) > 0
    ? Math.min(Number(value), 100000)
    : 1

const button =
  'inline-flex min-h-[44px] items-center justify-center rounded-full border border-[#DDD4C7] bg-white px-5 text-xs'

function Details({
  item,
}: {
  item: {
    variation: string
    sku: string
    supplier: string
    anodization: string
    voltage: string
  }
}) {
  return (
    <div className="mt-2 space-y-1 text-xs leading-6 text-[#625B51]">
      {item.variation && (
        <p>Variação: {item.variation}</p>
      )}

      <p>
        SKU: {item.sku || 'Não informado'}
        {' · '}
        {item.supplier}
      </p>

      {item.anodization && (
        <p>Anodização: {item.anodization}</p>
      )}

      {item.voltage && (
        <p>Voltagem: {item.voltage}</p>
      )}
    </div>
  )
}

export default async function ProcurementPage({
  searchParams = {},
}: Props) {
  const { db } = await adminDatabase()

  const tab = procurementTab(first(searchParams.aba))
  const search = procurementSearch(first(searchParams.q))

  let page = positive(first(searchParams.page))
  let itemPage = positive(first(searchParams.itens))

  const groupId = /^[a-f0-9]{64}$/.test(
    first(searchParams.grupo)
  )
    ? first(searchParams.grupo)
    : ''

  const size = 10
  const reviewing = tab === 'conferir'

  async function read(current: number) {
    let query = procurementQuery(db, tab, search)

    query = reviewing
      ? query.order('order_number').order('line_number')
      : query
          .order('supplier')
          .order('product_name')
          .order('group_id')

    return query.range(
      (current - 1) * size,
      current * size - 1
    )
  }

  const [counts, initial, detail] = await Promise.all([
    Promise.all(
      PROCUREMENT_TABS.map(item =>
        procurementQuery(db, item.value, '', true)
      )
    ),

    read(page),

    groupId
      ? db
          .from('serenity_admin_procurement_summary_v1')
          .select(GROUP_FIELDS + ',orders')
          .eq('group_id', groupId)
          .maybeSingle()
      : Promise.resolve({
          data: null,
          error: null,
        }),
  ])

  let result = initial
  let total = result.count ?? 0
  let pages = Math.max(1, Math.ceil(total / size))

  if (!result.error && page > pages) {
    page = pages
    result = await read(page)
    total = result.count ?? 0
    pages = Math.max(1, Math.ceil(total / size))
  }

  const groups = reviewing
    ? []
    : (result.data || []) as unknown as ProcurementGroup[]

  const lines = reviewing
    ? (result.data || []) as unknown as ProcurementLine[]
    : []

  const selected =
    detail.data as unknown as ProcurementGroup | null

  const references = Array.isArray(selected?.orders)
    ? selected!.orders!
    : []

  const itemPages = Math.max(
    1,
    Math.ceil(references.length / size)
  )

  itemPage = Math.min(itemPage, itemPages)

  const exportQuery = new URLSearchParams({
    aba: tab,
    q: search,
  })

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium">
            Compras do fornecedor
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#625B51]">
            Peças de pedidos pagos, agrupadas por produto,
            variação e fornecedor. Registre o que já pediu
            e recebeu para evitar compras duplicadas.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={procurementHref(
              tab,
              search,
              page,
              groupId,
              itemPage
            )}
            className={button}
          >
            Atualizar lista
          </a>

          <a
            href={`/admin/compras/exportar?${exportQuery}`}
            className={button}
          >
            Baixar planilha CSV
          </a>
        </div>
      </div>

      <nav
        aria-label="Situação das compras"
        className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {PROCUREMENT_TABS.map((item, index) => (
          <Link
            key={item.value}
            href={procurementHref(item.value, search)}
            aria-current={
              tab === item.value ? 'page' : undefined
            }
            className={`rounded-2xl border p-5 ${
              tab === item.value
                ? 'border-[#292621] bg-[#292621] text-white'
                : 'border-[#E5DED3] bg-white'
            }`}
          >
            <span className="text-sm">{item.label}</span>

            <strong className="mt-3 block text-3xl font-medium">
              {counts[index].error
                ? '—'
                : counts[index].count ?? 0}
            </strong>

            <span className="mt-2 block text-xs">
              {item.value === 'conferir'
                ? 'Itens de pedidos'
                : 'Tipos de peça'}
            </span>
          </Link>
        ))}
      </nav>

      {counts.some(item => item.error) && (
        <p
          role="alert"
          className="mt-4 text-sm text-red-700"
        >
          Não foi possível carregar todos os totais.
        </p>
      )}

      <section className="mt-6 overflow-hidden rounded-3xl border border-[#E5DED3] bg-white">
        <div className="border-b border-[#E5DED3] p-5">
          <form
            action="/admin/compras"
            method="get"
            className="flex flex-wrap items-end gap-3"
          >
            <input type="hidden" name="aba" value={tab} />

            <label className="min-w-0 flex-1 text-xs">
              Buscar peça, SKU ou fornecedor

              <input
                name="q"
                defaultValue={search}
                maxLength={80}
                className="mt-2 min-h-[44px] w-full rounded-xl border border-[#DDD4C7] px-3 text-sm"
              />
            </label>

            <button className={button}>Buscar</button>

            {search && (
              <Link
                href={procurementHref(tab)}
                className={button}
              >
                Limpar busca
              </Link>
            )}
          </form>
        </div>

        {reviewing && (
          <p className="border-b border-[#E5DED3] bg-amber-50 p-5 text-xs leading-6 text-amber-900">
            Os pedidos anteriores à implantação precisam
            de conferência. Informe o que já foi comprado
            ou recebido. Itens alterados, removidos ou de
            pedidos cancelados ficam separados e não
            entram na planilha A comprar.
          </p>
        )}

        {result.error ? (
          <p
            role="alert"
            className="p-6 text-sm text-red-700"
          >
            Não foi possível carregar a lista.
            Atualize a página.
          </p>
        ) : !groups.length && !lines.length ? (
          <p className="p-6 text-sm text-[#625B51]">
            Nenhum item nesta lista ou busca no momento.
          </p>
        ) : (
          <ul className="divide-y divide-[#EEE8DE]">
            {groups.map(item => (
              <li
                key={item.group_id}
                className="p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words text-base font-medium">
                      {item.product_name}
                    </h2>

                    <Details item={item} />

                    <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-xs">
                      <div>
                        <dt>A comprar</dt>
                        <dd className="mt-1 text-lg font-medium">
                          {item.to_order}
                        </dd>
                      </div>
                      <div>
                        <dt>A receber</dt>
                        <dd className="mt-1 text-lg font-medium">
                          {item.to_receive}
                        </dd>
                      </div>
                      <div>
                        <dt>Já recebido</dt>
                        <dd className="mt-1 text-lg font-medium">
                          {item.received}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <Link
                    href={procurementHref(
                      tab,
                      search,
                      page,
                      item.group_id
                    )}
                    className={button}
                    scroll={false}
                  >
                    Conferir pedidos →
                  </Link>
                </div>
              </li>
            ))}

            {lines.map(item => (
              <li
                key={`${item.order_id}:${item.line_number}:${item.version}:${item.signature}`}
                className="p-5 sm:p-6"
              >
                <Link
                  href={`/admin/pedidos/${item.order_id}`}
                  className="text-xs underline"
                >
                  Pedido #{item.order_number}
                </Link>

                <h2 className="mt-2 text-base font-medium">
                  {item.product_name}
                </h2>

                <Details item={item} />

                <p className="mt-3 text-xs leading-6 text-amber-900">
                  {item.review_reason}
                </p>

                {item.order_status === 'paid' &&
                item.version === 0 &&
                item.quantity > 0 &&
                item.line_number <= 500 &&
                /^[a-f0-9]{64}$/.test(item.signature || '') ? (
                  <ProcurementLineForm
                    orderId={item.order_id}
                    lineNumber={item.line_number}
                    signature={item.signature}
                    quantity={item.quantity}
                    ordered={item.ordered}
                    received={item.received}
                    version={item.version}
                    historical
                  />
                ) : (
                  <p className="mt-3 text-xs leading-6 text-[#625B51]">
                    Já pedido: {item.ordered}
                    {' · '}
                    Recebido: {item.received}.
                    Confira o pedido e as compras
                    anteriores; não compre novamente
                    para resolver esta pendência.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {!result.error && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5DED3] p-5 text-xs">
            <p>
              {total} registro(s) · Página {page} de {pages}
            </p>

            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={procurementHref(
                    tab,
                    search,
                    page - 1
                  )}
                  className={button}
                >
                  Anterior
                </Link>
              )}

              {page < pages && (
                <Link
                  href={procurementHref(
                    tab,
                    search,
                    page + 1
                  )}
                  className={button}
                >
                  Próxima
                </Link>
              )}
            </div>
          </div>
        )}
      </section>

      {groupId && (
        <section
          id="pedidos-da-peca"
          className="mt-6 rounded-3xl border border-[#E5DED3] bg-white p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">
              Pedidos desta peça
            </h2>

            <Link
              href={procurementHref(tab, search, page)}
              className={button}
              scroll={false}
            >
              Fechar detalhes
            </Link>
          </div>

          {detail.error ? (
            <p
              role="alert"
              className="mt-4 text-sm text-red-700"
            >
              Não foi possível carregar os pedidos
              desta peça.
            </p>
          ) : !selected ? (
            <p className="mt-4 text-sm">
              Esta peça não está mais disponível neste
              agrupamento. Atualize a lista.
            </p>
          ) : (
            <>
              <h3 className="mt-4 text-base font-medium">
                {selected.product_name}
              </h3>

              <Details item={selected} />

              <ul className="mt-4 divide-y divide-[#EEE8DE]">
                {references
                  .slice(
                    (itemPage - 1) * size,
                    itemPage * size
                  )
                  .map(item => (
                    <li
                      key={`${item.order_id}:${item.line_number}:${item.version}:${item.signature}`}
                      className="py-5"
                    >
                      <Link
                        href={`/admin/pedidos/${item.order_id}`}
                        className="text-sm font-medium underline"
                      >
                        Pedido #{item.order_number}
                        {' · '}
                        item {item.line_number}
                      </Link>

                      <ProcurementLineForm
                        orderId={item.order_id}
                        lineNumber={item.line_number}
                        signature={item.signature}
                        quantity={item.quantity}
                        ordered={item.ordered}
                        received={item.received}
                        version={item.version}
                      />
                    </li>
                  ))}
              </ul>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <p>
                  Página {itemPage} de {itemPages}
                </p>

                <div className="flex gap-2">
                  {itemPage > 1 && (
                    <Link
                      href={procurementHref(
                        tab,
                        search,
                        page,
                        groupId,
                        itemPage - 1
                      )}
                      className={button}
                      scroll={false}
                    >
                      Anterior
                    </Link>
                  )}

                  {itemPage < itemPages && (
                    <Link
                      href={procurementHref(
                        tab,
                        search,
                        page,
                        groupId,
                        itemPage + 1
                      )}
                      className={button}
                      scroll={false}
                    >
                      Próxima
                    </Link>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      <p className="mt-4 text-xs leading-6 text-[#625B51]">
        Salvar quantidades registra o controle interno.
        Não envia compras ao fornecedor, não altera o
        estoque e não confirma o envio ao cliente.
      </p>
    </main>
  )
}
