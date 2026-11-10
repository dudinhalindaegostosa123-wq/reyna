import Link from 'next/link'
import type { Metadata } from 'next'
import { adminDatabase } from '@/lib/admin-auth'
import { labelQueueFilter, labelListErrorReference } from '@/lib/label-center'
import LabelBatchList from '@/components/admin/LabelBatchList'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Etiquetas | Administração',
  robots: { index: false, follow: false },
}

const STAGES = [
  { value: 'to_buy', title: 'Precisam de etiqueta' },
  { value: 'purchased', title: 'Compradas' },
  { value: 'shipped', title: 'Enviadas' },
  { value: 'review', title: 'Precisam de atenção' },
  { value: 'unverified', title: 'Antigas: etiqueta não conferida' },
] as const

interface LabelRow {
  order_id: string
  order_number: number
  created_at: string
  customer_name: string
  shipping_pending: boolean
  company: string
  service: string
  job_state: string
  purchase_phase: string
  label_stage: string
  next_action: string
  tracking_code: string
  stage_message: string
  source_kind?: 'current' | 'legacy'
  legacy_id?: number | null
  legacy_intent?: string | null
}

interface Props {
  searchParams?: Record<
    string,
    string | string[] | undefined
  >
}

function first(
  value: string | string[] | undefined
): string {
  return Array.isArray(value)
    ? value[0] || ''
    : value || ''
}

function href(
  stage: string,
  search: string,
  page = 1,
  filter = 'all'
): string {
  const query = new URLSearchParams({ etapa: stage })

  if (search) query.set('q', search)
  if (stage === 'to_buy' && filter !== 'all') query.set('filtro', filter)
  if (page > 1) query.set('page', String(page))

  return '/admin/etiquetas?' + query.toString()
}

