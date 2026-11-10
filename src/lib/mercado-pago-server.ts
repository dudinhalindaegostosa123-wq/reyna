import { readFetch } from '@/lib/read-fetch'
import 'server-only'

const API = 'https://api.mercadopago.com'

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export type MercadoPagoEnvironment = 'test' | 'production'

type ObjectData = Record<string, unknown>

export interface MercadoPagoExpectedPayment {
  orderId: string
  attemptId: string
  merchantId: string
  amountCents: number
  method: 'pix' | 'card'
  environment?: MercadoPagoEnvironment
}

export interface MercadoPagoObservation {
  provider_payment_id: string
  environment: MercadoPagoEnvironment
  merchant_id: string
  external_reference: string
  attempt_id: string
  amount_cents: number
  refunded_cents: number
  currency: 'BRL'
  method: 'pix' | 'card'
  status: string
  status_detail: string
  updated_at: string
  expires_at: string | null
  card_authentication?: { external_resource_url: string; creq: string } | null
  pix_code: string | null
  pix_qr_base64: string | null
}

function object(value: unknown): ObjectData {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error('MP_RESPONSE_INVALID')
  }

  return value as ObjectData
}

function identifier(value: unknown): string {
  if (
    typeof value === 'number' &&
    !Number.isSafeInteger(value)
  ) {
    throw new Error('MP_RESPONSE_INVALID')
  }

  if (
    (
      typeof value !== 'number' &&
      typeof value !== 'string'
    ) ||
    !/^[0-9]{1,40}$/.test(String(value))
  ) {
    throw new Error('MP_RESPONSE_INVALID')
  }

  return String(value)
}

function cents(value: unknown): number {
  if (
    (
      typeof value !== 'number' &&
      typeof value !== 'string'
    ) ||
    !/^[0-9]{1,13}(\.[0-9]{1,2})?$/.test(String(value))
  ) {
    throw new Error('MP_AMOUNT_INVALID')
  }

  const parts = String(value).split('.')

  const result =
    Number(parts[0]) * 100 +
    Number((parts[1] || '').padEnd(2, '0'))

  if (
    !Number.isSafeInteger(result) ||
    result < 0
  ) {
    throw new Error('MP_AMOUNT_INVALID')
  }

  return result
}

function date(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error('MP_RESPONSE_INVALID')
  }

  return new Date(value).toISOString()
}

export function mercadoPagoConfig() {
  const environment = process.env.MERCADO_PAGO_ENVIRONMENT?.trim()
  if (environment !== 'test' && environment !== 'production') {
    throw new Error('MP_ENVIRONMENT_REQUIRED')
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()
  const publicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY?.trim()
  if (!accessToken || !publicKey ||
    !/^(TEST-|APP_USR-)[A-Za-z0-9_-]+$/.test(accessToken) ||
    !/^(TEST-|APP_USR-)[A-Za-z0-9_-]+$/.test(publicKey)) {
    throw new Error('MP_CREDENTIALS_REQUIRED')
  }

  let notificationUrl: string | undefined
  if (environment === 'production') {
    if (process.env.VERCEL_ENV !== 'production') {
      throw new Error('MP_PRODUCTION_DISABLED')
    }
    if (!accessToken.startsWith('APP_USR-') || !publicKey.startsWith('APP_USR-')) {
      throw new Error('MP_PRODUCTION_CREDENTIALS_REQUIRED')
    }
    if ((process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim().length || 0) < 16) {
      throw new Error('MP_WEBHOOK_CONFIGURATION')
    }
    try {
      const site = new URL(process.env.SERENITY_SITE_URL?.trim() || '')
      if (site.protocol !== 'https:' || site.username || site.password ||
        site.search || site.hash || site.pathname !== '/') throw new Error()
      const notification = new URL('/api/webhooks/mercado-pago', site.origin)
      notification.searchParams.set('source_news', 'webhooks')
      notificationUrl = notification.toString()
    } catch {
      throw new Error('MP_SITE_CONFIGURATION')
    }
  }

  return { accessToken, publicKey, environment: environment as MercadoPagoEnvironment, notificationUrl }
}

export function mercadoPagoPublicConfig() {
  const { publicKey, environment } = mercadoPagoConfig()
  if (environment === 'production' && process.env.MERCADO_PAGO_PAYMENTS_ENABLED?.trim() !== 'true') {
    throw new Error('MP_PRODUCTION_DISABLED')
  }
  return { publicKey, environment }
}

// Compatibilidade somente com integrações antigas de teste.
export function mercadoPagoTestPublicConfig() {
  const configuration = mercadoPagoPublicConfig()
  if (configuration.environment !== 'test') throw new Error('MP_TEST_ENVIRONMENT_REQUIRED')
  return { ...configuration, environment: 'test' as const }
}

async function getJson(path: string): Promise<unknown> {
  const { accessToken } = mercadoPagoConfig()

  const controller = new AbortController()

  const timer = setTimeout(
    () => controller.abort(),
    10000
  )

  try {
    const response = await readFetch(API + path, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    }, fetch)

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(`MP_HTTP_${response.status}`)
      }
      throw new Error('MP_QUERY_FAILED')
    }

    const text = await response.text()

    if (text.length > 1500000) {
      throw new Error('MP_RESPONSE_INVALID')
    }

    return JSON.parse(text)
  } catch (error) {
    const known =
      error instanceof Error &&
      /^MP_[A-Z0-9_]+$/.test(error.message)

    throw new Error(
      known
        ? (error as Error).message
        : 'MP_QUERY_FAILED'
    )
  } finally {
    clearTimeout(timer)
  }
}

