'use client'

import Link from 'next/link'
import LegacyLabelStart from './LegacyLabelStart'
import type { LabelScope } from '@/lib/label-scope'
import QuickLabelFlow from './QuickLabelFlow'
import { labelCanSelect, labelNextStep } from '@/lib/label-center'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { bulkLabelPurchaseAction } from '@/app/admin/frete/bulk-purchase-actions'
import type { LabelPurchaseView } from '@/lib/label-purchase'

export interface LabelCenterRow {
  order_id: string
  order_number: number
  created_at: string
  customer_name: string
  company: string
  service: string
  job_state: string
  shipping_pending?: boolean
  label_stage: string
  next_action: string
  tracking_code: string
  stage_message: string
  source_kind?: LabelScope
  legacy_id?: number | null
  legacy_intent?: string | null
}

type Outcome = {
  scope?: LabelScope
  legacyId?: number | null
  number: number
  error: string
  message?: string
  view?: LabelPurchaseView
}

const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)

const phaseLabels: Record<string, string> = {
  empty: 'Precisa conferir',
  review: 'Custo conferido',
  buying: 'Compra em andamento',
  uncertain: 'Compra não confirmada',
  paid: 'Comprada — aguardando geração',
  generating: 'Comprada — geração em andamento',
  ready: 'Etiqueta gerada',
  blocked: 'Envio bloqueado',
}