export default async function LabelsPage({
  searchParams = {},
}: Props) {
  const { db } = await adminDatabase()

  const selected = first(searchParams.etapa)

  const stage =
    STAGES.find(item => item.value === selected) ||
    STAGES[0]

  const filter = labelQueueFilter(first(searchParams.filtro))

  const search = first(searchParams.q)
    .slice(0, 80)
    .replace(/[^a-zA-Z0-9À-ÿ .-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const requested = Number(first(searchParams.page))

  let page =
    Number.isSafeInteger(requested) && requested > 0
      ? requested
      : 1

  const size = 20
  const searchProbe = await db.from('serenity_admin_label_center_v3').select('order_id', { count: 'exact', head: true })
  let jewelrySearchInstalled = !searchProbe.error
  const probe = jewelrySearchInstalled ? searchProbe : await db.from('serenity_admin_label_center_v2').select('order_id', { count: 'exact', head: true })
  const legacyInstalled = !probe.error
  const baseView = legacyInstalled ? 'serenity_admin_label_center_v2' : 'serenity_admin_label_center_v1'
  let centerView = jewelrySearchInstalled && search ? 'serenity_admin_label_center_v3' : baseView
  let jewelrySearchFailed = false

  async function readPage(current: number) {
    let query = db
      .from(centerView)
      .select(
        'order_id,order_number,created_at,customer_name,shipping_pending,company,service,job_state,purchase_phase,label_stage,next_action,tracking_code,stage_message' + (legacyInstalled ? ',source_kind,legacy_id,legacy_intent' : ''),
        { count: 'exact' }
      )
      .eq('label_stage', stage.value)

    const conditions: string[] = []
    if (stage.value === 'to_buy' && filter === 'ready') query = query.eq('job_state', 'prepared').eq('shipping_pending', false)
    if (stage.value === 'to_buy' && filter === 'prepare') conditions.push('or(job_state.neq.prepared,shipping_pending.eq.true)')

    if (search) {
      const number = /^\d+$/.test(search)
        ? Number(search)
        : NaN

      const matches = [`customer_name.ilike.*${search}*`]
      if (Number.isSafeInteger(number) && number > 0) matches.unshift(`order_number.eq.${number}`)
      if (centerView === 'serenity_admin_label_center_v3') matches.push(`jewelry_search.ilike.*${search}*`)
      conditions.push(`or(${matches.join(',')})`)
    }

    if (conditions.length) query = query.or(`and(${conditions.join(',')})`)

    return query
      .order('created_at', { ascending: true })
      .order('order_id', { ascending: true })
      .range(
        (current - 1) * size,
        current * size - 1
      )
  }

  let result = await readPage(page)
  if (result.error && centerView === 'serenity_admin_label_center_v3') {
    jewelrySearchInstalled = false
    jewelrySearchFailed = true
    centerView = baseView
    result = await readPage(page)
  }
  let total = result.count ?? 0
  let pages = Math.max(1, Math.ceil(total / size))

  if (!result.error && page > pages) {
    page = pages
    result = await readPage(page)
    total = result.count ?? 0
    pages = Math.max(1, Math.ceil(total / size))
  }

  const counts = await Promise.all(
    STAGES.map(item =>
      db
        .from(baseView)
        .select('order_id', {
          count: 'exact',
          head: true,
        })
        .eq('label_stage', item.value)
    )
  )

  const rows = (result.data || []) as unknown as LabelRow[]

  const countsError = counts.some(
    item => Boolean(item.error)
  )

  const button =
    'inline-flex min-h-[44px] items-center justify-center rounded-full border border-[#DDD4C7] bg-white px-5 text-xs'

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-[#625B51]">
            Envios
          </p>

          <h1 className="mt-2 text-3xl font-medium">
            Etiquetas
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#625B51]">
            Tudo para enviar seus pedidos: veja quem precisa de etiqueta,
            prepare os envios e compre sem sair desta central.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={href(stage.value, search, page, filter)}
            className={button}
          >
            Atualizar lista
          </a>

          <Link
            href="/admin/frete"
            className={button}
          >
            Configurações de envio
          </Link>
        </div>
      </div>

      {!legacyInstalled && <p className="mt-5 rounded-xl border border-[#E5DED3] bg-white p-4 text-xs leading-6">Pedidos antigos: a integração de etiquetas ainda precisa ser instalada no Supabase. Os pedidos novos continuam disponíveis abaixo.</p>}
      <ol aria-label="Como comprar etiquetas" className="mt-6 grid gap-3 rounded-2xl bg-[#F4EFE7] p-5 text-sm sm:grid-cols-3">
        <li><strong>1. Prepare os envios</strong><p className="mt-1 text-xs leading-6 text-[#625B51]">Complete endereço e embalagem nos pedidos com pendências.</p></li>
        <li><strong>2. Confira e compre</strong><p className="mt-1 text-xs leading-6 text-[#625B51]">Selecione as etiquetas prontas, confira o total e confirme a compra.</p></li>
        <li><strong>3. Imprima e poste</strong><p className="mt-1 text-xs leading-6 text-[#625B51]">Abra “Compradas” para gerar e imprimir. Depois, entregue à transportadora.</p></li>
      </ol>
      <nav
        aria-label="Situação das etiquetas"
        className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-5"
      >
        {STAGES.map((item, index) => (
          <Link
            key={item.value}
            href={href(item.value, search)}
            aria-current={
              item.value === stage.value
                ? 'page'
                : undefined
            }
            className={`rounded-2xl border p-5 ${
              item.value === stage.value
                ? 'border-[#292621] bg-[#292621] text-white'
                : 'border-[#E5DED3] bg-white'
            }`}
          >
            <span className="text-sm">
              {item.title}
            </span>

            <strong className="mt-3 block text-3xl font-medium">
              {counts[index].error
                ? '—'
                : counts[index].count ?? 0}
            </strong>

            {item.value === 'to_buy' && <span className="mt-2 block text-xs">Comece por aqui</span>}
            {item.value === 'purchased' && (
              <span className="mt-2 block text-xs">
                Aguardando geração ou postagem
              </span>
            )}

            {item.value === 'shipped' && (
              <span className="mt-2 block text-xs">
                Postadas ou entregues
              </span>
            )}

            {item.value === 'unverified' && <span className="mt-2 block text-xs">Confira antes de comprar outra etiqueta</span>}
            {item.value === 'review' && (
              <span className="mt-2 block text-xs">
                Precisam de conferência
              </span>
            )}
          </Link>
        ))}
      </nav>

      {countsError && (
        <p
          role="alert"
          className="mt-4 text-sm text-red-700"
        >
          Não foi possível carregar todos os totais.
          Atualize a lista.
        </p>
      )}

      <section className="mt-6 overflow-hidden rounded-3xl border border-[#E5DED3] bg-white">
        <div className="border-b border-[#E5DED3] p-5 sm:p-6">
          <h2 className="text-lg font-medium">
            {stage.title}
          </h2>

          {stage.value === 'to_buy' && <nav aria-label="Filtrar pendências de etiquetas" className="mt-4 flex flex-wrap gap-2">
            {[{ value: 'all', title: 'Todos os pendentes' }, { value: 'prepare', title: 'Falta preparar' }, { value: 'ready', title: 'Prontos para comprar' }].map(item => <Link key={item.value} href={href(stage.value, search, 1, item.value)} aria-current={filter === item.value ? 'page' : undefined} className={`${button} ${filter === item.value ? '!border-[#292621] !bg-[#292621] text-white' : ''}`}>{item.title}</Link>)}
          </nav>}
          <form
            action="/admin/etiquetas"
            method="get"
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <input
              type="hidden"
              name="etapa"
              value={stage.value}
            />

            {stage.value === 'to_buy' && <input type="hidden" name="filtro" value={filter} />}
            <label className="min-w-0 flex-1 text-xs text-[#625B51]">
              {jewelrySearchInstalled ? 'Buscar pedido, cliente ou código da joia' : 'Buscar pedido ou cliente'}

              <input
                name="q"
                defaultValue={search}
                maxLength={80}
                placeholder={jewelrySearchInstalled ? 'Pedido, nome ou código — ex.: TN623' : 'Número do pedido ou nome'}
                className="mt-2 min-h-[44px] w-full rounded-xl border border-[#DDD4C7] px-3 text-sm"
              />
            </label>

            <button
              type="submit"
              className={button}
            >
              Buscar
            </button>

            {search && (
              <Link
                href={href(stage.value, '', 1, filter)}
                className={button}
              >
                Limpar busca
              </Link>
            )}
          </form>

          {jewelrySearchFailed && <p role="alert" className="mt-3 text-xs leading-6 text-amber-900">A busca por código da joia está temporariamente indisponível. Nesta consulta, somente número do pedido e nome do cliente foram pesquisados.</p>}
          {!jewelrySearchInstalled && !jewelrySearchFailed && <p className="mt-3 text-xs leading-6 text-[#625B51]">A busca por código da joia precisa ser habilitada com o SQL desta etapa no Supabase.</p>}
          <p className="mt-3 text-xs text-[#625B51]">
            Os totais acima consideram toda a lista;
            a busca filtra os pedidos abaixo.
          </p>
        </div>

        {result.error ? (
          <p
            role="alert"
            className="p-6 text-sm text-red-700"
          >
            Não foi possível carregar os pedidos.
            Referência: {labelListErrorReference(result.error)}.
          </p>
        ) : (
          <LabelBatchList
            key={`${stage.value}:${search}:${page}:${filter}`}
            rows={rows}
            stage={stage.value}
          />
        )}

        {!result.error && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5DED3] p-5 text-xs text-[#625B51]">
            <p>
              {total} pedido(s) · Página {page} de {pages}
            </p>

            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={href(
                    stage.value,
                    search,
                    page - 1,
                    filter
                  )}
                  className={button}
                >
                  Anterior
                </Link>
              )}

              {page < pages && (
                <Link
                  href={href(
                    stage.value,
                    search,
                    page + 1,
                    filter
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

      <p className="mt-4 text-xs leading-6 text-[#625B51]">
        O pagamento das etiquetas usa o saldo do Melhor Envio.
        A postagem só acontece quando você entrega o pacote à transportadora.
      </p>
    </main>
  )
}
