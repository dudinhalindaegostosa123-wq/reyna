'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { startTestPix } from './actions'

interface Props {
  orderId: string
  canStart: boolean
  code: string | null
  qr: string | null
  expiresAt: string | null
}

export default function PixPayment({
  orderId,
  canStart,
  code,
  qr,
  expiresAt,
}: Props) {
  const router = useRouter()
  const locked = useRef(false)
  const attempt = useRef<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  const expired =
    !expiresAt || Date.parse(expiresAt) <= Date.now()

  async function generate() {
    if (locked.current || !canStart || sent) return

    locked.current = true
    setBusy(true)
    setMessage('')

    try {
      const key = `serenity-pix-attempt:${orderId}`

      if (!attempt.current) {
        const previous = sessionStorage.getItem(key)

        if (
          previous &&
          !/^[a-f0-9-]{36}$/i.test(previous)
        ) {
          throw new Error('INVALID_ATTEMPT')
        }

        attempt.current = previous || crypto.randomUUID()
        sessionStorage.setItem(key, attempt.current)
      }

      const result = await startTestPix(
        orderId,
        attempt.current
      )

      setMessage(result.message)
      setSent(true)
      router.refresh()
    } catch {
      setSent(true)
      setMessage(
        'Não foi possível confirmar a resposta. Atualize a situação antes de continuar; não refaça o pedido.'
      )
    } finally {
      setBusy(false)
      locked.current = false
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-store-border p-5">
      <h2 className="text-lg font-medium">
        Pix de teste
      </h2>

      <p className="mt-2 text-sm leading-6 text-store-warning">
        Ambiente de teste. Não use seu aplicativo bancário
        para pagar este código. Uma aprovação de teste não
        confirma o pagamento real do pedido.
      </p>

      {!expired && code && (
        <div className="mt-5">
          {qr && (
            <img
              src={`data:image/png;base64,${qr}`}
              alt="QR Code do Pix de teste"
              width={240}
              height={240}
              className="mx-auto h-60 w-60 max-w-full rounded-xl bg-white p-3 object-contain"
            />
          )}

          <label
            htmlFor="pix-code"
            className="mt-4 block text-sm"
          >
            Código Pix de teste
          </label>

          <textarea
            id="pix-code"
            readOnly
            value={code}
            rows={3}
            className="mt-2 w-full rounded-xl border border-store-border p-3 text-xs"
          />

          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code)
                setMessage('Código de teste copiado.')
              } catch {
                setMessage(
                  'Selecione e copie o código no campo acima.'
                )
              }
            }}
            className="mt-3 min-h-[44px] rounded-full border border-store-border px-5 text-sm"
          >
            Copiar código de teste
          </button>

          <p className="mt-3 text-xs text-store-muted">
            Validade:{' '}
            {new Intl.DateTimeFormat('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: 'America/Sao_Paulo',
            }).format(new Date(expiresAt!))}
            .
          </p>
        </div>
      )}

      {canStart && !code && (
        <button
          type="button"
          disabled={busy || sent}
          onClick={generate}
          className="mt-5 min-h-[46px] rounded-full bg-store-action px-6 text-sm text-white disabled:opacity-50"
        >
          {busy
            ? 'Gerando Pix de teste…'
            : sent
              ? 'Atualize a situação'
              : 'Gerar Pix de teste'}
        </button>
      )}

      {code && expired && (
        <p className="mt-4 text-sm">
          O prazo deste código terminou. Atualize a situação
          para conferir a tentativa.
        </p>
      )}

      <p
        role="status"
        aria-live="polite"
        className="mt-3 text-sm leading-6"
      >
        {message}
      </p>
    </section>
  )
}
