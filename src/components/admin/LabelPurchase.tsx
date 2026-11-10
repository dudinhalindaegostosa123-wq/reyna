'use client'

import type { LabelScope } from '@/lib/label-scope'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { labelPurchaseAction } from '@/app/admin/frete/purchase-actions'
import { saleMoney } from '@/lib/admin-sales'
import type { LabelPurchaseView } from '@/lib/label-purchase'

const titles: Record<string, string> = {
  empty: 'Confira o valor da etiqueta',
  review: 'Pronta para comprar',
  buying: 'Compra em andamento',
  uncertain: 'Compra não confirmada',
  paid: 'Etiqueta comprada',
  generating: 'Etiqueta comprada — gerando',
  ready: 'Etiqueta pronta para imprimir',
  blocked: 'Etiqueta cancelada ou expirada',
}

const hints: Record<string, string> = {
  empty:
    'Confira o valor atual antes de comprar.',
  review:
    'A compra utiliza o saldo da carteira do Melhor Envio. Após o pagamento, o painel solicita a geração.',
  buying:
    'Atualize a situação. Não repita a compra enquanto a confirmação estiver pendente.',
  uncertain:
    'Confira a situação e a carteira do Melhor Envio antes de tentar outra compra.',
  paid:
    'O pagamento está confirmado. Solicite a geração para imprimir.',
  generating:
    'Aguarde a confirmação e atualize a situação. A etiqueta já foi comprada.',
  ready:
    'Obtenha o link da etiqueta e abra para imprimir. Confirme a postagem somente após entregar o pacote.',
  blocked:
    'Confira este envio na sua conta do Melhor Envio antes de continuar.',
}

