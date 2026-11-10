import Link from 'next/link'
import { redirect } from 'next/navigation'

import { adminDatabase } from '@/lib/admin-auth'
import {salesPeriod,readSalesSummary} from '@/lib/admin-sales-summary'

import {
  SALE_STATUS,
  saleMoney,
  saleDate,
} from '@/lib/admin-sales'

import {
  ORDER_WORKFLOW_LABELS,
} from '@/lib/order-workflow'

import type {
  Order,
} from '@/lib/admin-sales'

interface Props {
  searchParams?: Record<
    string,
    string | string[] | undefined
  >
}

type WorkflowOrder = Order & {
  workflow_stage: string
}

const PER_PAGE = 20

const WORKFLOW_OPTIONS: Record<string, string> = {
  ...ORDER_WORKFLOW_LABELS,
  unknown: 'Conferir situação',
}

const PAYMENT_OPTIONS: Record<string, string> = {
  ...SALE_STATUS,
  pending: 'Aguardando pagamento',
}

function text(
  value: string | string[] | undefined
): string {
  return typeof value === 'string' ? value : ''
}

function validDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return ''
  }

  const date = new Date(`${value}T00:00:00Z`)

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return ''
  }

  return value
}

function workflowClass(stage: string): string {
  if (stage === 'completed') {
    return 'border-green-200 bg-green-50 text-green-800'
  }

  if (stage === 'awaiting_dispatch') {
    return 'border-blue-200 bg-blue-50 text-blue-800'
  }

  if (stage === 'processing') {
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }

  if (stage === 'cancelled' || stage === 'refunded') {
    return 'border-red-200 bg-red-50 text-red-800'
  }

  return 'border-[#E5DED3] bg-[#F6F4EF] text-[#625A4F]'
}

