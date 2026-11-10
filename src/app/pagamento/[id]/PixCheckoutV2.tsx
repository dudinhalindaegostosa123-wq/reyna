'use client'

import Link from 'next/link'
import { GoogleAdsPurchase } from '@/components/analytics/GoogleAdsProvider'
import dynamic from 'next/dynamic'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useCartStore } from '@/lib/cart'
import type {
  CheckoutSessionV2,
} from '@/lib/checkout-session-server-v2'
import {
  startPixV2,
  selectPaymentMethodV4,
  refreshCheckoutPaymentV2,
} from './actions-v2'

const CardCheckout = dynamic(() => import('./CardCheckout'), { ssr: false })

export default function PixCheckoutV2({
  initial,
  enabled,
  configurationError = '',
  publicKey = '',
  cardReady = false,
  queryEnabled = enabled,
}: {
  initial: CheckoutSessionV2
  enabled: boolean
  configurationError?: string
  publicKey?: string
  cardReady?: boolean
  queryEnabled?: boolean
}) {
  const [session, setSession] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(
    initial.orderId || initial.testApproved
      ? ''
      : configurationError
  )
  const [notice, setNotice] = useState('')
  const [methodBusy, setMethodBusy] = useState(false)
  const methodRequest = useRef(false)
  const autoMethodPrepared = useRef(false)
  const pricingRevision = useRef(0)
  const [cardBusy, setCardBusy] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<'pix' | 'card' | null>(() =>
    initial.attempts.find(a => a.blocksNewAttempt)?.method || initial.paymentOptions?.selectedMethod || (!cardReady && !initial.paymentOptions ? 'pix' : null))
  const currentMethod = session.attempts.find(a => a.blocksNewAttempt)?.method || selectedMethod
  const activeCard = session.attempts.find(a => a.method === 'card' && a.blocksNewAttempt)
  const latestCard = activeCard || session.attempts.find(a => a.method === 'card')
  const updateCard = useCallback((updated: CheckoutSessionV2 | undefined, message: string) => {
    if (updated) setSession(updated)
    setError(message)
  }, [])

  const [now, setNow] = useState(() => Date.now())

  const started = useRef(false)
  const mounted = useRef(true)
  const generating = useRef(false)
  const polling = useRef(false)

  const clearCart = useCartStore(
    state => state.clearCart
  )

  const canStart =
    enabled &&
    session.state === 'pending' &&
    !session.orderId &&
    !session.shippingPending &&
    !session.needsReview &&
    !session.testApproved &&
    Date.parse(session.reservedUntil) > now + 60000 &&
    !session.attempts.some(
      a =>
        a.blocksNewAttempt ||
        a.applicationState === 'review' ||
        [
          'approved',
          'refunded',
          'charged_back',
        ].includes(a.state)
    )

  const chooseMethod = useCallback(async (method: 'pix' | 'card') => {
    if (!canStart || busy || cardBusy || methodRequest.current) return
    started.current = false
    if (!session.paymentOptions) { setSelectedMethod(method); return }
    methodRequest.current = true
    pricingRevision.current++
    setMethodBusy(true)
    setError('')
    try {
      const result = await selectPaymentMethodV4(session.id, method)
      if (mounted.current) {
        if (result.session) setSession(result.session)
        setError(result.error)
        if (!result.error && result.session) {
          if (result.session.paymentOptions && result.session.paymentOptions.selectedMethod !== method) {
            setError('A forma de pagamento mudou em outra janela. Confira a situação antes de continuar.')
          } else setSelectedMethod(method)
        }
      }
    } catch { if (mounted.current) setError('Não foi possível atualizar o valor. Tente escolher a forma de pagamento novamente.') }
    finally { methodRequest.current = false; if (mounted.current) setMethodBusy(false) }
  }, [canStart, busy, cardBusy, session.id, session.paymentOptions])

  useEffect(() => {
    if (!cardReady && !selectedMethod && !methodBusy && canStart && !autoMethodPrepared.current) {
      autoMethodPrepared.current = true
      void chooseMethod('pix')
    }
  }, [cardReady, selectedMethod, methodBusy, canStart, chooseMethod])

  const pix = session.attempts.find(
    a =>
      a.method === 'pix' &&
      a.state === 'pending' &&
      a.applicationState !== 'review' &&
      a.blocksNewAttempt
  )

  const validCode =
    pix?.expiresAt &&
    Date.parse(pix.expiresAt) > now
      ? pix.pixCode
      : null

  useEffect(() => {
    mounted.current = true

    const timer = setInterval(
      () => setNow(Date.now()),
      1000
    )

    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  }, [])

  const generate = useCallback(async () => {
    if (
      generating.current ||
      started.current ||
      !canStart ||
      currentMethod !== 'pix' ||
      methodBusy
    ) {
      return
    }

    generating.current = true
    started.current = true
    setBusy(true)
    setError('')

    try {
      const key = `serenity-pix-v2:${session.id}`
      const saved = sessionStorage.getItem(key)

      if (
        saved &&
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          saved
        )
      ) {
        throw new Error('INVALID_ATTEMPT')
      }

      const closed = session.attempts.find(a => a.id === saved && ['rejected', 'cancelled'].includes(a.state) && !a.blocksNewAttempt && a.applicationState === 'applied')
      const attempt = closed ? crypto.randomUUID() : saved || crypto.randomUUID()

      sessionStorage.setItem(key, attempt)

      const result = await startPixV2(
        session.id,
        attempt,
        session.totalCents
      )

      if (mounted.current) {
        if (result.session) {
          setSession(result.session)
        }

        setError(result.error)
      }
    } catch {
      if (mounted.current) {
        setError(
          'Não foi possível confirmar a resposta. Atualize esta página antes de continuar; não refaça a compra.'
        )
      }
    } finally {
      generating.current = false

      if (mounted.current) {
        setBusy(false)
      }
    }
  }, [canStart, currentMethod, session.id, session.totalCents, session.attempts, methodBusy])

  useEffect(() => {
    void generate()
  }, [generate])

  const refresh = useCallback(async () => {
    if (
      polling.current ||
      generating.current ||
      methodRequest.current ||
      !queryEnabled
    ) {
      return
    }

    polling.current = true
    const revision = pricingRevision.current

    try {
      const result =
        await refreshCheckoutPaymentV2(session.id)

      if (mounted.current && revision === pricingRevision.current) {
        if (result.session) {
          setSession(result.session)
        }

        setError(previous =>
          result.error ||
          (
            result.session?.needsReview
              ? previous
              : ''
          )
        )
      }
    } catch {
      if (mounted.current && revision === pricingRevision.current) {
        setError(
          'Não foi possível consultar agora. Não gere outro pagamento.'
        )
      }
    } finally {
      polling.current = false
    }
  }, [queryEnabled, session.id])

  const monitor =
    queryEnabled &&
    !session.orderId &&
    !session.testApproved &&
    Date.parse(session.reservedUntil) +
      5 * 60000 > now &&
    session.attempts.some(a =>
      [
        'submitting',
        'pending',
        'uncertain',
      ].includes(a.state) || (a.state === 'approved' && a.applicationState === 'review')
    )

  useEffect(() => {
    if (!monitor) return

    const timer = setInterval(() => {
      if (
        document.visibilityState === 'visible'
      ) {
        void refresh()
      }
    }, 15000)

    return () => clearInterval(timer)
  }, [monitor, refresh])

  useEffect(() => {
    if (
      !session.orderId &&
      !session.testApproved
    ) {
      return
    }

    try {
      const key = 'serenity-checkout-pending-v2'

      const cached = JSON.parse(
        sessionStorage.getItem(key) || 'null'
      )

      if (cached?.id !== session.id) return

      if (session.orderId) {
        const cart =
          useCartStore.getState().items.map(
            item => ({
              slug: item.slug,
              variant: item.variationId || '',
              quantity: item.quantity,
              color:
                item.anodization?.code || '',
              ...(typeof item.sterilized==='boolean'?{sterilized:item.sterilized}:{}),
              ...(item.stem && !item.stemLocked ? {stem:item.stem}:{}),
            })
          )

        if (
          cached.cart === JSON.stringify(cart)
        ) {
          clearCart()
        }
      }

      sessionStorage.removeItem(key)

      const request = JSON.parse(
        sessionStorage.getItem(
          'serenity-checkout-request-v2'
        ) || 'null'
      )

      if (request?.id === session.id) {
        sessionStorage.removeItem(
          'serenity-checkout-request-v2'
        )
      }
    } catch {}
  }, [
    session.id,
    session.orderId,
    session.testApproved,
    clearCart,
  ])

  let title = currentMethod === 'card' ? 'Pagamento com cartão' : currentMethod === 'pix' ? 'Pagamento com Pix' : 'Forma de pagamento'

  let message =
    currentMethod === 'card'
      ? 'Preencha os dados no formulário seguro. Seu pedido será registrado após a confirmação do pagamento.'
      : currentMethod === 'pix'
        ? 'O código Pix aparecerá automaticamente. Seu pedido será registrado após a confirmação do pagamento.'
        : 'Escolha Pix ou cartão de crédito. Seu pedido será registrado após a confirmação do pagamento.'

  if (session.testApproved) {
    title = 'Teste aprovado'
    message =
      'A aprovação de teste foi registrada. Nenhum pedido real foi criado e nenhum valor real foi confirmado.'
  } else if (
    session.needsReview ||
    session.state === 'review'
  ) {
    title = 'Pagamento em conferência'
    message =
      'Estamos conferindo esta tentativa. Não refaça a compra nem gere outro pagamento.'
  } else if (session.orderId) {
    title =
      `Pedido #${session.orderNumber} confirmado`
    message =
      session.guestCheckout ? 'Pagamento confirmado. Acompanhe seu pedido pelo botão abaixo e pelas atualizações por e-mail.' : 'O pagamento foi confirmado. Acompanhe seu pedido em Minha conta.'
  } else if (session.shippingPending) {
    title = 'Frete a confirmar'
    message =
      'Fale com a equipe Lunarity para confirmar o frete antes de pagar. Ainda não há pedido registrado.'
  } else if (
    Date.parse(session.reservedUntil) <= now
  ) {
    title = 'Reserva encerrada'
    message =
      'A disponibilidade precisa ser conferida. Se você já tentou pagar, fale com a equipe antes de iniciar outra compra.'
  } else if (!enabled) {
    message =
      configurationError ||
      'O pagamento online ainda não está disponível neste ambiente.'
  } else if (
    session.attempts.some(a =>
      [
        'rejected',
        'cancelled',
        'refunded',
      ].includes(a.state)
    ) &&
    !pix && currentMethod !== 'card'
  ) {
    message =
      'Esta tentativa foi encerrada. Nenhum novo pagamento será gerado automaticamente. Fale com a equipe para continuar.'
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <GoogleAdsPurchase session={session} />
      <Link
        href="/"
        className="inline-flex min-h-[44px] items-center text-xs underline"
      >
        ← Voltar à loja
      </Link>

      <nav aria-label="Etapas da compra" className="mt-4 rounded-2xl border border-store-border bg-store-surface p-4">
        <ol className="grid grid-cols-3 gap-3 text-xs sm:text-sm">
          <li className="flex items-center gap-2 text-store-muted"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-store-raised">✓</span>Dados e entrega</li>
          <li aria-current={!session.orderId && !session.testApproved ? 'step' : undefined} className="flex items-center gap-2 font-medium"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-store-action text-white">2</span>Pagamento</li>
          <li aria-current={session.orderId || session.testApproved ? 'step' : undefined} className="flex items-center gap-2 text-store-muted"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${session.orderId || session.testApproved ? 'bg-store-action text-white' : 'bg-store-raised'}`}>3</span>Confirmação</li>
        </ol>
      </nav>
      <section className="mt-5 rounded-3xl border border-store-border bg-store-surface p-5 sm:p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-store-accent">
          Lunarity
        </p>

        <h1 className="mt-3 font-display text-4xl">
          {title}
        </h1>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-store-canvas p-5">
          <span className="text-sm">
            {session.shippingPending
              ? 'Total sem frete a confirmar'
              : 'Total'}
          </span>

          <strong className="text-3xl font-medium">
            {new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            }).format(session.totalCents / 100)}
          </strong>
        </div>

        <p
          role="status"
          className="mt-5 text-sm leading-7 text-store-muted"
        >
          {message}
        </p>

        {session.environment === 'test' && (
          <p className="mt-5 rounded-2xl bg-store-warning-bg p-4 text-sm leading-6 text-store-warning">
            Ambiente de teste. Não pague este código
            pelo aplicativo do seu banco.
          </p>
        )}

        {methodBusy && <p role="status" className="mt-4 text-sm text-store-muted">Atualizando o valor da forma de pagamento…</p>}
        {(session.paymentOptions?.appliedDiscountCents || 0) > 0 && <p className="mt-3 text-sm text-store-accent">5% OFF no Pix incluídos: − {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((session.paymentOptions?.appliedDiscountCents || 0) / 100)}. Frete e anodização não recebem esse desconto.</p>}
        {canStart && !busy && !cardBusy && !currentMethod && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button type="button" aria-label="Pix" disabled={methodBusy} onClick={() => void chooseMethod('pix')}
              className="min-h-[100px] rounded-2xl border border-[#947B57] bg-store-canvas px-5 py-5 text-left transition-colors hover:bg-store-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#947B57]">
              <span className="block text-lg font-medium">Pix</span><span className="mt-2 block text-xs leading-5 text-store-muted">QR Code ou copia e cola pelo aplicativo do seu banco.</span>{session.paymentOptions && <span className="mt-2 block text-sm font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(session.paymentOptions.pixTotalCents / 100)}{session.paymentOptions.pixDiscountCents > 0 && <span className="ml-2 text-xs text-store-accent">5% OFF</span>}</span>}</button>
            {cardReady && <button type="button" aria-label="Cartão de crédito" disabled={methodBusy} onClick={() => void chooseMethod('card')}
              className="min-h-[100px] rounded-2xl border border-store-border px-5 py-5 text-left transition-colors hover:bg-store-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#947B57]">
              <span className="block text-lg font-medium">Cartão de crédito</span><span className="mt-2 block text-xs leading-5 text-store-muted">Consulte as parcelas disponíveis antes de pagar.</span>{session.paymentOptions && <span className="mt-2 block text-sm font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(session.paymentOptions.cardTotalCents / 100)}</span>}</button>}
          </div>
        )}

        {currentMethod === 'card' && publicKey && !session.needsReview && !session.orderId && !session.testApproved &&
          (canStart || activeCard?.providerPaymentId) && (
          <>
            <CardCheckout checkoutId={session.id} totalCents={session.totalCents} publicKey={publicKey}
              canPay={canStart && cardReady && !methodBusy} attempt={latestCard} onSession={updateCard}
              onBusy={setCardBusy} onRefresh={refresh} />
            {canStart && !cardBusy && <button type="button" onClick={() => setSelectedMethod(null)}
              className="mt-3 min-h-[44px] text-sm underline">Alterar forma de pagamento</button>}
          </>
        )}

        {busy && (
          <p
            role="status"
            className="mt-5 text-sm"
          >
            Preparando seu Pix…
          </p>
        )}

        {validCode &&
          !session.needsReview &&
          !session.orderId &&
          !session.testApproved && (
            <div className="mt-6 rounded-2xl border border-store-border p-4 sm:p-6">
              <div className="mb-5 border-b border-store-border pb-5 text-center">
                <p className="text-sm font-medium">Seu Pix está pronto</p>
                <p className="mt-4 font-mono text-4xl tracking-widest tabular-nums" role="timer" aria-live="off" aria-label="Tempo restante para pagar">
                  {String(Math.floor(Math.max(0, Date.parse(pix!.expiresAt!) - now) / 60000)).padStart(2, '0')}:{String(Math.floor(Math.max(0, Date.parse(pix!.expiresAt!) - now) / 1000) % 60).padStart(2, '0')}
                </p>
                <p className="mt-2 text-xs text-store-muted">Tempo restante para usar este código</p>
              </div>
              {pix?.pixQr && (
                <img
                  src={`data:image/png;base64,${pix.pixQr}`}
                  alt="QR Code para pagamento com Pix"
                  width={240}
                  height={240}
                  className="mx-auto h-60 w-60 max-w-full rounded-xl bg-white p-3 object-contain"
                />
              )}

              <label
                htmlFor="pix-v2-code"
                className="mt-5 block text-sm"
              >
                Pix copia e cola
              </label>

              <textarea
                id="pix-v2-code"
                readOnly
                rows={3}
                value={validCode}
                className="mt-2 w-full rounded-xl border border-store-border p-3 text-xs"
              />

              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      validCode
                    )
                    setNotice('Código copiado.')
                  } catch {
                    setNotice(
                      'Selecione e copie o código no campo acima.'
                    )
                  }
                }}
                className="mt-3 min-h-[46px] w-full rounded-full bg-store-action px-6 text-sm text-white"
              >
                Copiar código Pix
              </button>

              <p className="mt-3 text-xs text-store-muted">
                Válido até{' '}
                {new Intl.DateTimeFormat(
                  'pt-BR',
                  {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'America/Sao_Paulo',
                  }
                ).format(
                  new Date(pix!.expiresAt!)
                )}
                .
              </p>

              <ol className="mt-5 space-y-2 rounded-xl bg-store-canvas p-4 text-xs leading-6 text-store-muted">
                <li>1. Abra o aplicativo do seu banco e escolha Pix.</li>
                <li>2. Escaneie o QR Code ou cole o código copiado.</li>
                <li>3. Confira o valor e o destinatário antes de confirmar.</li>
              </ol>
              <p className="mt-4 text-xs leading-6 text-store-muted">
                Pagamento processado pelo Mercado Pago. A confirmação é consultada automaticamente
                enquanto esta página estiver aberta.
              </p>
            </div>
          )}

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-store-error-bg p-4 text-sm leading-6 text-store-error"
          >
            {error}
          </p>
        )}

        {error && canStart && !busy && currentMethod === 'pix' && (
          <button
            type="button"
            onClick={() => {
              started.current = false
              void generate()
            }}
            className="mt-3 min-h-[44px] text-sm underline"
          >
            Tentar novamente
          </button>
        )}

        {(error || session.needsReview) && !canStart && queryEnabled && (
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-3 min-h-[44px] text-sm underline"
          >
            Conferir situação
          </button>
        )}

        <p
          role="status"
          aria-live="polite"
          className="mt-3 text-sm"
        >
          {notice}
        </p>

        <Link
          href={session.guestCheckout ? "/acompanhar" : "/minha-conta"}
          className="mt-6 inline-flex min-h-[44px] items-center text-sm underline"
        >
          {session.guestCheckout ? "Acompanhar meu pedido" : "Minha conta"}
        </Link>
      </section>
    </main>
  )
}
