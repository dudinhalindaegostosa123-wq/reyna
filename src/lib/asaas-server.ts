import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'
import type { AsaasCardInput } from './asaas-card'

export type AsaasEnvironment = 'sandbox' | 'production'
export type AsaasMethod = 'pix' | 'card'
export interface AsaasExpectedPayment {
  checkoutId: string
  attemptId: string
  customerId: string
  amountCents: number
  method: AsaasMethod
  environment: AsaasEnvironment
}
export interface AsaasPayment {
  id: string
  customerId: string
  reference: string
  amountCents: number
  method: AsaasMethod
  status: string
  state: 'pending' | 'approved' | 'refunded' | 'review'
  invoiceUrl: string | null
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const PAYMENT = /^pay_[A-Za-z0-9_-]{1,100}$/
const CUSTOMER = /^cus_[A-Za-z0-9_-]{1,100}$/

function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ASAAS_RESPONSE_INVALID')
  return value as Record<string, unknown>
}

export function asaasConfig(forCreation = false) {
  const environment = process.env.ASAAS_ENVIRONMENT?.trim()
  const apiKey = process.env.ASAAS_API_KEY?.trim()
  if (environment !== 'sandbox' && environment !== 'production') throw new Error('ASAAS_ENVIRONMENT_REQUIRED')
  if (!apiKey || /[\s\r\n]/.test(apiKey)) throw new Error('ASAAS_CREDENTIALS_REQUIRED')
  // Sandbox credentials must never be sent to production, or vice versa.
  if (!apiKey.startsWith(environment === 'sandbox' ? '$aact_hmlg_' : '$aact_prod_')) {
    throw new Error('ASAAS_CREDENTIAL_ENVIRONMENT_MISMATCH')
  }
  if (environment === 'production' && (process.env.VERCEL_ENV !== 'production' ||
    (process.env.ASAAS_WEBHOOK_TOKEN?.length || 0) < 32)) throw new Error('ASAAS_PRODUCTION_CONFIGURATION')
  if (forCreation && process.env.ASAAS_PAYMENTS_ENABLED !== 'true') throw new Error('ASAAS_PAYMENTS_DISABLED')
  return {
    environment: environment as AsaasEnvironment,
    apiKey,
    baseUrl: environment === 'sandbox' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3',
  }
}

export function verifyAsaasWebhookToken(received: string | null): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN || ''
  if (expected.length < 32 || !received || received.length > 1024) return false
  return timingSafeEqual(createHash('sha256').update(expected).digest(), createHash('sha256').update(received).digest())
}

async function request(path: string, method: 'GET' | 'POST', payload?: unknown): Promise<Record<string, unknown>> {
  const config = asaasConfig(method === 'POST')
  if (!/^\/[A-Za-z0-9_/?=&%.-]+$/.test(path) || path.startsWith('//') || path.includes('..')) throw new Error('ASAAS_REQUEST_INVALID')
  // Writes are deliberately never retried. An ambiguous response requires reconciliation.
  let response: Response
  try {
    response = await fetch(config.baseUrl + path, {
      method,
      headers: { access_token: config.apiKey, Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'ReynaCheckout/1.0' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
    })
  } catch { throw new Error(method === 'POST' ? 'ASAAS_SUBMISSION_UNCERTAIN' : 'ASAAS_QUERY_FAILED') }
  // Never put remote response bodies, which may contain buyer details, in errors.
  if (!response.ok) throw new Error(`ASAAS_HTTP_${response.status}`)
  try {
    const body = await response.text()
    if (body.length > 1500000) throw new Error()
    return row(JSON.parse(body))
  } catch { throw new Error(method === 'POST' ? 'ASAAS_SUBMISSION_UNCERTAIN' : 'ASAAS_RESPONSE_INVALID') }
}

function reference(expected: AsaasExpectedPayment): string {
  if (!UUID.test(expected.checkoutId) || !UUID.test(expected.attemptId) || !CUSTOMER.test(expected.customerId) ||
    !Number.isSafeInteger(expected.amountCents) || expected.amountCents < 1 ||
    !['pix', 'card'].includes(expected.method) || !['sandbox', 'production'].includes(expected.environment)) {
    throw new Error('ASAAS_EXPECTATION_INVALID')
  }
  return `${expected.checkoutId}:${expected.attemptId}`
}

function cents(value: unknown): number {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d{1,13}(?:\.\d{1,2})?$/.test(String(value))) throw new Error('ASAAS_AMOUNT_INVALID')
  const [whole, fraction = ''] = String(value).split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(result)) throw new Error('ASAAS_AMOUNT_INVALID')
  return result
}