export default async function OrdersPage({
  searchParams = {},
}: Props) {
  const { db } = await adminDatabase()
  const financialPeriod=salesPeriod(searchParams)
  const hasFinancialPeriod=Boolean(text(searchParams.summary_period) || text(searchParams.summary_month))

  const financialQuery=hasFinancialPeriod?new URLSearchParams({summary_period:financialPeriod.kind,summary_month:financialPeriod.month}).toString():''
  const resetFiltersHref='/admin/pedidos'+(financialQuery?'?'+financialQuery:'')

  const requestedPage = Number(text(searchParams.page))

  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 100000)
      : 1

  const requestedStatus = text(searchParams.status)

  const status = Object.prototype.hasOwnProperty.call(
    PAYMENT_OPTIONS,
    requestedStatus
  )
    ? requestedStatus
    : ''

  const requestedStage = text(searchParams.stage)

  const stage = Object.prototype.hasOwnProperty.call(
    WORKFLOW_OPTIONS,
    requestedStage
  )
    ? requestedStage
    : ''

  const requestedSource = text(searchParams.source)

  const source = ['site', 'manual'].includes(requestedSource)
    ? requestedSource
    : ''

  const search = text(searchParams.q).trim().slice(0, 100)

  const safeSearch = search
    .replace(/[^a-zA-Z0-9À-ÿ @.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const numberSearch = search.replace(/^#\s*/, '').trim()

  const orderNumber =
    /^[1-9]\d{0,14}$/.test(numberSearch) &&
    Number.isSafeInteger(Number(numberSearch))
      ? String(Number(numberSearch))
      : ''

  const from = validDate(text(searchParams.from))
  const to = validDate(text(searchParams.to))

  const invalidDate =
    Boolean(text(searchParams.from) && !from) ||
    Boolean(text(searchParams.to) && !to)

  const reversedDates = Boolean(from && to && from > to)

  function href(nextPage = 1) {
    const params = new URLSearchParams()

    if(hasFinancialPeriod){params.set('summary_period',financialPeriod.kind);params.set('summary_month',financialPeriod.month)}
    if (search) params.set('q', search)
    if (status) params.set('status', status)
    if (stage) params.set('stage', stage)
    if (source) params.set('source', source)
    if (from) params.set('from', from)
    if (to) params.set('to', to)

    if (nextPage > 1) {
      params.set('page', String(nextPage))
    }

    const queryString = params.toString()

    return (
      '/admin/pedidos' +
      (queryString ? `?${queryString}` : '')
    )
  }

  function loadList(includeJewelry: boolean) {
    let query = db
      .from(includeJewelry ? 'serenity_admin_order_search_v1' : 'serenity_admin_order_workflow')
      .select(
        'id,number,status,workflow_stage,created_at,customer_snapshot,total,source,shipping_pending',
        { count: 'exact' }
      )

    if (status) {
      query = query.eq('status', status)
    }

    if (stage) {
      query = query.eq('workflow_stage', stage)
    }

    if (source === 'site') {
      query = query.eq('source', 'site')
    }

    const logicalFilters: string[] = []

    if (source === 'manual') {
      logicalFilters.push('or(source.is.null,source.neq.site)')
    }

    if (search) {
      const searchFilters: string[] = []

      if (safeSearch) {
        searchFilters.push(
          `customer_snapshot->>name.ilike.%${safeSearch}%`,
          `customer_snapshot->>email.ilike.%${safeSearch}%`
        )
      }

      if (safeSearch && includeJewelry) searchFilters.push(`jewelry_search.ilike.%${safeSearch}%`)

      if (orderNumber) {
        searchFilters.push(`number.eq.${orderNumber}`)
      }

      if (searchFilters.length) {
        logicalFilters.push(
          `or(${searchFilters.join(',')})`
        )
      } else {
        query = query.eq('number', -1)
      }
    }

    if (logicalFilters.length) {
      query = query.or(
        `and(${logicalFilters.join(',')})`
      )
    }

    if (invalidDate || reversedDates) {
      query = query.eq('number', -1)
    } else {
      if (from) {
        query = query.gte(
          'created_at',
          `${from}T00:00:00-03:00`
        )
      }

      if (to) {
        const nextDay = new Date(
          Date.parse(`${to}T00:00:00-03:00`) +
            24 * 60 * 60 * 1000
        ).toISOString()

        query = query.lt('created_at', nextDay)
      }
    }

    return query
      .order('created_at', { ascending: false })
      .order('id')
      .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
  }

  const [initialList, summary] = await Promise.all([
    loadList(Boolean(safeSearch)),

    readSalesSummary(db,financialPeriod),
  ])

  let list = initialList
  const jewelrySearchUnavailable = Boolean(safeSearch && ['42P01', 'PGRST205'].includes(list.error?.code || ''))
  if (jewelrySearchUnavailable) list = await loadList(false)

  if (list.error?.code === 'PGRST103' && page > 1) {
    redirect(href())
  }

  if (list.error) {
    throw new Error('ADMIN_SALES_QUERY')
  }

  const stats = summary

  const orders = (
    list.data || []
  ) as unknown as WorkflowOrder[]

  const total = list.count || 0
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))

  if (page > pages) {
    redirect(href(pages))
  }

  const hasFilters = Boolean(
    search ||
    status ||
    stage ||
    source ||
    from ||
    to ||
    invalidDate
  )

  const peak = Math.max(
    1,
    ...(stats?.days || []).map(day => Number(day.total))
  )

  const points = (stats?.days || [])
    .map(
      (day, index) =>
        `${
          10 +
          (index * 780) /
            Math.max(1, (stats?.days.length || 0) - 1)
        },${
          160 - (Number(day.total) / peak) * 140
        }`
    )
    .join(' ')

  const highestDay = (stats?.days || []).every(
    day => Number(day.total) === 0
  )
    ? 0
    : peak

  const fieldClass =
    'mt-2 min-h-[44px] w-full rounded-xl border border-[#E5DED3] bg-white px-3 text-base sm:text-sm'

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">
            Vendas e pedidos
          </h1>

          <p className="mt-2 text-sm text-[#81796C]">
            Consulte os pedidos e acompanhe a próxima etapa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4"><Link
          href="/admin/pedidos/novo"
          className="rounded-full bg-[#292621] px-6 py-3 text-sm text-white"
        >
          + Novo pedido manual
        </Link>
        <Link href="/admin/historico" className="inline-flex min-h-[44px] items-center text-xs underline">Consultar pedidos do site antigo</Link></div>
      </div>

      {stats ? <details open={hasFinancialPeriod} className="mb-6 rounded-2xl border border-[#E5DED3] bg-white p-5"><summary className="cursor-pointer py-1 text-sm font-medium">Resumo financeiro e gráfico de vendas</summary><p className="mb-4 mt-2 text-xs text-[#81796C]">Indicadores e gráfico do período escolhido, no horário de Brasília. Recebimentos usam a data do pagamento; pendentes usam a data de criação. Os filtros da lista de pedidos abaixo são independentes.</p>
      <form className="mb-5 flex flex-wrap items-end gap-3">
        {Object.entries(searchParams).filter(([key,value])=>!['summary_period','summary_month'].includes(key) && typeof value==='string').map(([key,value])=><input key={key} type="hidden" name={key} value={value as string}/>)}
        <label className="text-xs">Período<select name="summary_period" defaultValue={financialPeriod.kind} className="mt-2 block min-h-[44px] rounded-xl border border-[#E5DED3] bg-white px-3 text-sm"><option value="month">Por mês</option><option value="7">Últimos 7 dias</option><option value="15">Últimos 15 dias</option></select></label>
        <label className="text-xs">Mês (na opção “Por mês”)<input type="month" name="summary_month" defaultValue={financialPeriod.month} max={financialPeriod.currentMonth} className="mt-2 block min-h-[44px] rounded-xl border border-[#E5DED3] bg-white px-3 text-sm"/></label>
        <button className="min-h-[44px] rounded-full bg-[#292621] px-5 text-sm text-white">Aplicar período</button>
        <p className="min-h-[44px] py-3 text-xs text-[#756B5D]">{financialPeriod.from.split('-').reverse().join('/')} a {financialPeriod.to.split('-').reverse().join('/')}</p>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [
            'Faturamento recebido',
            saleMoney(stats.revenue),
          ],
          [
            'Pedidos pagos no período',
            String(stats.paid),
          ],
          [
            'Margem de contribuição',
            stats.margin === null
              ? 'Custos pendentes'
              : saleMoney(stats.margin),
          ],
          [
            'Pendentes de pagamento',
            String(stats.pending),
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-3xl border border-[#E5DED3] bg-white p-5"
          >
            <p className="text-xs text-[#81796C]">
              {label}
            </p>

            <p className="mt-3 text-2xl font-medium tracking-tight">
              {value}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[#81796C]">
        Faturamento inclui o frete recebido (
        {saleMoney(stats.shipping)}).
        Margem: produtos após descontos menos custos
        das peças e despesas, sem o frete.{' '}
        {stats.missing > 0
          ? `${stats.missing} unidade(s) vendida(s) sem custo cadastrado; a margem total ainda não pode ser calculada.`
          : 'Custos e despesas são os registrados nos pedidos.'}{' '}
        Cancelados e estornos integrais não entram
        nos indicadores.
      </p>

      <section className="my-7 rounded-3xl border border-[#E5DED3] bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">
            Vendas recebidas · {financialPeriod.label}
          </h2>

          <span className="text-xs text-[#81796C]">
            Maior dia: {saleMoney(highestDay)}
          </span>
        </div>

        <svg
          viewBox="0 0 800 180"
          role="img"
          aria-label={`Faturamento diário · ${financialPeriod.label}; valores disponíveis na tabela abaixo`}
          className="mt-5 h-44 w-full sm:h-52"
          preserveAspectRatio="none"
        >
          <path
            d="M10 160H790"
            stroke="#E5DED3"
          />

          <polygon
            points={`10,160 ${points} 790,160`}
            fill="#F0E7DA"
          />

          <polyline
            points={points}
            fill="none"
            stroke="#947B57"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="flex justify-between text-xs text-[#81796C]">
          <span>
            {stats.days[0]?.day
              .split('-')
              .reverse()
              .join('/')}
          </span>

          <span>
            {stats.days[stats.days.length - 1]?.day
              .split('-')
              .reverse()
              .join('/')}
          </span>
        </div>

        <details className="mt-4 text-xs">
          <summary className="cursor-pointer text-[#756B5D]">
            Ver valores diários
          </summary>

          <div className="mt-3 max-h-48 overflow-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Recebido</th>
                </tr>
              </thead>

              <tbody>
                {stats.days.map(day => (
                  <tr key={day.day}>
                    <th
                      scope="row"
                      className="py-1 font-normal"
                    >
                      {day.day
                        .split('-')
                        .reverse()
                        .join('/')}
                    </th>

                    <td>
                      {saleMoney(day.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      </details> : <p className="mb-5 text-xs text-[#81796C]">Resumo financeiro indisponível no momento. A lista de pedidos continua disponível.</p>}

      <section className="overflow-hidden rounded-3xl border border-[#E5DED3] bg-white">
        <div className="border-b border-[#E5DED3] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">
              Pedidos registrados
            </h2>

            <span className="text-xs text-[#81796C]">
              {total}{' '}
              {total === 1
                ? 'pedido encontrado'
                : 'pedidos encontrados'}
            </span>
          </div>

          <form
            key={href()}
            method="get"
            action="/admin/pedidos"
            className="mt-5"
          >
          {hasFinancialPeriod && <><input type="hidden" name="summary_period" value={financialPeriod.kind}/><input type="hidden" name="summary_month" value={financialPeriod.month}/></>}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-[#756B5D]">
                Buscar pedido, cliente ou joia

                <input
                  name="q"
                  defaultValue={search}
                  maxLength={100}
                  placeholder="Pedido, cliente, e-mail, nome ou código da joia"
                  className={fieldClass}
                />
              </label>

              <label className="text-xs text-[#756B5D]">
                Andamento

                <select
                  name="stage"
                  defaultValue={stage}
                  className={fieldClass}
                >
                  <option value="">
                    Todos os andamentos
                  </option>

                  {Object.entries(WORKFLOW_OPTIONS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </label>

            </div>
            <details open={Boolean(status || source || from || to || invalidDate)} className="mt-4 rounded-xl border border-[#E5DED3] p-4"><summary className="cursor-pointer py-1 text-xs font-medium text-[#625A4F]">Mais filtros: pagamento, origem e período</summary><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs text-[#756B5D]">
                Pagamento

                <select
                  name="status"
                  defaultValue={status}
                  className={fieldClass}
                >
                  <option value="">
                    Todos os pagamentos
                  </option>

                  {Object.entries(PAYMENT_OPTIONS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="text-xs text-[#756B5D]">
                Origem

                <select
                  name="source"
                  defaultValue={source}
                  className={fieldClass}
                >
                  <option value="">
                    Todas as origens
                  </option>

                  <option value="site">
                    Site
                  </option>

                  <option value="manual">
                    Pedido manual
                  </option>
                </select>
              </label>

              <label className="text-xs text-[#756B5D]">
                Criado a partir de

                <input
                  type="date"
                  name="from"
                  defaultValue={from}
                  className={fieldClass}
                />
              </label>

              <label className="text-xs text-[#756B5D]">
                Criado até

                <input
                  type="date"
                  name="to"
                  defaultValue={to}
                  className={fieldClass}
                />
              </label>
            </div>

            </details>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                type="submit"
                className="min-h-[44px] rounded-full bg-[#292621] px-6 py-3 text-xs text-white"
              >
                Buscar e filtrar
              </button>

              {hasFilters && (
                <Link
                  href={resetFiltersHref}
                  className="text-xs text-[#756B5D] underline"
                >
                  Limpar filtros
                </Link>
              )}
            </div>

            <details className="mt-3 text-[11px] leading-6 text-[#81796C]"><summary className="cursor-pointer">Como interpretar os filtros</summary><p>Andamento acompanha a preparação e o envio; pagamento indica a situação financeira. O período usa a data de criação do pedido no horário de Brasília.</p></details>

            {(invalidDate || reversedDates) && (
              <p
                role="alert"
                className="mt-3 text-xs text-red-700"
              >
                {reversedDates
                  ? 'A data inicial não pode ser posterior à data final.'
                  : 'Informe datas válidas para filtrar os pedidos.'}
              </p>
            )}
          </form>
        </div>

        {jewelrySearchUnavailable && <p role="status" className="border-b border-[#EEE8DE] bg-[#F8F5F0] px-5 py-4 text-xs leading-6">A busca por joia aguarda a instalação do SQL de busca de pedidos. A pesquisa por pedido e cliente continua disponível.</p>}

        {orders.map(order => (
          <Link
            key={order.id}
            href={`/admin/pedidos/${order.id}`}
            className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EEE8DE] px-5 py-5 hover:bg-[#FCFBF8]"
          >
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">
                #{order.number} ·{' '}
                {order.customer_snapshot.name}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] ${
                    workflowClass(order.workflow_stage)
                  }`}
                >
                  {WORKFLOW_OPTIONS[order.workflow_stage] ||
                    'Conferir situação'}
                </span>

                {!((order.status==='pending' && order.workflow_stage==='awaiting_payment') || order.status===order.workflow_stage && ['cancelled','refunded'].includes(order.status)) && <span className="text-[11px] text-[#81796C]">
                  Pagamento:{' '}
                  {PAYMENT_OPTIONS[order.status] ||
                    'Conferir'}
                </span>}
              </div>

              <p className="mt-2 text-xs text-[#81796C]">
                {saleDate(order.created_at)}
                {' · '}
                {order.source === 'site'
                  ? 'Site'
                  : 'Manual'}

                {order.shipping_pending
                  ? ' · Frete a confirmar'
                  : ''}
              </p>
            </div>

            <span className="shrink-0 text-sm font-medium">
              {saleMoney(order.total)}
              <span className="mt-2 block text-right text-xs font-normal underline">Ver pedido →</span>
            </span>
          </Link>
        ))}

        {!orders.length && (
          <div className="p-10 text-center">
            <p className="text-sm text-[#81796C]">
              {invalidDate || reversedDates
                ? 'Corrija o período para consultar os pedidos.'
                : hasFilters
                  ? 'Nenhum pedido corresponde aos filtros escolhidos.'
                  : 'Nenhum pedido registrado.'}
            </p>

            {hasFilters && (
              <Link
                href={resetFiltersHref}
                className="mt-4 inline-block text-xs underline"
              >
                Ver todos os pedidos
              </Link>
            )}
          </div>
        )}

        <nav
          aria-label="Paginação de pedidos"
          className="flex flex-wrap items-center justify-between gap-3 p-5 text-xs"
        >
          <span>
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
      </section>


    </main>
  )
}
