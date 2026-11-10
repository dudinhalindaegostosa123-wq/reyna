'use server'

import { assertPaymentOwner } from '@/lib/guest-checkout'

import { checkoutDatabase, checkoutHash } from '@/lib/checkout-server'
import { normalizeCheckoutDocument } from '@/lib/checkout-document'
import { validateCardPaymentInput } from '@/lib/card-payment'
import { mercadoPagoPublicConfig, mercadoPagoMerchant, mercadoPagoCreditCardMethod } from '@/lib/mercado-pago-server'
import { createMercadoPagoCard } from '@/lib/mercado-pago-card-server'
import { assertProductionPaymentReady, assertCardPaymentReady, observeCheckoutPayment, paymentFailureCode } from '@/lib/payment-processing-server'
import { readCheckoutSessionV2, checkoutSessionErrorV2, type CheckoutSessionV2 } from '@/lib/checkout-session-server-v2'

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export async function startCardPayment(id: string, attemptId: string, raw: unknown, expectedCents?: number): Promise<{ error: string; session?: CheckoutSessionV2 }> {
  try {
    if (typeof id !== 'string' || typeof attemptId !== 'string' || !UUID.test(id) || !UUID.test(attemptId)) {
      throw new Error('CHECKOUT_ACCESS_INVALID')
    }
    const input = validateCardPaymentInput(raw)
    const configuration = mercadoPagoPublicConfig()
    const db = await checkoutDatabase('submit')
    await assertProductionPaymentReady(db)
    await assertCardPaymentReady(db)
    const { session, accessHash } = await readCheckoutSessionV2(db, id)
    if (session.environment !== configuration.environment) throw new Error('MP_PAYMENT_ENVIRONMENT_MISMATCH')
    if (session.orderId || session.testApproved || session.needsReview || session.attempts.some(a =>
      a.blocksNewAttempt || a.applicationState === 'review' || ['approved', 'refunded', 'charged_back'].includes(a.state))) {
      return { error: '', session }
    }
    if (session.paymentOptions && (!Number.isSafeInteger(expectedCents) || expectedCents !== session.totalCents)) {
      return { error: 'O valor mudou. Confira o total atualizado e confirme novamente.', session }
    }
    if (session.state !== 'pending' || session.shippingPending) throw new Error('PAYMENT_CHECKOUT_UNAVAILABLE')
    if (Date.parse(session.reservedUntil) <= Date.now() + 60000) throw new Error('PAYMENT_RESERVATION_EXPIRED')

    const saved = await db.from('serenity_checkout_sessions_v2').select('customer_snapshot,account_user_id').eq('id', id).single()
    if (saved.error) throw saved.error
    await assertPaymentOwner(saved.data?.account_user_id,db)
    const customer = saved.data?.customer_snapshot
    if (!customer || typeof customer !== 'object' || Array.isArray(customer)) throw new Error('MP_CARD_INPUT_INVALID')
    const document = normalizeCheckoutDocument(customer.document)
    const email = input.payer?.email || customer.email
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{11}$|^\d{14}$/.test(document)) {
      throw new Error('MP_CARD_INPUT_INVALID')
    }
    const payer = {
      email,
      identification: input.payer?.identification || { type: document.length === 11 ? 'CPF' as const : 'CNPJ' as const, number: document },
    }
    const merchant = await mercadoPagoMerchant()
    await mercadoPagoCreditCardMethod(input.paymentMethodId)
    // Somente o HMAC é persistido; token e dados digitados não são gravados no banco.
    const hash = checkoutHash(JSON.stringify({
      version: 3, id, attemptId, merchant, environment: configuration.environment,
      method: 'card', amountCents: session.totalCents, input, payer,
    }))
    const claimed = await db.rpc('serenity_checkout_claim_card_v3', {
      p_checkout: id, p_access_hash: accessHash, p_attempt: attemptId,
      p_merchant: merchant, p_request_hash: hash,
    })
    if (claimed.error) throw claimed.error
    if (claimed.data?.submit !== true) return { error: '', session: (await readCheckoutSessionV2(db, id)).session }
    const claim = claimed.data
    try {
      if (typeof claim.lease_id !== 'string' || !UUID.test(claim.lease_id) ||
        claim.checkout_id !== id || claim.attempt_id !== attemptId || claim.method !== 'card' ||
        claim.environment !== configuration.environment || claim.merchant_id !== merchant ||
        claim.currency !== 'BRL' || Number(claim.amount_cents) !== session.totalCents ||
        claim.customer?.email !== customer.email || claim.customer?.document !== document) {
        throw new Error('MP_CLAIM_INVALID')
      }
      const observation = await createMercadoPagoCard({
        orderId: id, attemptId, merchantId: merchant, amountCents: session.totalCents,
        method: 'card', environment: configuration.environment,
      }, input, payer)
      await observeCheckoutPayment(db, attemptId, observation, 'create')
    } catch (error) {
      const code = paymentFailureCode(error)
      console.error('[card-payment]', { code })
      if (typeof claim.lease_id === 'string' && UUID.test(claim.lease_id)) {
        await db.rpc('serenity_checkout_pix_uncertain_v2', {
          p_attempt: attemptId, p_lease: claim.lease_id, p_request_hash: hash, p_code: /^MP_/.test(code) ? code : 'MP_SUBMISSION_UNCERTAIN',
        })
      }
      return {
        error: `Não foi possível confirmar esta tentativa. Não pague novamente. Referência: ${code}.`,
        session: (await readCheckoutSessionV2(db, id)).session,
      }
    }
    const updated = (await readCheckoutSessionV2(db, id)).session
    const rejected = updated.attempts.find(a => a.id === attemptId && ['rejected', 'cancelled'].includes(a.state))
    return { error: rejected ? 'O cartão não foi aprovado. Confira os dados ou use outro cartão.' : '', session: updated }
  } catch (error) {
    return { error: checkoutSessionErrorV2(error) }
  }
}