export function normalizeAsaasPayment(value: unknown, expected: AsaasExpectedPayment): AsaasPayment {
  const payment = row(value)
  const expectedReference = reference(expected)
  if (asaasConfig().environment !== expected.environment) throw new Error('ASAAS_ENVIRONMENT_MISMATCH')
  if (typeof payment.id !== 'string' || !PAYMENT.test(payment.id) || payment.customer !== expected.customerId ||
    payment.externalReference !== expectedReference || cents(payment.value) !== expected.amountCents ||
    payment.billingType !== (expected.method === 'pix' ? 'PIX' : 'CREDIT_CARD')) throw new Error('ASAAS_PAYMENT_MISMATCH')
  let invoice: URL | null = null
  if (payment.invoiceUrl != null) {
    try { invoice = new URL(String(payment.invoiceUrl)) } catch { throw new Error('ASAAS_RESPONSE_INVALID') }
    const host = expected.environment === 'sandbox' ? 'sandbox.asaas.com' : 'www.asaas.com'
    if (invoice.protocol !== 'https:' || invoice.hostname !== host || invoice.port || invoice.username || invoice.password || !invoice.pathname.startsWith('/i/')) {
      throw new Error('ASAAS_INVOICE_URL_INVALID')
    }
  }
  const status = String(payment.status)
  let state: AsaasPayment['state'] = 'review'
  if (['PENDING', 'AWAITING_RISK_ANALYSIS', 'OVERDUE'].includes(status)) state = 'pending'
  if (['CONFIRMED', 'RECEIVED'].includes(status)) state = 'approved'
  if (status === 'REFUNDED') state = 'refunded'
  // Partial refunds, manual cash receipts, deletion and disputes require review.
  if (payment.deleted === true || (Array.isArray(payment.refunds) && payment.refunds.length > 0 && state !== 'refunded')) state = 'review'
  return { id: payment.id, customerId: expected.customerId, reference: expectedReference,
    amountCents: expected.amountCents, method: expected.method, status, state, invoiceUrl: invoice?.toString() || null }
}

export async function createAsaasCustomer(input: { name: string; document: string; email: string; reference: string }): Promise<string> {
  if (input.name.trim().length < 2 || input.name.length > 120 || !/^\d{11}(?:\d{3})?$/.test(input.document) ||
    input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || !UUID.test(input.reference)) throw new Error('ASAAS_CUSTOMER_INVALID')
  const result = await request('/customers', 'POST', {
    name: input.name.trim(), cpfCnpj: input.document, email: input.email,
    externalReference: input.reference, notificationDisabled: true,
  })
  if (typeof result.id !== 'string' || !CUSTOMER.test(result.id)) throw new Error('ASAAS_SUBMISSION_UNCERTAIN')
  return result.id
}

