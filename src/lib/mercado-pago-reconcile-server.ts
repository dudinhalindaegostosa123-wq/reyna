import 'server-only'

import {
  mercadoPagoConfig,
  readMercadoPagoPayment,
  type MercadoPagoExpectedPayment,
  type MercadoPagoObservation,
} from '@/lib/mercado-pago-server'

export async function reconcileMercadoPagoPayment(
  expected: MercadoPagoExpectedPayment,
  paymentId: string | null
): Promise<MercadoPagoObservation | null> {
  mercadoPagoConfig()

  if (paymentId) {
    return readMercadoPagoPayment(
      paymentId,
      expected
    )
  }

  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      expected.orderId
    )
  ) {
    throw new Error('MP_EXPECTATION_INVALID')
  }

  const token =
    process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()

  if (
    !token ||
    !/^(TEST-|APP_USR-)[A-Za-z0-9_-]+$/.test(token)
  ) {
    throw new Error('MP_TEST_CREDENTIALS_REQUIRED')
  }

  const query = new URLSearchParams({
    external_reference: expected.orderId,
    sort: 'date_created',
    criteria: 'desc',
    limit: '50',
  })

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    10000
  )

  let data: unknown

  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/search?${query}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      }
    )

    if (!response.ok) {
      throw new Error('MP_QUERY_FAILED')
    }

    const body = await response.text()

    if (body.length > 1500000) {
      throw new Error('MP_RESPONSE_INVALID')
    }

    data = JSON.parse(body)
  } catch {
    throw new Error('MP_QUERY_FAILED')
  } finally {
    clearTimeout(timer)
  }

  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    throw new Error('MP_RESPONSE_INVALID')
  }

  const search = data as Record<string, unknown>

  if (
    !Array.isArray(search.results) ||
    search.results.length > 50
  ) {
    throw new Error('MP_RESPONSE_INVALID')
  }

  const paging = search.paging

  if (
    paging &&
    typeof paging === 'object' &&
    !Array.isArray(paging) &&
    Number(
      (paging as Record<string, unknown>).total
    ) > 50
  ) {
    throw new Error('MP_RECONCILE_INCOMPLETE')
  }

  const matches = new Set<string>()

  for (const value of search.results) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      continue
    }

    const payment = value as Record<string, unknown>
    const metadata = payment.metadata

    if (
      payment.external_reference !== expected.orderId ||
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      (metadata as Record<string, unknown>)
        .serenity_attempt_id !== expected.attemptId
    ) {
      continue
    }

    if (
      (
        typeof payment.id !== 'string' &&
        typeof payment.id !== 'number'
      ) ||
      (
        typeof payment.id === 'number' &&
        !Number.isSafeInteger(payment.id)
      ) ||
      !/^[0-9]{1,40}$/.test(String(payment.id))
    ) {
      throw new Error('MP_RESPONSE_INVALID')
    }

    matches.add(String(payment.id))
  }

  if (matches.size > 1) {
    throw new Error('MP_RECONCILE_CONFLICT')
  }

  const id = Array.from(matches)[0]

  // Não encontrar na busca não autoriza outra cobrança.
  return id
    ? readMercadoPagoPayment(id, expected)
    : null
}
