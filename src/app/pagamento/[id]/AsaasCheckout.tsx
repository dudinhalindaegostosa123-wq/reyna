'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { CheckoutSessionV2 } from '@/lib/checkout-session-server-v2'
import { useCartStore } from '@/lib/cart'
import { startAsaasCheckoutPayment, refreshAsaasCheckoutPayment, guestCheckoutTrackingLink } from './actions-asaas'
import { selectPaymentMethodV4 } from './actions-v2'

const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
const inputClass = 'mt-1 min-h-[44px] w-full rounded-lg border border-store-border bg-white px-3 text-store-text'

export default function AsaasCheckout({ initial, enabled, queryEnabled, configurationError }: {
  initial: CheckoutSessionV2; enabled: boolean; queryEnabled: boolean; configurationError: string
}) {
  const [session, setSession] = useState(initial)
  const [method, setMethod] = useState<'pix' | 'card' | null>(initial.attempts[0]?.method || initial.paymentOptions?.selectedMethod || null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pixUncertain, setPixUncertain] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [copied, setCopied] = useState(false)
  const [cardPrivacyReady, setCardPrivacyReady] = useState(false)
  const [trackingUrl, setTrackingUrl] = useState('')
  const [trackingNotice, setTrackingNotice] = useState('')
  const request = useRef(false)
  const attemptId = useRef<string | null>(null)
  const clearCart = useCartStore(state => state.clearCart)
  const attempt = session.attempts.find(a => a.blocksNewAttempt) || session.attempts[0]
  const complete = Boolean(session.orderId || session.testApproved)
  const refunded = session.attempts.some(a => a.state === 'refunded')
  const financialReview = session.needsReview || session.attempts.some(a => a.state === 'charged_back')
  const reservationValid = Date.parse(session.reservedUntil) > now
  const canStart = enabled && !busy && !pixUncertain && !complete && !session.needsReview && session.state === 'pending' &&
    !session.shippingPending && Date.parse(session.reservedUntil) > now + 60000 && !session.attempts.some(a =>
      a.blocksNewAttempt || a.applicationState === 'review' || ['approved','refunded','charged_back'].includes(a.state))

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    // A client-side navigation can retain an analytics script from the storefront.
    // Reload this same URL once before mounting card inputs; payment pages exclude it.
    if (document.querySelector('script[src*="googletagmanager.com"]') ||
      'gtag' in window) { window.location.reload(); return }
    setCardPrivacyReady(true)
  }, [])
  useEffect(() => {
    if (!session.orderId && !session.testApproved) return
    try {
      const key = 'serenity-checkout-pending-v2'
      const cached = JSON.parse(sessionStorage.getItem(key) || 'null')
      if (cached?.id !== session.id) return
      const cart = useCartStore.getState().items.map(item => ({
        slug: item.slug, variant: item.variationId || '', quantity: item.quantity,
        color: item.anodization?.code || '',
        ...(typeof item.sterilized === 'boolean' ? { sterilized: item.sterilized } : {}),
        ...(item.stem && !item.stemLocked ? { stem: item.stem } : {}),
      }))
      if (session.orderId && cached.cart === JSON.stringify(cart)) clearCart()
      sessionStorage.removeItem(key)
      const pending = JSON.parse(sessionStorage.getItem('serenity-checkout-request-v2') || 'null')
      if (pending?.id === session.id) sessionStorage.removeItem('serenity-checkout-request-v2')
    } catch {}
  }, [session.id, session.orderId, session.testApproved, clearCart])

  async function refresh() {
    if (request.current || !queryEnabled) return
    request.current = true
    setBusy(true)
    try {
      const result = await refreshAsaasCheckoutPayment(session.id)
      if (result.session) {
        setSession(result.session)
        if (!result.error) setPixUncertain(false)
      }
      setError(result.error)
    } catch { setError('Não foi possível consultar agora. Não faça outro pagamento; atualize a situação.') }
    finally { request.current = false; setBusy(false) }
  }

  useEffect(() => {
    if (!attempt || complete || !queryEnabled || session.needsReview) return
    const timer = setInterval(() => { void refresh() }, 20000)
    return () => clearInterval(timer)
    // refresh reads the current session; reset polling when its state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, complete, queryEnabled])

  async function choose(next: 'pix' | 'card') {
    if (!canStart || request.current) return
    request.current = true
    setBusy(true); setError('')
    let pixSubmitted = false
    try {
      const result = await selectPaymentMethodV4(session.id, next)
      if (result.session) setSession(result.session)
      setError(result.error)
      if (!result.error && result.session && (!result.session.paymentOptions || result.session.paymentOptions.selectedMethod === next)) {
        if (method !== next) attemptId.current = null
        setMethod(next)
        if (next === 'pix') {
          attemptId.current ||= crypto.randomUUID()
          pixSubmitted = true
          const payment = await startAsaasCheckoutPayment(result.session.id, attemptId.current, 'pix', result.session.totalCents)
          if (payment.session) setSession(payment.session)
          else setPixUncertain(true)
          setError(payment.error)
        }
      }
    } catch {
      if (pixSubmitted) {
        setPixUncertain(true)
        setError('A resposta do Pix não chegou. Atualize a situação antes de tentar novamente; não faça outro pagamento.')
      } else setError('Não foi possível selecionar o pagamento. Tente novamente.')
    }
    finally { request.current = false; setBusy(false) }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canStart || !method || request.current) return
    const form = event.currentTarget
    let card: Record<string, string> | undefined
    if (method === 'card') {
      const data = new FormData(form)
      card = Object.fromEntries(['holderName','number','expiryMonth','expiryYear','ccv','holderDocument'].map(key => [key, String(data.get(key) || '')]))
    }
    // No card fields in React state, persistent storage, analytics or retry data.
    form.reset()
    request.current = true
    setBusy(true); setError('')
    attemptId.current ||= crypto.randomUUID()
    try {
      const result = await startAsaasCheckoutPayment(session.id, attemptId.current, method, session.totalCents, card)
      if (result.session) setSession(result.session)
      setError(result.error)
    } catch { setError('A resposta não chegou. Consulte a situação antes de tentar pagar novamente.') }
    finally { card = undefined; request.current = false; setBusy(false) }
  }

  const pixVisible = reservationValid && attempt?.state === 'pending' && attempt.applicationState !== 'review' &&
    !session.needsReview && attempt.method === 'pix' && attempt.pixCode && (!attempt.expiresAt || Date.parse(attempt.expiresAt) > now)

  return <main className="mx-auto max-w-2xl px-5 py-10">
    <h1 className="text-3xl font-medium">{session.orderId ? (refunded ? 'Pagamento estornado' : financialReview ? 'Pagamento em conferência' : 'Pagamento confirmado') : 'Pagamento'}</h1>
    <p className="mt-3 text-xl">{money(session.totalCents)}</p>
    {session.environment === 'test' && <p className="mt-3 rounded-lg bg-amber-50 p-3">Ambiente de testes: nenhum pedido real será criado.</p>}
    {session.orderId ? <div className="mt-6 space-y-4"><p role="status">{refunded ? 'O pagamento foi estornado. Confira os detalhes com a equipe.' : financialReview ? 'O pagamento precisa de conferência. Fale com a equipe antes de pagar novamente.' : `Recebemos seu pagamento. Pedido #${session.orderNumber} confirmado.`}</p>
      <Link className="underline" href={session.guestCheckout ? '/acompanhar' : '/minha-conta'}>Acompanhar pedido</Link>
      {session.guestCheckout && <div className="space-y-3 text-sm">
        <p>Guarde seu link para acompanhar a compra sem criar conta.</p>
        <button type="button" className="min-h-[44px] underline" onClick={async () => {
          try {
            const result = await guestCheckoutTrackingLink(session.id)
            if (!result.url) { setTrackingNotice(result.error); return }
            setTrackingUrl(result.url)
            try { await navigator.clipboard.writeText(result.url); setTrackingNotice('Link copiado. Guarde em um local seguro.') }
            catch { setTrackingNotice('Abra o link abaixo e guarde o endereço para acompanhar sua compra.') }
          } catch { setTrackingNotice('Não foi possível gerar o link agora. Tente novamente.') }
        }}>Copiar link de acompanhamento</button>
        {trackingNotice && <p role="status">{trackingNotice}</p>}
        {trackingUrl && <a className="block underline" href={trackingUrl}>Abrir link de acompanhamento</a>}
      </div>}
      </div>
      : session.testApproved ? <p role="status" className="mt-6">Teste aprovado. Nenhuma venda real foi registrada.</p>
      : <>
        {configurationError && <p role="alert" className="mt-4">{configurationError}</p>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-4">{error}</p>}
        {session.needsReview && <p role="status" className="mt-4">A tentativa precisa de conferência. Não pague novamente; fale com a equipe.</p>}
        {!reservationValid && <p role="status" className="mt-4">A reserva terminou. Não faça um novo pagamento nesta tentativa. Se já pagou, consulte a situação ou fale com a equipe.</p>}
        {session.shippingPending && <p className="mt-4">O frete precisa ser confirmado antes do pagamento.</p>}
        <fieldset disabled={!canStart} className="mt-6 grid grid-cols-2 gap-3">
          <legend className="mb-3 text-sm">Como prefere pagar?</legend>
          {(['pix','card'] as const).map(option => <button key={option} type="button" aria-pressed={method === option}
            onClick={() => void choose(option)} className={`min-h-[70px] rounded-xl border p-4 text-left disabled:opacity-60 ${method === option ? 'border-store-action bg-store-raised' : 'border-store-border'}`}>
            <span className="block font-medium">{option === 'pix' ? 'Pix' : 'Cartão de crédito'}</span>
            <span className="mt-1 block text-sm">{money(option === 'pix' ? session.paymentOptions?.pixTotalCents || session.totalCents : session.paymentOptions?.cardTotalCents || session.totalCents)}</span>
            <span className="mt-1 block text-xs">{option === 'pix' ? (session.paymentOptions?.pixDiscountCents ? '5% de desconto nas peças elegíveis' : 'QR Code ou copia e cola') : 'À vista, sem sair do site'}</span>
          </button>)}
        </fieldset>
        {canStart && method === 'card' && cardPrivacyReady && <form onSubmit={submit} className="mt-6 space-y-4" autoComplete="off">
          {method === 'card' && <fieldset disabled={busy} className="grid grid-cols-2 gap-4">
            <legend className="mb-3">Dados do cartão</legend>
            <label className="col-span-2 text-sm">Nome impresso no cartão<input name="holderName" autoComplete="cc-name" required maxLength={100} className={inputClass} /></label>
            <label className="col-span-2 text-sm">Número do cartão<input name="number" autoComplete="cc-number" inputMode="numeric" required maxLength={23} className={inputClass} /></label>
            <label className="text-sm">Mês de validade<input name="expiryMonth" autoComplete="cc-exp-month" inputMode="numeric" placeholder="MM" pattern="0[1-9]|1[0-2]" required maxLength={2} className={inputClass} /></label>
            <label className="text-sm">Ano de validade<input name="expiryYear" autoComplete="cc-exp-year" inputMode="numeric" placeholder="AAAA" pattern="20[0-9]{2}" required maxLength={4} className={inputClass} /></label>
            <label className="text-sm">Código de segurança<input name="ccv" type="password" autoComplete="cc-csc" inputMode="numeric" pattern="[0-9]{3,4}" required maxLength={4} className={inputClass} /></label>
            <label className="text-sm">CPF ou CNPJ do titular<input name="holderDocument" inputMode="numeric" required maxLength={18} className={inputClass} /></label>
            <label className="col-span-2 flex items-start gap-2 text-sm"><input type="checkbox" required className="mt-1" />Confirmo que o e-mail, telefone e endereço informados no checkout são os dados de cobrança do titular.</label>
            <p className="col-span-2 text-xs text-store-muted">O pagamento é processado pelo Asaas. Não salvamos o número do cartão nem o código de segurança.</p>
          </fieldset>}
          <button disabled={!canStart} className="min-h-[48px] w-full rounded-full bg-store-action px-6 py-3 text-white disabled:opacity-50">Pagar {money(session.totalCents)} no cartão</button>
        </form>}
        {busy && <p role="status" className="mt-4">{method === 'pix' ? 'Gerando seu Pix…' : 'Aguarde, estamos consultando o pagamento…'}</p>}
        {attempt?.state === 'pending' && !session.needsReview && <p role="status" className="mt-4">{attempt.method === 'pix' ? 'Pague pelo aplicativo do seu banco e aguarde a confirmação aqui.' : 'Aguardando confirmação do cartão. Não envie outro pagamento.'}</p>}
        {pixVisible && <section className="mt-6 rounded-xl border border-store-border p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {attempt.pixQr && <img src={`data:image/png;base64,${attempt.pixQr}`} alt="QR Code para pagamento Pix" width={240} height={240} className="mx-auto" />}
          <label className="mt-4 block text-sm">Pix copia e cola<textarea readOnly value={attempt.pixCode || ''} className="mt-2 w-full rounded-lg border p-3" /></label>
          <button type="button" className="mt-3 min-h-[44px] underline" onClick={async () => {
            try { await navigator.clipboard.writeText(attempt.pixCode || ''); setCopied(true) } catch { setError('Selecione e copie o código Pix acima.') }
          }}>{copied ? 'Código copiado' : 'Copiar código Pix'}</button>
          <p className="mt-3 text-xs">Conclua dentro do prazo da reserva: {new Date(session.reservedUntil).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília).</p>
        </section>}
        {queryEnabled && <button disabled={busy} type="button" onClick={() => void refresh()} className="mt-6 min-h-[44px] underline disabled:opacity-50">Atualizar situação do pagamento</button>}
      </>}
  </main>
}
