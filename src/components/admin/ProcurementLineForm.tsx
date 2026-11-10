'use client'

import { useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveProcurementLine } from '@/app/admin/compras/actions'
import type { ProcurementSaveResult } from '@/app/admin/compras/actions'

export default function ProcurementLineForm({
  orderId,
  lineNumber,
  signature,
  quantity,
  ordered,
  received,
  version,
  historical = false,
}: {
  orderId: string
  lineNumber: number
  signature: string
  quantity: number
  ordered: number
  received: number
  version: number
  historical?: boolean
}) {
  const router = useRouter()
  const id = useId()

  const [busy, setBusy] = useState(false)
  const [result, setResult] =
    useState<ProcurementSaveResult | null>(null)

  const [baseline, setBaseline] = useState({
    ordered,
    received,
    version,
  })

  const running = useRef(false)

  const intent = useRef<{
    payload: string
    request: string
  } | null>(null)

  async function submit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    if (running.current) return

    const form = event.currentTarget
    const data = new FormData(form)

    const payload = JSON.stringify([
      orderId,
      lineNumber,
      signature,
      baseline.version,
      data.get('ordered'),
      data.get('received'),
      data.get('note'),
    ])

    if (
      !intent.current ||
      intent.current.payload !== payload
    ) {
      intent.current = {
        payload,
        request: crypto.randomUUID(),
      }
    }

    data.set('order_id', orderId)
    data.set('line_number', String(lineNumber))
    data.set('signature', signature)
    data.set('version', String(baseline.version))
    data.set('request_id', intent.current.request)

    running.current = true
    setBusy(true)
    setResult(null)

    try {
      const response = await saveProcurementLine(data)
      setResult(response)

      if (
        response.ok &&
        response.version !== undefined &&
        response.ordered !== undefined &&
        response.received !== undefined
      ) {
        setBaseline({
          version: response.version,
          ordered: response.ordered,
          received: response.received,
        })

        const confirmation = form.elements.namedItem(
          'confirmed'
        ) as HTMLInputElement | null

        if (confirmation) confirmation.checked = false

        intent.current = null
        router.refresh()
      }
    } catch {
      setResult({
        ok: false,
        error:
          'A resposta não foi confirmada. Atualize a página e confira as quantidades antes de tentar novamente.',
      })
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  const input =
    'mt-2 min-h-[44px] w-full rounded-xl border border-[#DDD4C7] bg-white px-3 text-sm'

  return (
    <form
      onSubmit={event => void submit(event)}
      className="mt-4"
    >
      <fieldset disabled={busy}>
        <p className="text-xs text-[#625B51]">
          Necessário neste item do pedido:{' '}
          <strong>{quantity}</strong> unidade(s).
        </p>

        {historical && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">
            Informe o que realmente já foi pedido e
            recebido. Se ainda não comprou nada,
            mantenha zero e confirme para liberar
            este item na lista A comprar.
          </p>
        )}

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label
            htmlFor={`${id}-ordered`}
            className="text-xs"
          >
            Pedido ao fornecedor

            <input
              id={`${id}-ordered`}
              name="ordered"
              type="number"
              min={0}
              max={quantity}
              step={1}
              required
              defaultValue={baseline.ordered}
              aria-invalid={
                Boolean(result?.fields?.ordered)
              }
              aria-describedby={
                result?.fields?.ordered
                  ? `${id}-ordered-error`
                  : undefined
              }
              className={input}
            />

            {result?.fields?.ordered && (
              <span
                id={`${id}-ordered-error`}
                className="mt-2 block text-red-700"
              >
                {result.fields.ordered}
              </span>
            )}
          </label>

          <label
            htmlFor={`${id}-received`}
            className="text-xs"
          >
            Recebido do fornecedor

            <input
              id={`${id}-received`}
              name="received"
              type="number"
              min={0}
              max={quantity}
              step={1}
              required
              defaultValue={baseline.received}
              aria-invalid={
                Boolean(result?.fields?.received)
              }
              aria-describedby={
                result?.fields?.received
                  ? `${id}-received-error`
                  : undefined
              }
              className={input}
            />

            {result?.fields?.received && (
              <span
                id={`${id}-received-error`}
                className="mt-2 block text-red-700"
              >
                {result.fields.received}
              </span>
            )}
          </label>
        </div>

        <label
          htmlFor={`${id}-note`}
          className="mt-4 block text-xs"
        >
          Observações da compra ou correção

          <textarea
            id={`${id}-note`}
            name="note"
            maxLength={1000}
            rows={2}
            aria-invalid={
              Boolean(result?.fields?.note)
            }
            className="mt-2 w-full rounded-xl border border-[#DDD4C7] bg-white p-3 text-sm"
          />

          {result?.fields?.note && (
            <span className="mt-2 block text-red-700">
              {result.fields.note}
            </span>
          )}
        </label>

        <label className="mt-4 flex min-h-[44px] items-start gap-3 text-xs leading-6">
          <input
            type="checkbox"
            name="confirmed"
            required
            className="mt-1 h-4 w-4 shrink-0"
          />

          <span>
            Conferi as quantidades que já foram
            pedidas e recebidas para este item.
          </span>
        </label>

        {result?.fields?.confirmed && (
          <p className="text-xs text-red-700">
            {result.fields.confirmed}
          </p>
        )}

        <button
          type="submit"
          className="mt-3 min-h-[44px] rounded-full bg-[#292621] px-5 text-xs text-white disabled:opacity-50"
        >
          {busy ? 'Salvando…' : 'Salvar quantidades'}
        </button>
      </fieldset>

      {result && (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={`mt-3 text-xs leading-6 ${
            result.ok
              ? 'text-green-800'
              : 'text-red-700'
          }`}
        >
          {result.ok
            ? 'Quantidades salvas.'
            : result.error}
        </p>
      )}
    </form>
  )
}
