import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath, revalidateTag } from 'next/cache'
import {
  mercadoPagoConfig,
  mercadoPagoMerchant,
  normalizeMercadoPagoPayment,
  readMercadoPagoPaymentIdentity,
} from '@/lib/mercado-pago-server'
import { reconcileMercadoPagoPayment } from '@/lib/mercado-pago-reconcile-server'

export function paymentDatabase() {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !key) throw new Error('PAYMENT_DATABASE_CONFIGURATION')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, {
      ...init, cache: 'no-store', signal: AbortSignal.timeout(8000),
    }) },
  })
}

export async function assertProductionPaymentReady(db: SupabaseClient) {
  if (mercadoPagoConfig().environment !== 'production') return
  const result = await db.rpc('serenity_checkout_payment_ready_v3')
  if (result.error || result.data?.version !== 3 || result.data?.ready !== true) {
    throw new Error('PAYMENT_DATABASE_MIGRATION_REQUIRED')
  }
}

export function paymentFailureCode(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  return /^(MP|PAYMENT)_[A-Z0-9_]{1,70}$/.test(message)
    ? message : 'PAYMENT_PROCESSING_FAILED'
}

function refreshViews() {
  revalidateTag('catalog')
  revalidatePath('/admin/pagamentos')
  revalidatePath('/admin/pedidos')
  revalidatePath('/admin/operacao')
  revalidatePath('/admin/cupons')
  revalidatePath('/admin/produtos')
  revalidatePath('/minha-conta', 'layout')
}

const columns = 'id,checkout_id,environment,merchant_id,method,amount_cents,provider_payment_id'

type Attempt = {
  id: string
  checkout_id: string
  environment: 'test' | 'production'
  merchant_id: string
  method: 'pix' | 'card'
  amount_cents: number
  provider_payment_id: string | null
}

function expected(row: Attempt, merchant: string) {
  const configuration = mercadoPagoConfig()
  if (row.environment !== configuration.environment || row.merchant_id !== merchant || !['pix', 'card'].includes(row.method)) {
    throw new Error('MP_PAYMENT_MISMATCH')
  }
  return {
    orderId: row.checkout_id, attemptId: row.id, merchantId: row.merchant_id,
    amountCents: Number(row.amount_cents), method: row.method, environment: row.environment,
  }
}

export async function cardPaymentReady(db: SupabaseClient) {
  const result = await db.rpc('serenity_checkout_card_ready_v3')
  return !result.error && result.data?.version === 3 && result.data?.ready === true
}

export async function assertCardPaymentReady(db: SupabaseClient) {
  if (!await cardPaymentReady(db)) throw new Error('MP_CARD_CONFIGURATION')
}

export async function observeCheckoutPayment(db: SupabaseClient, attempt: string, facts: { method: string }, source: string) {
  const result = await db.rpc(facts.method === 'card' ? 'serenity_checkout_observe_payment_v3' : 'serenity_checkout_observe_payment_v2', {
    p_attempt: attempt, p_observation: facts, p_source: source,
  })
  if (result.error) throw new Error('PAYMENT_DATABASE_OBSERVE_FAILED')
  refreshViews()
  if (process.env.SERENITY_EMAIL_ENABLED === 'true' && process.env.VERCEL_ENV === 'production' && result.data?.state === 'approved' && result.data?.application_state === 'applied' && result.data?.order_id) {
    try {
      const { safeDrainOrderEmails } = await import('@/lib/order-email-server')
      await safeDrainOrderEmails(db, result.data.order_id)
    } catch { console.error('[order-email]', { code: 'EMAIL_WORKER_FAILED' }) }
  }
  return result.data as { state: string; application_state: string; order_id?: string | null }
}

export async function processPaymentNotification(db: SupabaseClient, paymentId: string) {
  let identity: Awaited<ReturnType<typeof readMercadoPagoPaymentIdentity>>
  try {
    identity = await readMercadoPagoPaymentIdentity(paymentId)
  } catch (error) {
    if (error instanceof Error && error.message === 'MP_UNRELATED_PAYMENT') return { ignored: true }
    throw error
  }
  const found = await db.from('serenity_checkout_payments_v2')
    .select(columns).eq('id', identity.attemptId).maybeSingle()
  if (found.error) throw new Error('PAYMENT_DATABASE_READ_FAILED')
  if (!found.data) return { ignored: true }
  const row = found.data as Attempt
  const merchant = await mercadoPagoMerchant()
  const facts = normalizeMercadoPagoPayment(identity.payment, expected(row, merchant))
  const result = await observeCheckoutPayment(db, row.id, facts, 'webhook')
  // A aprovação está salva, mas a conversão falhou: solicitar nova entrega do webhook.
  if (result.state === 'approved' && result.application_state === 'review') {
    throw new Error('PAYMENT_ORDER_REVIEW')
  }
  return { ignored: false }
}

export async function reconcilePaymentAttempt(db: SupabaseClient, id: string, source: 'admin' | 'reconcile') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('PAYMENT_ATTEMPT_INVALID')
  }
  const found = await db.from('serenity_checkout_payments_v2').select(columns).eq('id', id).single()
  if (found.error || !found.data) throw new Error('PAYMENT_DATABASE_READ_FAILED')
  const row = found.data as Attempt
  const merchant = await mercadoPagoMerchant()
  const facts = await reconcileMercadoPagoPayment(expected(row, merchant), row.provider_payment_id)
  if (!facts) return { found: false, review: true }
  const result = await observeCheckoutPayment(db, row.id, facts, source)
  return { found: true, review: result.application_state === 'review' }
}