export default function LabelPurchase({
  orderId,
  scope = 'current',
}: {
  orderId: string
  scope?: LabelScope
}) {
  const router = useRouter()

  const [view, setView] =
    useState<LabelPurchaseView | null>(null)

  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')
  const [now, setNow] = useState(Date.now())

  const running = useRef(false)

  useEffect(() => {
    let active = true

    running.current = true
    setBusy(true)
    setView(null)
    setUrl('')
    setMessage('')

    labelPurchaseAction(orderId, 'load', '', scope)
      .then(async result => {
        if (!active) return
        // Fetch the authoritative cost automatically; this never buys a label.
        if (!result.error && result.view && !result.view.issues.length && ['empty','review'].includes(result.view.phase)) {
          result = await labelPurchaseAction(orderId, 'check', '', scope)
          if (!active) return
        }

        if (result.view) setView(result.view)
        setMessage(result.error || '')
      })
      .catch(() => {
        if (active) {
          setMessage(
            'Não foi possível carregar a etiqueta. Tente carregar novamente.'
          )
        }
      })
      .finally(() => {
        if (active) {
          running.current = false
          setBusy(false)
        }
      })

    const timer = setInterval(
      () => setNow(Date.now()),
      15000
    )

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [orderId, scope])

  async function run(
    command: 'load' | 'check' | 'buy' | 'generate' | 'print'
  ) {
    if (running.current) return

    running.current = true
    setBusy(true)
    setMessage('')
    setUrl('')

    try {
      const result = await labelPurchaseAction(
        orderId,
        command,
        view?.reviewId || '',
        scope
      )

      if (result.view) {
        setView(result.view)
      } else if (command === 'buy') {
        setView(previous =>
          previous
            ? { ...previous, phase: 'uncertain' }
            : null
        )
      }

      if (result.url) setUrl(result.url)

      setMessage(
        result.error || result.message || ''
      )
    } catch {
      if (command === 'buy') {
        setView(previous =>
          previous
            ? { ...previous, phase: 'uncertain' }
            : null
        )

        setMessage(
          'A compra não foi confirmada. Atualize a situação e confira o Melhor Envio antes de tentar novamente.'
        )
      } else {
        setMessage(
          'Não foi possível confirmar esta ação. Atualize a situação antes de continuar.'
        )
      }
    } finally {
      running.current = false
      setBusy(false)
      setNow(Date.now())

      if (command !== 'load') {
        router.refresh()
      }
    }
  }

  const validPrice =
    view?.reviewCents !== null &&
    Number.isSafeInteger(view?.reviewCents) &&
    view!.reviewCents! >= 0

  const expired =
    !view ||
    !Number.isFinite(Date.parse(view.expires)) ||
    Date.parse(view.expires) <= now

  const canBuy = Boolean(
    view?.phase === 'review' &&
    validPrice &&
    view.reviewId &&
    !expired &&
    !view.issues.length
  )

  const primary =
    'inline-flex min-h-[44px] items-center rounded-full bg-[#292621] px-5 text-xs text-white disabled:opacity-40'

  const secondary =
    'inline-flex min-h-[44px] items-center rounded-full border border-[#DDD4C7] bg-white px-5 text-xs disabled:opacity-40'

  return (
    <section className="pb-4">
      <div className="rounded-xl bg-[#F5F1EA] p-4">
        <h3 className="text-sm font-medium">
          {view
            ? titles[view.phase] ||
              'Conferir situação da etiqueta'
            : busy
              ? 'Carregando etiqueta…'
              : 'Etiqueta não carregada'}
        </h3>

        {view && (
          <p className="mt-2 text-xs leading-6 text-[#625B51]">
            {hints[view.phase] ||
              'Confira este envio antes de continuar.'}
          </p>
        )}

        {view?.phase === 'review' && validPrice && (
          <p className="mt-3 text-base font-medium">
            Valor da etiqueta:{' '}
            {saleMoney(view.reviewCents! / 100)}
          </p>
        )}

        {view?.paidCents !== null &&
          view?.paidCents !== undefined && (
            <p className="mt-3 text-sm">
              Valor pago:{' '}
              <strong>
                {saleMoney(view.paidCents / 100)}
              </strong>
            </p>
          )}

        {view?.phase === 'review' && expired && (
          <p className="mt-2 text-xs text-amber-900">
            A conferência expirou.
            Confira o valor novamente.
          </p>
        )}
      </div>

      {view && view.issues.length > 0 && (
        <details
          open
          className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4"
        >
          <summary className="cursor-pointer text-xs font-medium">
            Pendências ({view.issues.length})
          </summary>

          <ul className="mt-3 list-disc space-y-2 pl-4 text-xs leading-6 text-amber-900">
            {view.issues.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {!view && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run('load')}
            className={secondary}
          >
            Carregar etiqueta
          </button>
        )}

        {view?.phase === 'empty' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run('check')}
            className={primary}
          >
            Conferir valor
          </button>
        )}

        {view?.phase === 'review' && (
          <button
            type="button"
            disabled={busy || !canBuy}
            onClick={() => void run('buy')}
            className={primary}
          >
            Comprar etiqueta
            {validPrice
              ? ` — ${saleMoney(view.reviewCents! / 100)}`
              : ''}
          </button>
        )}

        {view?.phase === 'paid' && (
          <button
            type="button"
            disabled={busy || view.issues.length > 0}
            onClick={() => void run('generate')}
            className={primary}
          >
            Gerar etiqueta
          </button>
        )}

        {view?.phase === 'ready' && !url && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run('print')}
            className={primary}
          >
            Obter etiqueta para imprimir
          </button>
        )}

        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={primary}
          >
            Abrir etiqueta para imprimir ↗
          </a>
        )}

        {view && view.phase !== 'empty' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run('check')}
            className={secondary}
          >
            {view.phase === 'review'
              ? 'Conferir valor novamente'
              : 'Atualizar situação'}
          </button>
        )}
      </div>

      <p
        role="status"
        aria-live="polite"
        className="mt-3 text-xs leading-6"
      >
        {busy ? 'Aguarde… ' : ''}
        {message}
      </p>

      <details className="mt-3">
        <summary className="min-h-[44px] cursor-pointer py-3 text-xs text-[#625B51]">
          Precisa conferir no Melhor Envio?
        </summary>

        <a
          href="https://melhorenvio.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center text-xs underline"
        >
          Abrir conta do Melhor Envio ↗
        </a>
      </details>
    </section>
  )
}
