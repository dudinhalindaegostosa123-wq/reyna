import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  asaasConfig, asaasDatabaseEnvironment, asaasMerchant,
  findAsaasPayment, readAsaasPayment, readAsaasPaymentReference, readAsaasPix,
  type AsaasExpectedPayment, type AsaasPayment,
} from './asaas-server'
import { observeCheckoutPayment } from './payment-processing-server'

export async function assertAsaasReady(db: SupabaseClient) {
  const result = await db.rpc('serenity_asaas_ready_v1')
  if (result.error || result.data?.version !== 1 || result.data?.ready !== true) {
    throw new Error('PAYMENT_DATABASE_MIGRATION_REQUIRED')
  }
}

export function asaasPaymentFacts(payment: AsaasPayment, expected: AsaasExpectedPayment,
  merchant: string, observedAt: string,
  pix?: { payload: string; encodedImage: string; expirationDate: string } | null) {
  // Asaas returns local timestamps without an offset for Pix expiration.
  const expires = pix?.expirationDate
    ? pix.expirationDate.replace(' ', 'T') + (/(?:Z|[+-]\d{2}:\d{2})$/.test(pix.expirationDate) ? '' : '-03:00') : null
  if (expires && !Number.isFinite(Date.parse(expires))) throw new Error('ASAAS_RESPONSE_INVALID')
  return {
    provider: 'asaas', provider_payment_id: payment.id,
    environment: expected.environment === 'sandbox' ? 'test' : 'production',
    merchant_id: merchant, external_reference: expected.checkoutId, attempt_id: expected.attemptId,
    customer_id: expected.customerId, invoice_url: payment.invoiceUrl,
    amount_cents: expected.amountCents, refunded_cents: payment.state === 'refunded' ? expected.amountCents : 0,
    currency: 'BRL', method: expected.method,
    status: payment.state === 'approved' ? 'approved' : payment.state === 'refunded' ? 'refunded'
      : payment.state === 'pending' ? 'pending' : 'in_mediation',
    status_detail: payment.status, updated_at: observedAt, expires_at: expires,
    pix_code: pix?.payload || null, pix_qr_base64: pix?.encodedImage || null,
  }
}

export async function reconcileAsaasAttempt(db: SupabaseClient, id: string, source: 'admin' | 'reconcile' | 'poll' | 'webhook', paymentId?: string) {
  const found = await db.from('serenity_checkout_payments_v2')
    .select('id,checkout_id,provider,environment,merchant_id,method,amount_cents,provider_payment_id,asaas_customer_id')
    .eq('id', id).single()
  if (found.error || !found.data) throw new Error('PAYMENT_DATABASE_READ_FAILED')
  const row = found.data
  if (row.provider !== 'asaas' || row.environment !== asaasDatabaseEnvironment() ||
    !['pix', 'card'].includes(row.method) || row.merchant_id !== await asaasMerchant()) {
    throw new Error('ASAAS_PAYMENT_MISMATCH')
  }
  // Unknown customer means customer creation itself was uncertain. Never POST again.
  if (!row.asaas_customer_id) return { found: false, review: true }
  if (paymentId && row.provider_payment_id && paymentId !== row.provider_payment_id) throw new Error('ASAAS_PAYMENT_MISMATCH')
  const expected: AsaasExpectedPayment = {
    checkoutId: row.checkout_id, attemptId: row.id, customerId: row.asaas_customer_id,
    amountCents: Number(row.amount_cents), method: row.method, environment: asaasConfig().environment,
  }
  // Timestamp the start, so a slower older request cannot overwrite a newer read.
  const observedAt = new Date().toISOString()
  const remoteId = paymentId || row.provider_payment_id
  const payment = remoteId ? await readAsaasPayment(remoteId, expected) : await findAsaasPayment(expected)
  if (!payment) return { found: false, review: true }
  // Persist the verified charge before fetching QR; QR failure must not lose the ID.
  let result = await observeCheckoutPayment(db, id, asaasPaymentFacts(payment, expected, row.merchant_id, observedAt), source)
  if (payment.state === 'pending' && expected.method === 'pix') {
    const qr = await readAsaasPix(payment.id, expected)
    result = await observeCheckoutPayment(db, id, asaasPaymentFacts(payment, expected, row.merchant_id, observedAt, qr), source)
  }
  return { found: true, review: result.application_state === 'review' }
}

export async function processAsaasNotification(db: SupabaseClient, paymentId: string) {
  const reference = await readAsaasPaymentReference(paymentId)
  if (!reference) return { ignored: true }
  const id = reference.slice(37)
  const found = await db.from('serenity_checkout_payments_v2').select('id,checkout_id,provider')
    .eq('id', id).maybeSingle()
  if (found.error) throw new Error('PAYMENT_DATABASE_READ_FAILED')
  if (!found.data) return { ignored: true }
  if (found.data.provider !== 'asaas' || found.data.checkout_id !== reference.slice(0, 36)) throw new Error('ASAAS_PAYMENT_MISMATCH')
  const result = await reconcileAsaasAttempt(db, id, 'webhook', paymentId)
  if (!result.found || result.review) throw new Error('PAYMENT_ORDER_REVIEW')
  return { ignored: false }
}

/** Explicit admin recovery: authenticated empty search alone never permits a retry. */
export async function releaseRejectedAsaasPix(db: SupabaseClient, id: string, actor: string) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
  if (!uuid.test(id) || !uuid.test(actor)) throw new Error('PAYMENT_ATTEMPT_INVALID')
  const found = await db.from('serenity_checkout_payments_v2')
    .select('id,checkout_id,provider,environment,merchant_id,method,amount_cents,provider_payment_id,asaas_customer_id,state,application_state,last_error_code,lease_id,lease_expires_at,updated_at')
    .eq('id', id).single()
  if (found.error || !found.data) throw new Error('PAYMENT_DATABASE_READ_FAILED')
  const row = found.data
  // A mapped customer + no payment ID + a definitive HTTP 400 isolates a charge
  // validation rejection. QR retrieval failures and customer failures do not qualify.
  if (row.provider !== 'asaas' || row.method !== 'pix' || row.state !== 'uncertain' || row.application_state !== 'review' ||
    row.last_error_code !== 'ASAAS_HTTP_400' || row.provider_payment_id || !row.asaas_customer_id || row.lease_id || row.lease_expires_at ||
    row.environment !== asaasDatabaseEnvironment() || row.merchant_id !== await asaasMerchant()) throw new Error('PAYMENT_RECOVERY_UNAVAILABLE')
  const payment = await findAsaasPayment({ checkoutId: row.checkout_id, attemptId: row.id, customerId: row.asaas_customer_id,
    amountCents: Number(row.amount_cents), method: 'pix', environment: asaasConfig().environment })
  if (payment) throw new Error('PAYMENT_RECOVERY_PAYMENT_EXISTS')
  const result = await db.rpc('serenity_asaas_release_rejected_pix_v1', {
    p_attempt: row.id, p_expected_updated_at: row.updated_at, p_actor: actor,
  })
  if (result.error || result.data?.released !== true) throw new Error('PAYMENT_RECOVERY_UNAVAILABLE')
  return { retryAvailable: result.data.retry_available === true }
}
