'use server'

import { checkoutDatabase, checkoutHash } from '@/lib/checkout-server'
import { assertPaymentOwner } from '@/lib/guest-checkout'
import { normalizeCheckoutDocument } from '@/lib/checkout-document'
import { readCheckoutSessionV2, checkoutSessionErrorV2, type CheckoutSessionV2 } from '@/lib/checkout-session-server-v2'
import { asaasConfig, asaasDatabaseEnvironment, asaasMerchant, createAsaasCustomer, createAsaasPayment, readAsaasPix, type AsaasExpectedPayment } from '@/lib/asaas-server'
import { assertAsaasReady, asaasPaymentFacts, reconcileAsaasAttempt } from '@/lib/asaas-checkout-server'
import { observeCheckoutPayment, paymentFailureCode } from '@/lib/payment-processing-server'
import { headers } from 'next/headers'
import { isIP } from 'node:net'
import { validateAsaasCardInput } from '@/lib/asaas-card'

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
interface Result { error: string; session?: CheckoutSessionV2 }

export async function startAsaasCheckoutPayment(id: string, attemptId: string, method: 'pix' | 'card', expectedCents: number, cardInput?: unknown): Promise<Result> {
  try {
    if (!UUID.test(id) || !UUID.test(attemptId) || !['pix','card'].includes(method)) throw new Error('CHECKOUT_ACCESS_INVALID')
    const card = method === 'card' ? validateAsaasCardInput(cardInput) : null
    if (card) normalizeCheckoutDocument(card.holderDocument)
    const remoteIp = process.env.VERCEL === '1' ? (headers().get('x-forwarded-for') || '').split(',')[0].trim()
      : process.env.NODE_ENV === 'development' ? '127.0.0.1' : ''
    if (card && !isIP(remoteIp)) throw new Error('ASAAS_CARD_INPUT_INVALID')
    const config = asaasConfig(true)
    const db = await checkoutDatabase('submit')
    await assertAsaasReady(db)
    const { session, accessHash } = await readCheckoutSessionV2(db, id)
    if (session.environment !== asaasDatabaseEnvironment()) throw new Error('ASAAS_ENVIRONMENT_MISMATCH')
    if (session.orderId || session.testApproved || session.needsReview || session.attempts.some(a =>
      a.blocksNewAttempt || a.applicationState === 'review' || ['approved','refunded','charged_back'].includes(a.state))) return { error: '', session }
    if (session.state !== 'pending' || session.shippingPending) throw new Error('PAYMENT_CHECKOUT_UNAVAILABLE')
    if (Date.parse(session.reservedUntil) <= Date.now() + 60000) throw new Error('PAYMENT_RESERVATION_EXPIRED')
    if (!Number.isSafeInteger(expectedCents) || expectedCents !== session.totalCents ||
      (session.paymentOptions && session.paymentOptions.selectedMethod !== method)) {
      return { error: 'Confira a forma de pagamento e o total atualizado antes de continuar.', session }
    }
    const saved = await db.from('serenity_checkout_sessions_v2').select('customer_snapshot,account_user_id,delivery_address').eq('id', id).single()
    if (saved.error) throw saved.error
    await assertPaymentOwner(saved.data?.account_user_id, db)
    const customer = saved.data?.customer_snapshot
    const document = normalizeCheckoutDocument(customer?.document)
    if (!customer || typeof customer.name !== 'string' || typeof customer.email !== 'string') throw new Error('ASAAS_CUSTOMER_INVALID')
    const address = saved.data?.delivery_address
    const phone = typeof customer.phone === 'string' ? customer.phone.replace(/\D/g, '') : ''
    if (card && (!address || !/^\d{8}$/.test(address.cep) || typeof address.number !== 'string' ||
      address.number.length < 1 || address.number.length > 30 || !/^\d{10,11}$/.test(phone))) throw new Error('ASAAS_CARD_INPUT_INVALID')
    const merchant = await asaasMerchant()
    const hash = checkoutHash(JSON.stringify({ provider: 'asaas', id, attemptId, method, merchant,
      environment: config.environment, amountCents: session.totalCents, document, email: customer.email }))
    const claimed = await db.rpc('serenity_asaas_claim_v1', {
      p_checkout: id, p_access_hash: accessHash, p_attempt: attemptId, p_merchant: merchant,
      p_request_hash: hash, p_method: method,
    })
    if (claimed.error) throw claimed.error
    if (claimed.data?.submit !== true) return { error: '', session: (await readCheckoutSessionV2(db, id)).session }
    const claim = claimed.data
    let stage = 'claim_validation'
    try {
      if (!UUID.test(claim.lease_id || '') || claim.checkout_id !== id || claim.attempt_id !== attemptId ||
        claim.environment !== session.environment || claim.merchant_id !== merchant || claim.method !== method ||
        claim.currency !== 'BRL' || Number(claim.amount_cents) !== session.totalCents ||
        claim.customer?.document !== document || claim.customer?.email !== customer.email ||
        claim.customer?.name !== customer.name) throw new Error('ASAAS_CLAIM_INVALID')
      // This POST only occurs after the atomic claim. A timeout never retries it.
      stage = 'customer'
      const customerId = await createAsaasCustomer({ name: customer.name, document, email: customer.email, reference: id })
      stage = 'customer_binding'
      const bound = await db.rpc('serenity_asaas_customer_v1', { p_attempt: attemptId, p_lease: claim.lease_id, p_customer: customerId })
      if (bound.error) throw bound.error
      const expected: AsaasExpectedPayment = { checkoutId: id, attemptId, customerId,
        amountCents: session.totalCents, method, environment: config.environment }
      const dueDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      const observedAt = new Date().toISOString()
      stage = 'charge'
      const payment = await createAsaasPayment(expected, dueDate, card ? {
        input: card, remoteIp, email: customer.email, postalCode: address.cep, addressNumber: address.number, phone,
      } : undefined)
      stage = 'observation'
      await observeCheckoutPayment(db, attemptId, asaasPaymentFacts(payment, expected, merchant, observedAt), 'create')
      if (payment.state === 'pending' && method === 'pix') {
        stage = 'pix_qr'
        const qr = await readAsaasPix(payment.id, expected)
        stage = 'pix_observation'
        await observeCheckoutPayment(db, attemptId, asaasPaymentFacts(payment, expected, merchant, observedAt, qr), 'create')
      }
    } catch (error) {
      const code = paymentFailureCode(error)
      console.error('[asaas-checkout]', { code, stage, attempt_id: attemptId })
      const uncertain = await db.rpc('serenity_asaas_uncertain_v1', { p_attempt: attemptId,
        p_lease: claim.lease_id, p_request_hash: hash,
        p_code: code.startsWith('ASAAS_') ? code : 'ASAAS_SUBMISSION_UNCERTAIN' })
      if (uncertain.error) console.error('[asaas-checkout]', { code: 'PAYMENT_DATABASE_UPDATE_FAILED' })
      return { error: `A tentativa precisa de conferência. Atualize a situação; não faça outro pagamento. Referência: ${code}.`,
        session: (await readCheckoutSessionV2(db, id)).session }
    }
    return { error: '', session: (await readCheckoutSessionV2(db, id)).session }
  } catch (error) { return { error: checkoutSessionErrorV2(error) } }
}