async function get(path: string): Promise<ObjectData> {
  return object(await getJson(path))
}

export async function mercadoPagoCreditCardMethod(id: string) {
  if (!/^[a-z0-9_]{1,40}$/.test(id)) throw new Error('MP_CARD_METHOD_INVALID')
  const methods = await getJson('/v1/payment_methods')
  if (!Array.isArray(methods)) throw new Error('MP_RESPONSE_INVALID')
  const available = methods.some(method => method && typeof method === 'object' &&
    method.id === id && method.payment_type_id === 'credit_card' && method.status === 'active')
  if (!available) throw new Error('MP_CARD_METHOD_INVALID')
}

export async function mercadoPagoMerchant(): Promise<string> {
  const { accessToken } = mercadoPagoConfig()

  const account = await get('/users/me')

  if (account.site_id !== 'MLB') {
    throw new Error('MP_ACCOUNT_COUNTRY_INVALID')
  }

  // Um token APP_USR só pode ser usado aqui quando a API
  // identifica explicitamente a conta como usuário de teste.
  if (
    mercadoPagoConfig().environment === 'test' &&
    accessToken.startsWith('APP_USR-') &&
    (
      !Array.isArray(account.tags) ||
      !account.tags.includes('test_user')
    )
  ) {
    console.error('[mercado-pago]', {
      code: 'MP_TEST_ACCOUNT_REQUIRED',
    })

    throw new Error('MP_TEST_ACCOUNT_REQUIRED')
  }

  if (mercadoPagoConfig().environment === 'production' &&
    Array.isArray(account.tags) && account.tags.includes('test_user')) {
    throw new Error('MP_PRODUCTION_ACCOUNT_REQUIRED')
  }
  return identifier(account.id)
}

export async function mercadoPagoTestMerchant(): Promise<string> {
  mercadoPagoTestPublicConfig()
  return mercadoPagoMerchant()
}