/** Caller must acquire a database submission lease and persist the customer mapping first. */
export async function createAsaasPayment(expected: AsaasExpectedPayment, dueDate: string,
  card?: { input: AsaasCardInput; remoteIp: string; email: string; postalCode: string; addressNumber: string; phone: string }): Promise<AsaasPayment> {
  const externalReference = reference(expected)
  const configuration = asaasConfig(true)
  if (configuration.environment !== expected.environment) throw new Error('ASAAS_ENVIRONMENT_MISMATCH')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0,10) !== dueDate) throw new Error('ASAAS_DUE_DATE_INVALID')
  if ((expected.method === 'card') !== Boolean(card)) throw new Error('ASAAS_CARD_INPUT_INVALID')
  const result = await request('/payments', 'POST', {
    customer: expected.customerId,
    billingType: expected.method === 'pix' ? 'PIX' : 'CREDIT_CARD',
    value: expected.amountCents / 100, dueDate, externalReference,
    description: 'Pedido ' + expected.checkoutId,
    ...(card ? {
      creditCard: { holderName: card.input.holderName, number: card.input.number,
        expiryMonth: card.input.expiryMonth, expiryYear: card.input.expiryYear, ccv: card.input.ccv },
      creditCardHolderInfo: { name: card.input.holderName, email: card.email,
        cpfCnpj: card.input.holderDocument, postalCode: card.postalCode,
        addressNumber: card.addressNumber, phone: card.phone },
      remoteIp: card.remoteIp,
    } : {}),
  })
  try { return normalizeAsaasPayment(result, expected) }
  catch { throw new Error('ASAAS_SUBMISSION_UNCERTAIN') }
}

export async function readAsaasPayment(id: string, expected: AsaasExpectedPayment): Promise<AsaasPayment> {
  reference(expected)
  if (!PAYMENT.test(id)) throw new Error('ASAAS_PAYMENT_ID_INVALID')
  if (asaasConfig().environment !== expected.environment) throw new Error('ASAAS_ENVIRONMENT_MISMATCH')
  const payment = normalizeAsaasPayment(await request('/payments/' + id, 'GET'), expected)
  if (payment.id !== id) throw new Error('ASAAS_PAYMENT_MISMATCH')
  return payment
}

/** A missing result never authorizes another POST. */
export async function findAsaasPayment(expected: AsaasExpectedPayment): Promise<AsaasPayment | null> {
  const externalReference = reference(expected)
  if (asaasConfig().environment !== expected.environment) throw new Error('ASAAS_ENVIRONMENT_MISMATCH')
  const query = new URLSearchParams({ externalReference, limit: '2', offset: '0' })
  const result = await request('/payments?' + query, 'GET')
  if (!Array.isArray(result.data) || result.data.length > 2 || result.hasMore === true || Number(result.totalCount) > 1 || result.data.length > 1) {
    throw new Error('ASAAS_RECONCILE_CONFLICT')
  }
  return result.data.length === 0 ? null : normalizeAsaasPayment(result.data[0], expected)
}

export async function readAsaasPix(id: string, expected: AsaasExpectedPayment) {
  if (expected.method !== 'pix') throw new Error('ASAAS_METHOD_MISMATCH')
  await readAsaasPayment(id, expected)
  const qr = await request(`/payments/${id}/pixQrCode`, 'GET')
  if (typeof qr.payload !== 'string' || qr.payload.length < 1 || qr.payload.length > 4096 ||
    typeof qr.encodedImage !== 'string' || qr.encodedImage.length > 300000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(qr.encodedImage) ||
    typeof qr.expirationDate !== 'string' || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(qr.expirationDate)) throw new Error('ASAAS_RESPONSE_INVALID')
  return { payload: qr.payload, encodedImage: qr.encodedImage, expirationDate: qr.expirationDate }
}

/** Stable numeric account identity; no customer or charge is created. */
export async function asaasMerchant(): Promise<string> {
  const account = await request('/myAccount/accountNumber', 'GET')
  if (typeof account.account !== 'string' || !/^[0-9]{1,40}$/.test(account.account)) {
    throw new Error('ASAAS_ACCOUNT_INVALID')
  }
  return account.account
}

export function asaasDatabaseEnvironment() {
  return asaasConfig().environment === 'sandbox' ? 'test' as const : 'production' as const
}

export async function readAsaasPaymentReference(id: string): Promise<string | null> {
  if (!PAYMENT.test(id)) throw new Error('ASAAS_PAYMENT_ID_INVALID')
  const payment = await request('/payments/' + id, 'GET')
  if (payment.id !== id) throw new Error('ASAAS_PAYMENT_MISMATCH')
  const ref = payment.externalReference
  if (typeof ref !== 'string' || ref.length !== 73 ||
    !UUID.test(ref.slice(0, 36)) || ref[36] !== ':' || !UUID.test(ref.slice(37))) return null
  return ref
}
