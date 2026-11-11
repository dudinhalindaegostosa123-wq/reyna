import Link from 'next/link'
import {checkoutPhone} from '@/lib/checkout-contact'
import OrderItemDetails from '@/components/admin/OrderItemDetails'
import { notFound } from 'next/navigation'

import QuickLabelFlow from '@/components/admin/QuickLabelFlow'
import LabelPreparation from '@/components/admin/LabelPreparation'
import OrderStock from '@/components/admin/OrderStock'
import OrderOrigin from '@/components/admin/OrderOrigin'
import OrderDispatch from '@/components/admin/OrderDispatch'

import { loadLabelJobView } from '@/lib/label-cart-server'
import { loadLabelPreparation } from '@/lib/label-draft-server'
import { adminDatabase } from '@/lib/admin-auth'
import { getOrderWorkflow } from '@/lib/order-workflow'

import {
  saleUuid,
  saleMoney,
  saleDate,
  SALE_STATUS,
} from '@/lib/admin-sales'

import type { Order } from '@/lib/admin-sales'
import OrderStatus from '../OrderStatus'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Props {
  params: {
    id: string
  }
}

type DetailOrder = Order & {
  stock_state: string
  stock_reserved_until: string | null
  stock_untracked: number
  updated_at: string
  shipping_details?: unknown
}

interface ShippingDetails {
  company?: string
  service?: string
  days?: number | null
  preparation_days?: number
}

const trackingLabels: Record<string, string> = {
  pending: 'Etiqueta aguardando pagamento',
  released: 'Etiqueta paga',
  generated: 'Etiqueta gerada',
  received: 'Recebimento registrado no Melhor Envio',
  posted: 'Postado',
  delivered: 'Entregue',
  undelivered: 'Entrega não concluída',
  suspended: 'Envio suspenso',
  paused: 'Envio pausado',
  canceled: 'Etiqueta cancelada',
  cancelled: 'Etiqueta cancelada',
  expired: 'Etiqueta expirada',
}

function savedDate(value: unknown): string | null {
  return typeof value === 'string' &&
    Number.isFinite(Date.parse(value))
    ? value
    : null
}

function trackingLabel(value: unknown): string {
  const status =
    typeof value === 'string'
      ? value.trim().toLowerCase()
      : ''

  return Object.prototype.hasOwnProperty.call(
    trackingLabels,
    status
  )
    ? trackingLabels[status]
    : 'Aguardando atualização'
}

