import { mercadoPagoConfig } from '@/lib/mercado-pago-server'
import { verifyMercadoPagoWebhook, webhookBody } from '@/lib/mercado-pago-webhook'
import { paymentDatabase, paymentFailureCode, processPaymentNotification } from '@/lib/payment-processing-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function reply(body: unknown, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const signature = verifyMercadoPagoWebhook(request, process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() || '')
  if (!signature) {
    console.error('[payment-webhook]', { code: 'PAYMENT_WEBHOOK_SIGNATURE_INVALID' })
    return reply({ ok: false }, 401)
  }
  let body: Record<string, unknown>
  try {
    body = await webhookBody(request)
  } catch {
    return reply({ ok: false }, 400)
  }
  if (body.type !== 'payment') return reply({ ok: true, ignored: true }, 200)
  const data = body.data
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
    String((data as Record<string, unknown>).id) !== signature.paymentId) {
    return reply({ ok: false }, 400)
  }
  try {
    mercadoPagoConfig()
    const result = await processPaymentNotification(paymentDatabase(), signature.paymentId)
    return reply({ ok: true, ...result }, 200)
  } catch (error) {
    console.error('[payment-webhook]', { code: paymentFailureCode(error) })
    return reply({ ok: false }, 503)
  }
}
