'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CardPayment, StatusScreen, initMercadoPago } from '@mercadopago/sdk-react'
import type { ComponentProps } from 'react'
import type { CheckoutAttemptV2, CheckoutSessionV2 } from '@/lib/checkout-session-server-v2'
import { startCardPayment } from './card-actions'

const customization = {
  paymentMethods: { minInstallments: 1, maxInstallments: 12, types: { included: ['credit_card' as const] } },
  visual: { hideFormTitle: true, style: { theme: 'dark' as const } },
}

const statusCustomization = { visual: { style: { theme: 'dark' as const } } }

export default function CardCheckout({
  checkoutId, totalCents, publicKey, canPay, attempt, onSession, onBusy, onRefresh,
}: {
  checkoutId: string
  totalCents: number
  publicKey: string
  canPay: boolean
  attempt?: CheckoutAttemptV2
  onSession: (session: CheckoutSessionV2 | undefined, error: string) => void
  onBusy: (busy: boolean) => void
  onRefresh: () => void
}) {
  const [initialized, setInitialized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [formVersion, setFormVersion] = useState(0)
  const locked = useRef(false)
  const submitted = useRef<string | null>(null)
  const mounted = useRef(true)
  const callbacks = useRef({ onSession, onBusy, onRefresh })
  callbacks.current = { onSession, onBusy, onRefresh }
  const latestAttempt = useRef(attempt)
  latestAttempt.current = attempt

  useEffect(() => {
    mounted.current = true
    initMercadoPago(publicKey, { locale: 'pt-BR' })
    setInitialized(true)
    return () => { mounted.current = false }
  }, [publicKey])

  // Objetos e callbacks estáveis impedem o SDK de apagar os campos em cada atualização do relógio.
  const initialization = useMemo(() => ({ amount: totalCents / 100 }), [totalCents])
  const authenticationURL = attempt?.cardAuthentication?.externalResourceURL
  const authenticationRequest = attempt?.cardAuthentication?.creq
  const statusInitialization = useMemo(() => ({
    paymentId: attempt?.providerPaymentId || '',
    ...(authenticationURL && authenticationRequest ? { additionalInfo: { externalResourceURL: authenticationURL, creq: authenticationRequest } } : {}),
  }), [attempt?.providerPaymentId, authenticationURL, authenticationRequest])

  const ready = useCallback(() => { if (mounted.current) setLoading(false) }, [])
  const statusReady = useCallback(() => {
    if (mounted.current) setLoading(false)
    callbacks.current.onRefresh()
  }, [])
  const fail = useCallback(() => {
    if (mounted.current) {
      setLoading(false)
      setNotice('Não foi possível carregar o formulário seguro. Atualize esta página; se já enviou o cartão, confira a situação antes de tentar novamente.')
    }
  }, [])

  const submit: ComponentProps<typeof CardPayment>['onSubmit'] = useCallback(async (data) => {
    if (locked.current) return
    locked.current = true
    callbacks.current.onBusy(true)
    setNotice('Conferindo o pagamento…')
    try {
      const key = `serenity-card-v3:${checkoutId}`
      const cached = sessionStorage.getItem(key)
      if (cached && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(cached)) throw new Error('INVALID_ATTEMPT')
      const previous = submitted.current || cached
      const previousAttempt = latestAttempt.current
      const canReplace = previousAttempt?.id === previous &&
        ['rejected', 'cancelled'].includes(previousAttempt.state) &&
        previousAttempt.applicationState === 'applied' && !previousAttempt.blocksNewAttempt
      const id = canReplace ? crypto.randomUUID() : previous || crypto.randomUUID()
      submitted.current = id
      // Apenas a identificação da tentativa é salva. Nunca salvar token ou dados do cartão no navegador.
      sessionStorage.setItem(key, id)
      const device = (window as Window & { MP_DEVICE_SESSION_ID?: unknown }).MP_DEVICE_SESSION_ID
      const result = await startCardPayment(checkoutId, id, {
        token: data.token,
        paymentMethodId: data.payment_method_id,
        installments: data.installments,
        ...(data.issuer_id != null && String(data.issuer_id) !== '' ? { issuerId: String(data.issuer_id) } : {}),
        ...(typeof device === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(device) ? { deviceSessionId: device } : {}),
        payer: {
          ...(data.payer?.email ? { email: data.payer.email } : {}),
          ...(data.payer?.identification?.type && data.payer.identification.number ? {
            identification: { type: data.payer.identification.type, number: data.payer.identification.number },
          } : {}),
        },
      }, totalCents)
      if (!mounted.current) return
      callbacks.current.onSession(result.session, result.error)
      const closed = result.session?.attempts.find(a => a.id === id &&
        ['rejected', 'cancelled'].includes(a.state) && !a.blocksNewAttempt && a.applicationState === 'applied')
      if (closed) {
        submitted.current = null
        sessionStorage.removeItem(key)
        setFormVersion(version => version + 1)
        setLoading(true)
      }
      setNotice(result.error ? '' : 'Resposta recebida. A confirmação será atualizada automaticamente.')
    } catch {
      if (mounted.current) setNotice('Não foi possível confirmar a resposta. Não envie novamente: atualize a página e confira a situação desta tentativa.')
    } finally {
      locked.current = false
      callbacks.current.onBusy(false)
    }
  }, [checkoutId, totalCents])

  if (!initialized) return <p role="status" className="mt-5 text-sm">Carregando pagamento seguro…</p>
  return (
    <section className="mt-6 rounded-2xl border border-store-border p-4 sm:p-5">
      <h2 className="text-lg font-medium">Cartão de crédito</h2>
      <p className="mt-2 text-xs leading-6 text-store-muted">Escolha as parcelas no formulário. As condições e eventuais juros são exibidos antes do pagamento.</p>
      {loading && <p role="status" className="mt-3 text-sm">Carregando os campos seguros…</p>}
      {canPay && !attempt?.blocksNewAttempt && (
        <CardPayment key={formVersion} initialization={initialization} customization={customization}
          onSubmit={submit} onReady={ready} onError={fail} locale="pt-BR" />
      )}
      {attempt?.providerPaymentId && attempt.state === 'pending' && attempt.applicationState !== 'review' && (
        <StatusScreen customization={statusCustomization} initialization={statusInitialization} onReady={statusReady} onError={fail} locale="pt-BR" />
      )}
      {notice && <p role="status" className="mt-3 text-sm leading-6">{notice}</p>}
    </section>
  )
}