export default async function OrderDetail({
  params,
}: Props) {
  const { db } = await adminDatabase()

  if (!saleUuid(params.id)) notFound()

  const { data, error } = await db
    .from('serenity_orders')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (error) throw new Error('ADMIN_ORDER_QUERY')
  if (!data) notFound()

  const order = data as DetailOrder

  // A new store can receive orders before optional label purchasing is installed.
  const labels = await db.from('serenity_label_jobs').select('order_id').limit(0)
  if (labels.error && ['42P01', 'PGRST205'].includes(labels.error.code)) {
    return <main className="mx-auto max-w-4xl px-5 py-8">
      <Link href="/admin/pedidos" className="text-sm underline">Voltar aos pedidos</Link>
      <h1 className="mt-5 text-3xl font-medium">Pedido #{order.number}</h1>
      <p className="mt-3">{SALE_STATUS[order.status] || order.status} · {saleMoney(order.total)} · {saleDate(order.created_at)}</p>
      <section className="mt-6 rounded-2xl bg-white p-5">
        <h2 className="font-medium">Cliente</h2>
        <p className="mt-2">{order.customer_snapshot.name}</p>
        <p>{order.customer_snapshot.email} · {order.customer_snapshot.phone}</p>
        {order.delivery_address && <p className="mt-3 text-sm">{Object.values(order.delivery_address).filter(Boolean).join(' · ')}</p>}
      </section>
      <section className="mt-5 divide-y rounded-2xl bg-white px-5">
        {order.items.map((item, index) => <OrderItemDetails key={index} item={item} index={index} />)}
      </section>
      <p className="mt-5 text-sm">Estoque: {order.stock_state === 'debited' ? 'baixa registrada' : order.stock_state}.</p>
      <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm">A emissão de etiquetas ainda precisa ser configurada. O pedido e seu pagamento continuam registrados.</p>
      <Link href="/admin/pagamentos" className="mt-4 inline-block underline">Conferir pagamentos</Link>
    </main>
  }
  if (labels.error) throw new Error('LABEL_JOB_QUERY')

  const [
    stockResult,
    purchaseResult,
    dispatchResult,
    trackingResult,
    labelPreparation,
    labelOperations,
  ] = await Promise.all([
    db
      .from('serenity_stock_events')
      .select('id,kind,changes,created_at')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(100),

    db
      .from('serenity_label_purchases')
      .select('phase,carrier_status,remote_id,operation')
      .eq('order_id', order.id)
      .maybeSingle(),

    db
      .from('serenity_order_dispatches')
      .select('remote_id,dispatched_at')
      .eq('order_id', order.id)
      .maybeSingle(),

    db
      .from('serenity_shipment_tracking')
      .select(
        'remote_id,tracking_code,carrier_status,sync_state,last_checked_at,events'
      )
      .eq('order_id', order.id)
      .maybeSingle(),

    loadLabelPreparation(db, order),
    loadLabelJobView(db, order.id),
  ])

  if (stockResult.error) {
    throw new Error('ADMIN_STOCK_QUERY')
  }

  const shipmentPrepared =
    labelOperations.state === 'prepared'

  const remoteId = String(
    labelOperations.remoteId || ''
  )

  const purchaseMatches = Boolean(
    !purchaseResult.error &&
    shipmentPrepared &&
    saleUuid(remoteId) &&
    String(
      purchaseResult.data?.remote_id || ''
    ).toLowerCase() === remoteId.toLowerCase() &&
    labelOperations.operation &&
    String(
      purchaseResult.data?.operation || ''
    ) === labelOperations.operation
  )

  const shipmentLinkMismatch = Boolean(
    purchaseResult.data && !purchaseMatches
  )

  const tracking = trackingResult.data

  const trackingMatches = Boolean(
    !trackingResult.error &&
    purchaseMatches &&
    tracking &&
    String(
      tracking.remote_id || ''
    ).toLowerCase() === remoteId.toLowerCase()
  )

  const trackingCode =
    trackingMatches &&
    typeof tracking?.tracking_code === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(
      tracking.tracking_code
    )
      ? tracking.tracking_code
      : ''

  const lastChecked = trackingMatches
    ? savedDate(tracking?.last_checked_at)
    : null

  const trackingEvents =
    trackingMatches && Array.isArray(tracking?.events)
      ? (tracking.events as unknown[])
          .flatMap(value => {
            if (
              !value ||
              typeof value !== 'object' ||
              Array.isArray(value)
            ) {
              return []
            }

            const event =
              value as Record<string, unknown>

            const date = savedDate(event.observed_at)

            const status =
              typeof event.status === 'string'
                ? event.status
                : ''

            return date &&
              Object.prototype.hasOwnProperty.call(
                trackingLabels,
                status
              )
              ? [{ date, status }]
              : []
          })
          .sort(
            (a, b) =>
              Date.parse(b.date) - Date.parse(a.date)
          )
          .slice(0, 10)
      : []

  const dispatchMatches =
    !dispatchResult.error &&
    purchaseMatches &&
    Boolean(dispatchResult.data) &&
    Boolean(remoteId) &&
    String(
      dispatchResult.data?.remote_id || ''
    ).toLowerCase() === remoteId.toLowerCase()

  const dispatchedAt = dispatchMatches
    ? savedDate(dispatchResult.data?.dispatched_at)
    : null

  const shipmentQueryFailed = Boolean(
    purchaseResult.error || dispatchResult.error
  )

  const dispatchLinkMismatch = Boolean(
    dispatchResult.data && !dispatchMatches
  )

  const workflow =
    shipmentQueryFailed ||
    (
      order.status === 'paid' &&
      (shipmentLinkMismatch || dispatchLinkMismatch)
    )
      ? {
          stage: 'unknown',
          label: 'Conferir situação',
        }
      : getOrderWorkflow({
          paymentStatus: order.status,
          preparationState: labelOperations.state,
          purchasePhase: purchaseResult.data?.phase,
          carrierStatus:
            purchaseResult.data?.carrier_status,
          dispatchedAt,
        })

  const carrierStatus = String(
    purchaseResult.data?.carrier_status || ''
  ).trim().toLowerCase()

  const purchasePhase = String(
    purchaseResult.data?.phase || ''
  ).trim().toLowerCase()

  const shipmentBlocked = [
    'canceled',
    'cancelled',
    'expired',
  ].includes(carrierStatus)

  const carrierDispatchConfirmed =
    ['posted', 'delivered'].includes(carrierStatus) &&
    purchaseMatches

  const dispatchEligible =
    !shipmentQueryFailed &&
    purchaseMatches &&
    !dispatchResult.data &&
    order.status === 'paid' &&
    shipmentPrepared &&
    saleUuid(remoteId) &&
    purchasePhase === 'ready' &&
    !shipmentBlocked &&
    !carrierDispatchConfirmed

  const shipmentNeedsReview = [
    'creating',
    'uncertain',
    'rejected',
  ].includes(labelOperations.state)

  const shippingDetails: ShippingDetails =
    order.shipping_details &&
    typeof order.shipping_details === 'object' &&
    !Array.isArray(order.shipping_details)
      ? order.shipping_details as ShippingDetails
      : {}

  const carrierName = [
    shippingDetails.company,
    shippingDetails.service,
  ]
    .filter(
      value =>
        typeof value === 'string' && value.trim()
    )
    .join(' · ')

  const workflowClass =
    workflow.stage === 'completed'
      ? 'bg-green-50 text-green-800'
      : workflow.stage === 'awaiting_dispatch'
        ? 'bg-blue-50 text-blue-800'
        : workflow.stage === 'processing'
          ? 'bg-amber-50 text-amber-800'
          : workflow.stage === 'cancelled' ||
              workflow.stage === 'refunded'
            ? 'bg-red-50 text-red-800'
            : 'bg-[#EFEAE2] text-[#625A4F]'

  const margin =
    order.cost === null
      ? null
      : order.subtotal -
        order.discount -
        order.cost -
        order.expenses

  const showShippingActions =
    order.status === 'paid' &&
    !shipmentQueryFailed &&
    !shipmentLinkMismatch &&
    !dispatchLinkMismatch &&
    !shipmentBlocked

  const showTracking =
    order.status === 'paid' &&
    purchaseMatches &&
    !shipmentBlocked &&
    ['paid', 'generating', 'ready'].includes(
      purchasePhase
    )

  let nextStep = 0
  let nextTitle = 'Envio indisponível'
  let nextHint =
    'Este pedido não está disponível para preparar ou comprar uma etiqueta.'

  if (order.status === 'pending') {
    nextTitle = 'Aguardando pagamento'
    nextHint =
      'Você pode conferir os dados. A preparação e a compra ficam disponíveis após o pagamento.'
  } else if (order.status === 'paid') {
    if (
      shipmentQueryFailed ||
      shipmentLinkMismatch ||
      dispatchLinkMismatch
    ) {
      nextTitle = 'Conferir situação do envio'
      nextHint =
        'Não foi possível confirmar o vínculo da etiqueta ou da postagem. Atualize a situação e confira o Melhor Envio antes de continuar.'
    } else if (shipmentBlocked) {
      nextTitle = 'Etiqueta cancelada ou expirada'
      nextHint =
        'Confira este envio na sua conta do Melhor Envio antes de tentar outra compra.'
    } else if (
      dispatchedAt ||
      carrierDispatchConfirmed
    ) {
      nextTitle = 'Envio concluído no painel'
      nextHint =
        'A postagem já foi registrada. Acompanhe o transporte no rastreamento abaixo.'
    } else if (shipmentNeedsReview) {
      nextStep = 2
      nextTitle = 'Conferir preparação'
      nextHint =
        'Confira a preparação abaixo. Se o resultado não foi confirmado, recupere o envio existente antes de criar outro.'
    } else if (shipmentPrepared) {
      nextStep = purchasePhase === 'ready' ? 4 : 3

      nextTitle =
        purchasePhase === 'ready'
          ? 'Imprimir e postar'
          : 'Comprar ou conferir a etiqueta'

      nextHint =
        purchasePhase === 'ready'
          ? 'A etiqueta está gerada. Imprima abaixo e confirme a postagem somente após entregar o pacote à transportadora.'
          : 'Confira a situação e o valor abaixo. Uma compra em andamento não deve ser repetida.'
    } else if (
      labelPreparation.issues.length ||
      order.shipping_pending
    ) {
      nextStep = 1
      nextTitle = 'Conferir dados do envio'

      nextHint = order.shipping_pending
        ? 'O frete precisa ser confirmado. Confira também os dados e a embalagem antes de preparar a etiqueta.'
        : 'Corrija os campos destacados e salve. Depois, atualize a situação para conferir a próxima etapa.'
    } else {
      nextStep = 2
      nextTitle = 'Preparar etiqueta'
      nextHint =
        'Os dados salvos serão usados automaticamente. Prepare a etiqueta abaixo e confirme a compra pelo custo exibido.'
    }
  }

  const sectionClass =
    'rounded-2xl border border-[#E5DED3] bg-white'

  const summaryClass =
    'flex min-h-[52px] cursor-pointer items-center justify-between gap-3 px-5 py-4 text-sm font-medium'

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/pedidos"
          className="inline-flex min-h-[44px] items-center text-xs text-[#81796C] hover:text-[#292621]"
        >
          ← Pedidos
        </Link>

        <a
          href={`/admin/pedidos/${order.id}`}
          className="inline-flex min-h-[44px] items-center text-xs text-[#81796C] hover:text-[#292621]"
        >
          Atualizar situação
        </a>
      </div>

      <header className="mb-6 mt-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-medium">
            Pedido #{order.number}
          </h1>

          <span
            className={`rounded-full px-3 py-1.5 text-[11px] ${workflowClass}`}
          >
            {workflow.label}
          </span>
        </div>

        <p className="mt-2 text-xs text-[#81796C]">
          {saleDate(order.created_at)}
          {' · '}
          {order.source === 'site' ? 'Site' : 'Manual'}
        </p>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <section className={sectionClass}>
            <div className="border-b border-[#EEE9E1] px-5 py-4">
              <h2 className="text-sm font-medium">
                Peças e opções da compra
              </h2>
            </div>

            <div className="divide-y divide-[#EEE9E1] px-5">
              {order.items.map((item, index) => (
                <OrderItemDetails key={index} item={item} index={index} />
              ))}
            </div>

            <dl className="space-y-3 border-t border-[#EEE9E1] px-5 py-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[#81796C]">
                  Subtotal
                </dt>
                <dd>{saleMoney(order.subtotal)}</dd>
              </div>

              {order.discount > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[#81796C]">
                    Desconto
                  </dt>
                  <dd>− {saleMoney(order.discount)}</dd>
                </div>
              )}

              <div className="flex justify-between gap-4">
                <dt className="text-[#81796C]">Frete</dt>
                <dd>
                  {order.shipping_pending
                    ? 'A confirmar'
                    : saleMoney(order.shipping)}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-[#EEE9E1] pt-3">
                <dt className="font-medium">Total</dt>
                <dd className="text-lg font-semibold">
                  {saleMoney(order.total)}
                </dd>
              </div>
            </dl>
          </section>

          <section className={`${sectionClass} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-medium">
                  Envio e etiqueta
                </h2>

                <p className="mt-2 text-sm">
                  {order.shipping_pending
                    ? 'Frete a confirmar'
                    : carrierName ||
                      'Transportadora a confirmar'}
                </p>

                {!order.shipping_pending &&
                  typeof shippingDetails.days === 'number' && (
                    <p className="mt-1 text-xs text-[#625B51]">
                      Prazo estimado: {shippingDetails.days}
                      {' '}dia(s) {typeof shippingDetails.preparation_days === 'number'
                        ? 'após a confirmação do pagamento.'
                        : 'após a postagem.'}
                    </p>
                  )}
              </div>

              <Link
                href="/admin/etiquetas"
                className="inline-flex min-h-[44px] items-center rounded-full border border-[#DDD4C7] px-4 text-xs"
              >
                Central de etiquetas
              </Link>
            </div>

            <div
              className={`mt-4 rounded-xl p-4 ${
                shipmentNeedsReview ||
                shipmentLinkMismatch ||
                shipmentQueryFailed ||
                shipmentBlocked
                  ? 'bg-amber-50 text-amber-900'
                  : 'bg-[#F5F1EA] text-[#51483C]'
              }`}
            >
              <p className="text-sm font-medium">
                {nextTitle}
              </p>
              <p className="mt-2 text-xs leading-6">
                {nextHint}
              </p>
            </div>

            {order.status === 'paid' && (
              <ol
                aria-label="Etapas do envio"
                className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"
              >
                {[
                  'Dados',
                  'Preparar',
                  'Comprar / imprimir',
                  'Postar',
                ].map((name, index) => (
                  <li
                    key={name}
                    aria-current={
                      nextStep === index + 1
                        ? 'step'
                        : undefined
                    }
                    className={`rounded-xl border px-3 py-3 ${
                      nextStep === index + 1
                        ? 'border-[#292621] bg-[#292621] text-white'
                        : 'border-[#E5DED3] bg-white text-[#625B51]'
                    }`}
                  >
                    {index + 1}. {name}
                  </li>
                ))}
              </ol>
            )}

            {['pending', 'paid'].includes(order.status) && !showShippingActions && (
              <details className="mt-4 border-t border-[#EEE9E1]">
                <summary className="min-h-[48px] cursor-pointer py-4 text-sm font-medium">Dados do envio · editar se necessário</summary>
                <LabelPreparation initial={labelPreparation} />
              </details>
            )}
            {showShippingActions && <QuickLabelFlow key={order.id} orderId={order.id} stage={shipmentPrepared ? 'purchased' : 'prepare'} title="Abrir etiqueta" autoOpen />}

            {!shipmentQueryFailed &&
              !shipmentLinkMismatch &&
              (
                dispatchEligible ||
                dispatchedAt ||
                carrierDispatchConfirmed
              ) && (
                <div className="mt-4 border-t border-[#EEE9E1] pt-4">
                  <h3 className="text-sm font-medium">
                    4. Postagem
                  </h3>

                  {dispatchEligible || dispatchedAt ? (
                    <OrderDispatch
                      key={`${order.id}-${remoteId}-${dispatchedAt || 'pending'}`}
                      orderId={order.id}
                      remoteId={remoteId}
                      eligible={dispatchEligible}
                      dispatchedAt={dispatchedAt}
                    />
                  ) : (
                    <p className="mt-2 text-xs text-green-800">
                      {carrierStatus === 'delivered'
                        ? 'Entrega registrada no Melhor Envio.'
                        : 'Postagem registrada no Melhor Envio.'}
                    </p>
                  )}
                </div>
              )}

            {showTracking && (
              <div className="mt-4 border-t border-[#EEE9E1] pt-4">
                <h3 className="text-sm font-medium">
                  Rastreamento
                </h3>

                {trackingResult.error ? (
                  <p
                    role="alert"
                    className="mt-2 text-xs text-amber-900"
                  >
                    Não foi possível carregar o
                    rastreamento salvo.
                    Atualize a situação.
                  </p>
                ) : trackingMatches ? (
                  <>
                    <p className="mt-2 text-sm">
                      {trackingLabel(
                        tracking?.carrier_status
                      )}
                    </p>

                    <p className="mt-2 select-all break-all text-xs">
                      {trackingCode ||
                        'Código ainda não disponibilizado.'}
                    </p>

                    {lastChecked && (
                      <p className="mt-2 text-[11px] text-[#625B51]">
                        Atualizado em{' '}
                        {saleDate(lastChecked)}
                        {' '}(Brasília).
                      </p>
                    )}

                    {tracking?.sync_state === 'error' && (
                      <p
                        role="status"
                        className="mt-2 text-xs text-amber-900"
                      >
                        A última atualização falhou.
                        A rotina automática tentará
                        novamente.
                      </p>
                    )}

                    {trackingEvents.length > 0 && (
                      <details className="mt-3">
                        <summary className="min-h-[44px] cursor-pointer py-3 text-xs text-[#625B51]">
                          Histórico do rastreamento
                        </summary>

                        <ol className="space-y-3 border-l border-[#E5DED3] pl-3">
                          {trackingEvents.map(
                            (event, index) => (
                              <li
                                key={`${event.date}-${index}`}
                              >
                                <p className="text-xs">
                                  {trackingLabel(
                                    event.status
                                  )}
                                </p>
                                <p className="mt-1 text-[11px] text-[#625B51]">
                                  Consulta em{' '}
                                  {saleDate(event.date)}
                                </p>
                              </li>
                            )
                          )}
                        </ol>
                      </details>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-xs text-[#625B51]">
                    Aguardando a atualização automática
                    da etiqueta atual.
                  </p>
                )}
              </div>
            )}
          </section>

          {order.notes && (
            <details className={sectionClass}>
              <summary className={summaryClass}>
                Observações internas
              </summary>

              <p className="whitespace-pre-wrap break-words border-t border-[#EEE9E1] px-5 py-4 text-xs leading-relaxed text-[#756D61]">
                {order.notes}
              </p>
            </details>
          )}

          <details className={sectionClass}>
            <summary className={summaryClass}>
              Histórico e custos
            </summary>

            <div className="space-y-5 border-t border-[#EEE9E1] p-4">
              <OrderStock
                id={order.id}
                status={order.status}
                state={order.stock_state}
                expires={order.stock_reserved_until}
                untracked={order.stock_untracked}
                version={order.updated_at}
                events={stockResult.data || []}
              />

              <div className="border-t border-[#EEE9E1] pt-4">
                <h2 className="mb-4 text-sm font-medium">
                  Custos e margem
                </h2>

                <dl className="space-y-3 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt>Custo das peças</dt>
                    <dd>
                      {order.cost === null
                        ? 'Pendente'
                        : saleMoney(order.cost)}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-3">
                    <dt>Despesas</dt>
                    <dd>{saleMoney(order.expenses)}</dd>
                  </div>

                  <div className="flex justify-between gap-3">
                    <dt>Margem de contribuição</dt>
                    <dd>
                      {margin === null
                        ? 'Custos pendentes'
                        : saleMoney(margin)}
                    </dd>
                  </div>
                </dl>

                <details className="mt-4">
                  <summary className="cursor-pointer py-2 text-xs text-[#81796C]">
                    Custos por item
                  </summary>

                  <div className="divide-y divide-[#EEE9E1]">
                    {order.items.map((item, index) => (
                      <div key={index} className="py-3">
                        <p className="text-xs font-medium">
                          {item.name}
                        </p>

                        {item.variation && (
                          <p className="mt-1 text-xs text-[#81796C]">
                            {item.variation}
                          </p>
                        )}

                        <p className="mt-1 text-xs text-[#81796C]">
                          Custo unitário:{' '}
                          {item.unit_cost === null
                            ? 'não cadastrado'
                            : saleMoney(item.unit_cost)}

                          {item.supplier
                            ? ` · ${item.supplier}`
                            : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>

                <p className="mt-3 text-[11px] leading-relaxed text-[#81796C]">
                  A margem desconta custos e despesas
                  dos produtos após descontos, sem
                  incluir o frete. Não representa
                  lucro líquido contábil.
                </p>
              </div>
            </div>
          </details>
        </div>

        <aside className="min-w-0 space-y-4">
          <section className={`${sectionClass} p-5`}>
            <h2 className="text-sm font-medium">
              Cliente
            </h2>

            <p className="mt-3 break-words text-sm">
              {order.customer_snapshot.name}
            </p>

            {order.customer_snapshot.email && (
              <p className="mt-2 break-words text-xs text-[#81796C]">
                {order.customer_snapshot.email}
              </p>
            )}

            {order.customer_snapshot.phone && (
              <p className="mt-1 text-xs text-[#81796C]">
                {order.customer_snapshot.phone}
              </p>
            )}

            {checkoutPhone(order.customer_snapshot.phone) && <a href={`https://wa.me/${checkoutPhone(order.customer_snapshot.phone)}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-[44px] items-center text-xs underline">Abrir WhatsApp ↗</a>}

            <section className="mt-4 border-t border-[#EEE9E1] pt-3">
              <h3 className="py-2 text-xs font-medium text-[#756B5D]">
                Endereço de entrega
              </h3>

              <div className="mt-3">
                <OrderOrigin
                  source={order.source}
                  shippingPending={order.shipping_pending}
                  address={order.delivery_address}
                />
              </div>
            </section>
          </section>

          <section className={`${sectionClass} p-5`}>
            <h2 className="text-sm font-medium">
              Pagamento
            </h2>

            <p className="mt-3 text-xs text-[#81796C]">
              {order.status === 'pending'
                ? 'Aguardando pagamento'
                : SALE_STATUS[order.status] || 'Conferir'}
            </p>

            <OrderStatus
              id={order.id}
              status={order.status}
              canConfirm={!order.shipping_pending}
            />

            {['pending', 'paid'].includes(order.status) && (
              <p className="mt-3 text-[11px] leading-relaxed text-[#81796C]">
                As ações registram o pagamento ou
                estorno informado pela equipe;
                não executam a transação financeira.
              </p>
            )}
          </section>
        </aside>
      </div>
    </main>
  )
}
