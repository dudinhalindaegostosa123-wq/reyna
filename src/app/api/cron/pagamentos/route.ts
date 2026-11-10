import { timingSafeEqual } from 'node:crypto'
import { mercadoPagoConfig } from '@/lib/mercado-pago-server'
import { paymentDatabase, reconcilePaymentAttempt, paymentFailureCode } from '@/lib/payment-processing-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() || ''
  const expected = Buffer.from(`Bearer ${secret}`)
  const supplied = Buffer.from(request.headers.get('authorization') || '')
  if (secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return Response.json({ ok: false }, { status: 401 })
  }
  if (process.env.VERCEL_ENV !== 'production') return Response.json({ ok: true, skipped: true })
  let done = 0
  let failed = 0
  const started = Date.now()
  try {
    const { environment } = mercadoPagoConfig()
    const db = paymentDatabase()
    const found = await db.from('serenity_checkout_payments_v2')
      .select('id').eq('environment', environment)
      .in('state', ['submitting', 'pending', 'uncertain', 'approved'])
      .neq('application_state', 'test_approved')
      .neq('application_state', 'applied')
      .order('state', { ascending: true })
      .order('last_reconciled_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true }).limit(20)
    if (found.error) throw new Error('PAYMENT_DATABASE_READ_FAILED')
    for (const attempt of found.data || []) {
      if (Date.now() - started > 25000) break
      try {
        const result = await reconcilePaymentAttempt(db, attempt.id, 'reconcile')
        if (result.review) {
          failed++
          console.error('[payment-reconcile]', { code: 'PAYMENT_ORDER_REVIEW' })
        } else { done++ }
      } catch (error) {
        failed++
        console.error('[payment-reconcile]', { code: paymentFailureCode(error) })
      } finally {
        const saved = await db.from('serenity_checkout_payments_v2')
          .update({ last_reconciled_at: new Date().toISOString() }).eq('id', attempt.id)
        if (saved.error) throw new Error('PAYMENT_DATABASE_UPDATE_FAILED')
      }
    }
    // Reaproveita o agendador existente e respeita a duração máxima da função.
    if (Date.now() - started < 5000 && process.env.SERENITY_EMAIL_ENABLED === 'true') {
      try {
        const { drainOrderEmails } = await import('@/lib/order-email-server')
        await drainOrderEmails(db, undefined, 3)
      } catch { console.error('[order-email]', { code: 'EMAIL_WORKER_FAILED' }) }
    }
    return Response.json({ ok: failed === 0, done, failed }, { status: failed ? 503 : 200 })
  } catch (error) {
    console.error('[payment-reconcile]', { code: paymentFailureCode(error) })
    return Response.json({ ok: false, done, failed }, { status: 503 })
  }
}
