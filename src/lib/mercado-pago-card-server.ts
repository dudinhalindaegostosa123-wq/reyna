import 'server-only'
import type { CardPaymentInput } from '@/lib/card-payment'
import {
  mercadoPagoConfig, mercadoPagoPublicConfig, normalizeMercadoPagoPayment,
  type MercadoPagoExpectedPayment,
} from '@/lib/mercado-pago-server'

export async function createMercadoPagoCard(
  expected: MercadoPagoExpectedPayment,
  input: CardPaymentInput,
  payer: { email: string; identification: { type: 'CPF' | 'CNPJ'; number: string } }
) {
  const configuration = mercadoPagoPublicConfig()
  if (expected.environment !== configuration.environment || expected.method !== 'card') {
    throw new Error('MP_PAYMENT_ENVIRONMENT_MISMATCH')
  }
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
  if (!uuid.test(expected.orderId) || !uuid.test(expected.attemptId) ||
    !/^[0-9]{1,40}$/.test(expected.merchantId) ||
    !Number.isSafeInteger(expected.amountCents) || expected.amountCents < 1 ||
    !/^[a-f0-9]{32}$/i.test(input.token) || !/^[a-z0-9_]{1,40}$/.test(input.paymentMethodId) ||
    !Number.isInteger(input.installments) || input.installments < 1 || input.installments > 12 ||
    !/^\d{11}$|^\d{14}$/.test(payer.identification.number) ||
    payer.identification.type !== (payer.identification.number.length === 11 ? 'CPF' : 'CNPJ') ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payer.email) || payer.email.length > 254) {
    throw new Error('MP_CARD_INPUT_INVALID')
  }
  const { accessToken, notificationUrl } = mercadoPagoConfig()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST', headers: {
        Authorization: `Bearer ${accessToken}`, Accept: 'application/json',
        'Content-Type': 'application/json', 'X-Idempotency-Key': expected.attemptId,
        ...(input.deviceSessionId ? { 'X-meli-session-id': input.deviceSessionId } : {}),
      },
      body: JSON.stringify({
        transaction_amount: expected.amountCents / 100,
        token: input.token, payment_method_id: input.paymentMethodId,
        ...(input.issuerId ? { issuer_id: input.issuerId } : {}),
        installments: input.installments,
        payer, description: 'Pedido Serenity Piercings', statement_descriptor: 'SERENITY',
        external_reference: expected.orderId, metadata: { serenity_attempt_id: expected.attemptId },
        three_d_secure_mode: 'optional',
        ...(notificationUrl ? { notification_url: notificationUrl } : {}),
      }),
      cache: 'no-store', redirect: 'error', signal: controller.signal,
    })
    const body = await response.text()
    if (body.length > 1500000) throw new Error('MP_RESPONSE_TOO_LARGE')
    if (!response.ok) {
      const requestId = response.headers.get('x-request-id') || ''
      console.error('[mercado-pago-card]', {
        http: response.status,
        requestId: /^[A-Za-z0-9_-]{1,128}$/.test(requestId) ? requestId : undefined,
      })
      throw new Error(`MP_HTTP_${response.status}`)
    }
    return normalizeMercadoPagoPayment(JSON.parse(body), expected)
  } catch (error) {
    throw new Error(error instanceof Error && /^MP_[A-Z0-9_]{1,70}$/.test(error.message)
      ? error.message : 'MP_SUBMISSION_UNCERTAIN')
  } finally { clearTimeout(timer) }
}