// Usar somente com resposta consultada no servidor
// pela credencial da loja.
export function normalizeMercadoPagoPayment(
  input: unknown,
  expected: MercadoPagoExpectedPayment
): MercadoPagoObservation {
  const configuration = mercadoPagoConfig()
  if (expected.environment && expected.environment !== configuration.environment) {
    throw new Error('MP_PAYMENT_MISMATCH')
  }

  if (
    !UUID.test(expected.orderId) ||
    !UUID.test(expected.attemptId) ||
    !/^[0-9]{1,40}$/.test(expected.merchantId) ||
    !Number.isSafeInteger(expected.amountCents) ||
    expected.amountCents < 1 ||
    !['pix', 'card'].includes(expected.method)
  ) {
    throw new Error('MP_EXPECTATION_INVALID')
  }

  const payment = object(input)
  const metadata = object(payment.metadata)

  const paymentId = identifier(payment.id)
  const merchant = identifier(payment.collector_id)
  const amount = cents(payment.transaction_amount)
  const refunded = cents(
    payment.transaction_amount_refunded
  )

  const status = payment.status
  const detail = payment.status_detail

  const method =
    payment.payment_method_id === 'pix' &&
    payment.payment_type_id === 'bank_transfer'
      ? 'pix'
      : ['credit_card', 'debit_card'].includes(
          String(payment.payment_type_id)
        )
        ? 'card'
        : ''

  if (
    payment.live_mode !== (configuration.environment === 'production') ||
    payment.currency_id !== 'BRL' ||
    merchant !== expected.merchantId ||
    amount !== expected.amountCents ||
    refunded > amount ||
    payment.external_reference !== expected.orderId ||
    metadata.serenity_attempt_id !== expected.attemptId ||
    method !== expected.method
  ) {
    throw new Error('MP_PAYMENT_MISMATCH')
  }

  if (
    typeof status !== 'string' ||
    !/^[a-z_]{1,40}$/.test(status) ||
    (
      detail != null &&
      (
        typeof detail !== 'string' ||
        detail.length > 120
      )
    )
  ) {
    throw new Error('MP_RESPONSE_INVALID')
  }

  let pixCode: string | null = null
  let pixQr: string | null = null

  if (
    method === 'pix' &&
    ['pending', 'in_process'].includes(status)
  ) {
    const interaction =
      payment.point_of_interaction == null
        ? {}
        : object(payment.point_of_interaction)

    const transaction =
      interaction.transaction_data == null
        ? {}
        : object(interaction.transaction_data)

    if (transaction.qr_code != null) {
      if (
        typeof transaction.qr_code !== 'string' ||
        transaction.qr_code.length > 4096
      ) {
        throw new Error('MP_RESPONSE_INVALID')
      }

      pixCode = transaction.qr_code || null
    }

    if (transaction.qr_code_base64 != null) {
      if (
        typeof transaction.qr_code_base64 !== 'string' ||
        transaction.qr_code_base64.length > 300000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(
          transaction.qr_code_base64
        )
      ) {
        throw new Error('MP_RESPONSE_INVALID')
      }

      pixQr = transaction.qr_code_base64 || null
    }
  }

  let cardAuthentication: { external_resource_url: string; creq: string } | null = null
  if (method === 'card' && ['pending', 'in_process'].includes(status) &&
    payment.three_ds_info != null) {
    const info = object(payment.three_ds_info)
    if (info.external_resource_url != null || info.creq != null) {
      if (typeof info.external_resource_url !== 'string' || info.external_resource_url.length > 2048 ||
        typeof info.creq !== 'string' || !/^[A-Za-z0-9_+/=-]{1,16384}$/.test(info.creq)) {
        throw new Error('MP_RESPONSE_INVALID')
      }
      let resource: URL
      try { resource = new URL(info.external_resource_url) } catch { throw new Error('MP_RESPONSE_INVALID') }
      if (resource.protocol !== 'https:' || resource.username || resource.password) throw new Error('MP_RESPONSE_INVALID')
      cardAuthentication = { external_resource_url: resource.toString(), creq: info.creq }
    }
  }

  return {
    provider_payment_id: paymentId,
    card_authentication: cardAuthentication,
    environment: configuration.environment,
    merchant_id: merchant,
    external_reference: expected.orderId,
    attempt_id: expected.attemptId,
    amount_cents: amount,
    refunded_cents: refunded,
    currency: 'BRL',
    method: expected.method,
    status,
    status_detail:
      typeof detail === 'string' ? detail : '',
    updated_at: date(payment.date_last_updated),
    expires_at:
      payment.date_of_expiration == null
        ? null
        : date(payment.date_of_expiration),
    pix_code: pixCode,
    pix_qr_base64: pixQr,
  }
}

export async function readMercadoPagoPayment(
  paymentId: string,
  expected: MercadoPagoExpectedPayment
): Promise<MercadoPagoObservation> {
  const id = identifier(paymentId)

  const payment = await get(
    '/v1/payments/' + id
  )

  if (identifier(payment.id) !== id) {
    throw new Error('MP_PAYMENT_MISMATCH')
  }

  return normalizeMercadoPagoPayment(
    payment,
    expected
  )
}

export function normalizeMercadoPagoTestPayment(input: unknown, expected: MercadoPagoExpectedPayment) {
  mercadoPagoTestPublicConfig()
  return normalizeMercadoPagoPayment(input, { ...expected, environment: 'test' })
}

export async function readMercadoPagoTestPayment(id: string, expected: MercadoPagoExpectedPayment) {
  mercadoPagoTestPublicConfig()
  return readMercadoPagoPayment(id, { ...expected, environment: 'test' })
}

// Somente o servidor consulta esta resposta. Não expor o objeto ao navegador.
export async function readMercadoPagoPaymentIdentity(id: string) {
  const payment = await get('/v1/payments/' + identifier(id))
  if (identifier(payment.id) !== id) throw new Error('MP_PAYMENT_MISMATCH')
  if (payment.metadata == null) throw new Error('MP_UNRELATED_PAYMENT')
  const metadata = object(payment.metadata)
  if (typeof metadata.serenity_attempt_id !== 'string' ||
    !UUID.test(metadata.serenity_attempt_id)) throw new Error('MP_UNRELATED_PAYMENT')
  return { attemptId: metadata.serenity_attempt_id, payment }
}