export default function LabelBatchList({
  rows,
  stage,
}: {
  rows: LabelCenterRow[]
  stage: string
}) {
  const router = useRouter()

  const [selected, setSelected] = useState<string[]>([])
  const [results, setResults] = useState<
    Record<string, Outcome>
  >({})
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('')
  const [now, setNow] = useState(Date.now())

  const running = useRef(false)
  const mounted = useRef(true)

  const limit = 5
  const buyingList = stage === 'to_buy'

  useEffect(() => {
    mounted.current = true

    const warn = (event: BeforeUnloadEvent) => {
      if (running.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', warn)

    return () => {
      mounted.current = false
      window.removeEventListener('beforeunload', warn)
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(
      () => setNow(Date.now()),
      15000
    )

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (busy) return

    const visible = new Set(
      rows.filter(labelCanSelect).map(row => row.order_id)
    )

    setSelected(previous =>
      previous.filter(id => visible.has(id))
    )

    setConfirmed(false)
  }, [rows, busy])

  function ready(id: string): boolean {
    const result = results[id]
    const view = result?.view

    return Boolean(
      result &&
      !result.error &&
      view &&
      view.phase === 'review' &&
      view.reviewId &&
      !view.issues.length &&
      Number.isSafeInteger(view.reviewCents) &&
      view.reviewCents! >= 0 &&
      Number.isFinite(Date.parse(view.expires)) &&
      Date.parse(view.expires) > now
    )
  }

  const eligible = selected.filter(ready)

  const total = eligible.reduce(
    (sum, id) =>
      sum + results[id].view!.reviewCents!,
    0
  )

  function toggle(id: string) {
    if (running.current || !rows.some(row => row.order_id === id && labelCanSelect(row))) return

    setConfirmed(false)
    setMessage('')

    setSelected(previous =>
      previous.includes(id)
        ? previous.filter(value => value !== id)
        : previous.length < limit
          ? [...previous, id]
          : previous
    )
  }

  async function run(command: 'check' | 'buy') {
    if (
      running.current ||
      (command === 'buy' && !confirmed)
    ) {
      return
    }

    const ids =
      command === 'check'
        ? [...selected]
        : [...eligible]

    if (!ids.length) return

    const snapshot = { ...results }

    running.current = true
    setBusy(true)
    setConfirmed(false)
    setMessage('')

    let finished = 0
    let stopped = false

    try {
      for (const id of ids) {
        if (!mounted.current) {
          stopped = true
          break
        }

        const number =
          rows.find(row => row.order_id === id)
            ?.order_number ||
          snapshot[id]?.number ||
          0

        setMessage(
          `${
            command === 'check'
              ? 'Conferindo'
              : 'Processando'
          } pedido #${number} · ${finished + 1} de ${ids.length}`
        )

        try {
          const previous = snapshot[id]?.view

          const result = await bulkLabelPurchaseAction(
            id,
            command,
            command === 'buy'
              ? previous!.reviewId
              : '',
            command === 'buy'
              ? previous!.reviewCents!
              : undefined,
            rows.find(row => row.order_id === id)?.source_kind || 'current'
          )

          setResults(current => ({
            ...current,
            [id]: {
              number,
              scope: rows.find(row => row.order_id === id)?.source_kind,
              legacyId: rows.find(row => row.order_id === id)?.legacy_id,
              ...result,
            },
          }))

          finished++

          if (
            command === 'buy' &&
            (
              result.error ||
              !result.view ||
              ![
                'paid',
                'generating',
                'ready',
              ].includes(result.view.phase)
            )
          ) {
            stopped = true
            break
          }
        } catch {
          setResults(current => ({
            ...current,
            [id]: {
              number,
              error:
                command === 'buy'
                  ? 'A resposta não foi confirmada. Não repita a compra; confira a situação deste pedido e sua conta no Melhor Envio.'
                  : 'Não foi possível conferir este pedido. Tente conferir novamente.',
            },
          }))

          finished++
          stopped = true
          break
        }
      }

      setMessage(
        stopped
          ? 'Processamento interrompido. Confira o resultado abaixo antes de continuar. Os pedidos restantes não foram processados.'
          : command === 'check'
            ? 'Preparação concluída. Compre as etiquetas liberadas pelo total exibido.'
            : 'Processamento concluído. Confira a situação de cada etiqueta abaixo.'
      )
    } finally {
      running.current = false
      setBusy(false)
      setNow(Date.now())
      if (command === 'buy') router.refresh()
    }
  }

  const button =
    'inline-flex min-h-[44px] items-center rounded-full border border-[#DDD4C7] bg-white px-5 text-xs disabled:opacity-40'

  return (
    <div>
      {buyingList && (
        <div className="border-b border-[#E5DED3] bg-[#F8F5EF] p-5 sm:p-6">
          <p className="text-sm font-medium">
            Comprar etiquetas
          </p>

          <p className="mt-2 text-xs leading-6 text-[#625B51]">
            Marque até {limit} pedidos. Os dados salvos serão usados para preparar os envios e calcular o total.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || !rows.some(labelCanSelect)}
              onClick={() => {
                setSelected(
                  rows
                    .filter(labelCanSelect)
                    .slice(0, limit)
                    .map(row => row.order_id)
                )
                setConfirmed(false)
              }}
              className={button}
            >
              Selecionar pedidos (até {limit})
            </button>

            <button
              type="button"
              disabled={busy || !selected.length}
              onClick={() => {
                setSelected([])
                setConfirmed(false)
              }}
              className={button}
            >
              Limpar seleção
            </button>

            <button
              type="button"
              disabled={busy || !selected.length}
              onClick={() => void run('check')}
              className={button}
            >
              1. Preparar selecionadas ({selected.length})
            </button>
          </div>

          <p className="mt-4 text-xs">
            {selected.length} selecionada(s)
            {' · '}
            {eligible.length} pronta(s) para comprar
          </p>

          {eligible.length > 0 && (
            <div className="mt-4 rounded-2xl border border-[#D6C5A9] bg-white p-4">
              <p className="text-sm font-medium">
                Total autorizado: {money(total)}
                {' · '}
                {eligible.length} etiqueta(s)
              </p>

              <p className="mt-2 text-xs leading-6 text-[#625B51]">
                Somente as etiquetas conferidas e sem
                pendências entram nessa compra.
                O pagamento utiliza o saldo da carteira
                do Melhor Envio.
              </p>

              <label className="mt-4 flex min-h-[44px] items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={event =>
                    setConfirmed(event.target.checked)
                  }
                  className="mt-1 h-4 w-4 shrink-0"
                />

                <span>
                  Confirmo a compra de {eligible.length}
                  {' '}etiqueta(s), no total de{' '}
                  {money(total)}.
                </span>
              </label>

              <button
                type="button"
                disabled={busy || !confirmed}
                onClick={() => void run('buy')}
                className="mt-3 min-h-[46px] rounded-full bg-[#292621] px-6 text-sm text-white disabled:opacity-40"
              >
                2. Comprar {eligible.length} etiqueta(s)
                {' — '}
                {money(total)}
              </button>
            </div>
          )}

          <p
            role="status"
            aria-live="polite"
            className="mt-4 text-xs leading-6"
          >
            {busy ? 'Aguarde nesta página. ' : ''}
            {message}
          </p>
        </div>
      )}

      {rows.length ? (
        <ul className="divide-y divide-[#EEE8DE]">
          {rows.map(row => (
            <li
              key={row.order_id}
              className="p-5 sm:p-6"
            >
              <div className="flex items-start gap-3">
                {buyingList && (
                  <input
                    type="checkbox"
                    aria-label={`Selecionar pedido ${row.order_number}`}
                    checked={selected.includes(row.order_id)}
                    disabled={
                      busy || !labelCanSelect(row) ||
                      (
                        !selected.includes(row.order_id) &&
                        selected.length >= limit
                      )
                    }
                    onChange={() => toggle(row.order_id)}
                    className="mt-1 h-5 w-5 shrink-0"
                  />
                )}

                <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={row.source_kind === 'legacy' ? `/admin/historico?pedido=${row.legacy_id}` : `/admin/pedidos/${row.order_id}`}
                      className="text-base font-medium underline underline-offset-4"
                    >
                      {row.source_kind === 'legacy' ? 'Pedido antigo' : 'Pedido'} #{row.order_number}
                    </Link>

                    <p className="mt-2 break-words text-sm">
                      {row.customer_name}
                    </p>

                    <p className="mt-2 text-xs text-[#625B51]">
                      {new Intl.DateTimeFormat(
                        'pt-BR',
                        {
                          dateStyle: 'short',
                          timeStyle: 'short',
                          timeZone: 'America/Sao_Paulo',
                        }
                      ).format(
                        new Date(row.created_at)
                      )}
                    </p>

                    <p className="mt-3 text-sm">
                      {[row.company, row.service]
                        .filter(Boolean)
                        .join(' · ') ||
                        'Transportadora a confirmar'}
                    </p>

                    <p className="mt-2 text-xs leading-6 text-[#625B51]">
                      {labelNextStep(row).hint}
                    </p>

                    {row.label_stage === 'review' && row.stage_message && <p className="mt-2 text-xs leading-6 text-amber-900">{row.stage_message}</p>}
                    {row.tracking_code && (
                      <p className="mt-2 break-all text-xs">
                        Rastreio:{' '}
                        <strong>
                          {row.tracking_code}
                        </strong>
                      </p>
                    )}
                  </div>

                  <Link href={row.source_kind === 'legacy' ? `/admin/historico?pedido=${row.legacy_id}` : `/admin/pedidos/${row.order_id}`} className="inline-flex min-h-[44px] items-center text-xs underline">{row.shipping_pending && row.source_kind !== 'legacy' ? 'Definir frete no pedido →' : 'Detalhes do pedido →'}</Link>
                </div>
              </div>
              {row.source_kind === 'legacy' ? <LegacyLabelStart oldId={String(row.legacy_id)} shipmentId={row.legacy_intent ? row.order_id : undefined} intent={row.legacy_intent || undefined} linked={row.job_state === 'prepared'} /> : !row.shipping_pending && <QuickLabelFlow orderId={row.order_id} stage={row.label_stage} title={labelNextStep(row).title} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-6 text-sm text-[#625B51]">
          Nenhum pedido nesta lista ou busca no momento.
        </p>
      )}

      {Object.keys(results).length > 0 && (
        <section
          aria-label="Resultado por pedido"
          className="border-t border-[#E5DED3] bg-[#F8F5EF] p-5 sm:p-6"
        >
          <h3 className="text-sm font-medium">
            Resultado por pedido
          </h3>

          <ul className="mt-3 space-y-3">
            {Object.entries(results).map(
              ([id, result]) => (
                <li
                  key={id}
                  className="rounded-xl border border-[#E5DED3] bg-white p-4 text-xs leading-6"
                >
                  <Link
                    href={result.scope === 'legacy' ? `/admin/historico?pedido=${result.legacyId}` : `/admin/pedidos/${id}`}
                    className="font-medium underline"
                  >
                    Pedido #{result.number}
                  </Link>

                  {result.view && (
                    <p>
                      {phaseLabels[result.view.phase] ||
                        'Conferir situação'}
                    </p>
                  )}

                  {result.view?.phase === 'review' &&
                    result.view.reviewCents !== null && (
                      <p>
                        Custo conferido:{' '}
                        <strong>
                          {money(result.view.reviewCents)}
                        </strong>

                        {!ready(id) &&
                          ' · Confira novamente antes de comprar.'}
                      </p>
                    )}

                  {result.view?.paidCents !== null &&
                    result.view?.paidCents !== undefined && (
                      <p>
                        Custo pago registrado:{' '}
                        {money(result.view.paidCents)}
                      </p>
                    )}

                  {result.error && (
                    <p
                      role="alert"
                      className="mt-1 text-amber-900"
                    >
                      {result.error}
                    </p>
                  )}

                  {result.view?.issues.map(
                    (issue, index) => (
                      <p
                        key={index}
                        className="text-amber-900"
                      >
                        {issue}
                      </p>
                    )
                  )}

                  {!result.error && result.message && (
                    <p>{result.message}</p>
                  )}
                </li>
              )
            )}
          </ul>
        </section>
      )}
    </div>
  )
}
