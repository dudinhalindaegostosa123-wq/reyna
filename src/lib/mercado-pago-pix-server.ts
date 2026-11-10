import 'server-only'

import {
  mercadoPagoPublicConfig,
  mercadoPagoConfig,
  mercadoPagoMerchant,
  normalizeMercadoPagoPayment,
  type MercadoPagoExpectedPayment,
  type MercadoPagoObservation,
} from '@/lib/mercado-pago-server'

interface PixPayer {
  email: string
  documentType: 'CPF' | 'CNPJ'
  documentNumber: string
}

export async function createMercadoPagoPix(
  expected: MercadoPagoExpectedPayment,
  payer: PixPayer,
  expiresAt: string
): Promise<MercadoPagoObservation> {
  const configuration = mercadoPagoPublicConfig()
  if (expected.environment && expected.environment !== configuration.environment) {
    throw new Error('MP_PAYMENT_ENVIRONMENT_MISMATCH')
  }

  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

  const expiration = Date.parse(expiresAt)
  const documentLength =
    payer.documentType === 'CPF' ? 11 : 14

  if (
    expected.method !== 'pix' ||
    !uuid.test(expected.orderId) ||
    !uuid.test(expected.attemptId) ||
    !/^[0-9]{1,40}$/.test(expected.merchantId) ||
    !Number.isSafeInteger(expected.amountCents) ||
    expected.amountCents < 1 ||
    !['CPF', 'CNPJ'].includes(payer.documentType) ||
    !new RegExp(
      `^[0-9]{${documentLength}}$`
    ).test(payer.documentNumber) ||
    payer.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payer.email) ||
    !Number.isFinite(expiration) ||
    expiration <= Date.now() + 60000 ||
    expiration > Date.now() + 33 * 60000
  ) {
    throw new Error('MP_PIX_INPUT_INVALID')
  }

  const accessToken =
    process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()

  if (
    !accessToken ||
    !/^(TEST-|APP_USR-)[A-Za-z0-9_-]+$/.test(accessToken)
  ) {
    throw new Error('MP_TEST_CREDENTIALS_REQUIRED')
  }

  const merchant = await mercadoPagoMerchant()

  if (merchant !== expected.merchantId) {
    throw new Error('MP_PAYMENT_MISMATCH')
  }

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    10000
  )

  try {
    const response = await fetch(
      'https://api.mercadopago.com/v1/payments',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Idempotency-Key': expected.attemptId,
        },
        body: JSON.stringify({
          transaction_amount:
            expected.amountCents / 100,
          description: 'Pedido Lunarity',
          ...(configuration.environment === 'production'
            ? { notification_url: mercadoPagoConfig().notificationUrl } : {}),
          payment_method_id: 'pix',
          external_reference: expected.orderId,
          metadata: {
            serenity_attempt_id: expected.attemptId,
          },
          date_of_expiration:
            new Date(expiration).toISOString(),
          payer: {
            email: payer.email,
            identification: {
              type: payer.documentType,
              number: payer.documentNumber,
            },
          },
        }),
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      }
    )

    const body = await response.text()

    if (body.length > 1500000) {
      throw new Error('MP_RESPONSE_TOO_LARGE')
    }

    if (!response.ok) {
      let errorCode = ''
      let causes: string[] = []

      try {
        const failure = JSON.parse(body)

        const safe = (value: unknown) => {
          const text =
            typeof value === 'string' ||
            typeof value === 'number'
              ? String(value)
              : ''

          return /^(?:[0-9]{1,10}|[a-z][a-z0-9_]{0,59})$/.test(
            text
          )
            ? text
            : ''
        }

        if (
          failure &&
          typeof failure === 'object' &&
          !Array.isArray(failure)
        ) {
          errorCode = safe(failure.error)

          causes = Array.isArray(failure.cause)
            ? failure.cause
                .slice(0, 5)
                .map((cause: unknown) =>
                  cause &&
                  typeof cause === 'object' &&
                  !Array.isArray(cause)
                    ? safe(
                        (cause as Record<string, unknown>)
                          .code
                      )
                    : ''
                )
                .filter(Boolean)
            : []
        }
      } catch {}

      const requestId = response.headers.get('x-request-id') || ''
      console.error('[mercado-pago-pix]', {
        http: response.status,
        code: errorCode,
        causes,
        requestId: /^[A-Za-z0-9_-]{1,128}$/.test(requestId) ? requestId : undefined,
      })

      throw new Error(`MP_HTTP_${response.status}`)
    }

    return normalizeMercadoPagoPayment(
      JSON.parse(body),
      expected
    )
  } catch (error) {
    const code =
      error instanceof Error &&
      /^MP_[A-Z0-9_]{1,70}$/.test(error.message)
        ? error.message
        : 'MP_SUBMISSION_UNCERTAIN'

    throw new Error(code)
  } finally {
    clearTimeout(timer)
  }
}

export async function createMercadoPagoTestPix(
  expected: MercadoPagoExpectedPayment,
  payer: PixPayer,
  expiresAt: string
): Promise<MercadoPagoObservation> {
  if (mercadoPagoPublicConfig().environment !== 'test') throw new Error('MP_TEST_ENVIRONMENT_REQUIRED')
  return createMercadoPagoPix({ ...expected, environment: 'test' }, payer, expiresAt)
}
