import { verifyAsaasWebhookToken } from '@/lib/asaas-server'
import { webhookBody } from '@/lib/mercado-pago-webhook'
import { paymentDatabase, paymentFailureCode } from '@/lib/payment-processing-server'
import { processAsaasNotification } from '@/lib/asaas-checkout-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function reply(body: unknown, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  if (!verifyAsaasWebhookToken(request.headers.get('asaas-access-token'))) return reply({ ok: false }, 401)
  let body: Record<string, unknown>
  try { body = await webhookBody(request) } catch { return reply({ ok: false }, 400) }
  if (typeof body.event !== 'string' || !body.event.startsWith('PAYMENT_')) return reply({ ok: true, ignored: true }, 200)
  const payment = body.payment as Record<string, unknown> | undefined
  if (!payment || typeof payment.id !== 'string' || !/^pay_[A-Za-z0-9_-]{1,100}$/.test(payment.id)) return reply({ ok: false }, 400)
  try {
    const result = await processAsaasNotification(paymentDatabase(), payment.id)
    return reply({ ok: true, ...result }, 200)
  } catch (error) {
    console.error('[asaas-webhook]', { code: paymentFailureCode(error) })
    return reply({ ok: false }, 503)
  }
}