export async function refreshAsaasCheckoutPayment(id: string): Promise<Result> {
  let session: CheckoutSessionV2 | undefined
  try {
    if (!UUID.test(id)) throw new Error('CHECKOUT_ACCESS_INVALID')
    const db = await checkoutDatabase('review')
    session = (await readCheckoutSessionV2(db, id)).session
    const attempt = session.attempts.find(a => a.applicationState === 'review') || session.attempts.find(a => a.blocksNewAttempt) || session.attempts[0]
    if (attempt && !session.testApproved) {
      if (attempt.provider !== 'asaas') throw new Error('ASAAS_PAYMENT_MISMATCH')
      await reconcileAsaasAttempt(db, attempt.id, 'poll')
    }
    return { error: '', session: (await readCheckoutSessionV2(db, id)).session }
  } catch (error) {
    console.error('[asaas-refresh]', { code: paymentFailureCode(error) })
    return { error: `Não foi possível consultar agora. Não gere outra cobrança; tente atualizar a situação. Referência: ${paymentFailureCode(error)}.`, ...(session ? { session } : {}) }
  }
}

export async function guestCheckoutTrackingLink(id: string): Promise<{ error: string; url?: string }> {
  try {
    if (!UUID.test(id)) throw new Error('CHECKOUT_ACCESS_INVALID')
    const db = await checkoutDatabase('review')
    const { session } = await readCheckoutSessionV2(db, id)
    if (!session.guestCheckout) throw new Error('CHECKOUT_ACCESS_INVALID')
    const { guestEmailLink } = await import('@/lib/guest-tracking-server')
    return { error: '', url: await guestEmailLink(db, id) }
  } catch { return { error: 'Não foi possível abrir o link. Use o acompanhamento neste navegador ou fale com a equipe.' } }
}
