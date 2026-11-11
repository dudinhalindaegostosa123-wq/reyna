import 'server-only'

import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkoutHash } from '@/lib/checkout-server'
import { wholesaleError } from '@/lib/wholesale-server'

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

const HASH = /^[a-f0-9]{64}$/
const COOKIE = 'serenity-checkout-v2'

export interface CheckoutAttemptV2 {
  provider?: 'mercado_pago' | 'asaas'
  invoiceUrl?: string | null
  id: string
  method: 'pix' | 'card'
  providerPaymentId?: string | null
  cardAuthentication?: { externalResourceURL: string; creq: string } | null
  state: string
  applicationState: string
  blocksNewAttempt: boolean
  pixCode: string | null
  pixQr: string | null
  expiresAt: string | null
}

export interface CheckoutSessionV2 {
  guestCheckout?: boolean
  id: string
  state: string
  environment: 'test' | 'production'
  pricingMode: 'retail' | 'wholesale'
  totalCents: number
  paymentOptions?: {
    pixTotalCents: number; cardTotalCents: number; pixDiscountCents: number
    appliedDiscountCents: number; selectedMethod: 'pix' | 'card' | null
  }
  shippingPending: boolean
  reservedUntil: string
  orderId: string | null
  orderNumber: number | null
  needsReview: boolean
  testApproved: boolean
  attempts: CheckoutAttemptV2[]
}

export interface PendingCheckoutV2 {
  id: string
  paymentUrl: string
  totalCents: number
  shippingPending: boolean
  reservedUntil: string
}

function invalid(): never {
  throw new Error('CHECKOUT_CONTEXT_INVALID')
}

function object(
  value: unknown
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    invalid()
  }

  return value as Record<string, unknown>
}

function integer(value: unknown, minimum: 0 | 1 = 1): number {
  if (
    (
      typeof value !== 'number' &&
      typeof value !== 'string'
    ) ||
    !/^[0-9]{1,16}$/.test(String(value))
  ) {
    invalid()
  }

  const result = Number(value)

  if (
    !Number.isSafeInteger(result) ||
    result < minimum
  ) {
    invalid()
  }

  return result
}

function date(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value))
  ) {
    invalid()
  }

  return new Date(value).toISOString()
}

function nullableText(
  value: unknown,
  max: number
): string | null {
  if (value == null || value === '') return null

  if (
    typeof value !== 'string' ||
    value.length > max
  ) {
    invalid()
  }

  return value
}

export function normalizeCheckoutSessionV2(
  value: unknown,
  id: string
): CheckoutSessionV2 {
  const context = object(value)

  if (
    !UUID.test(id) ||
    context.checkout_id !== id ||
    ![
      'pending',
      'payment_pending',
      'converted',
      'expired',
      'cancelled',
      'review',
    ].includes(String(context.state)) ||
    !['test', 'production'].includes(
      String(context.environment)
    ) ||
    !['retail', 'wholesale'].includes(
      String(context.pricing_mode)
    ) ||
    typeof context.shipping_pending !== 'boolean' ||
    typeof context.needs_review !== 'boolean' ||
    typeof context.test_approved !== 'boolean' ||
    !Array.isArray(context.attempts) ||
    context.attempts.length > 10
  ) {
    invalid()
  }

  const orderId = context.order_id

  if (
    orderId !== null &&
    (
      typeof orderId !== 'string' ||
      !UUID.test(orderId) ||
      orderId !== id
    )
  ) {
    invalid()
  }

  if (
    (context.state === 'converted') !==
    (orderId !== null)
  ) {
    invalid()
  }

  if (
    context.environment === 'test' &&
    (
      orderId !== null ||
      context.state === 'converted'
    )
  ) {
    invalid()
  }

  if (
    context.test_approved &&
    context.environment !== 'test'
  ) {
    invalid()
  }

  const orderNumber =
    context.order_number === null
      ? null
      : integer(context.order_number)

  if (
    (orderId === null) !==
    (orderNumber === null)
  ) {
    invalid()
  }

  const attempts = context.attempts.map(
    (value): CheckoutAttemptV2 => {
      const attempt = object(value)

      if (
        typeof attempt.id !== 'string' ||
        !UUID.test(attempt.id) ||
        !['pix', 'card'].includes(
          String(attempt.method)
        ) ||
        ![
          'created',
          'submitting',
          'pending',
          'approved',
          'rejected',
          'cancelled',
          'refunded',
          'uncertain',
          'charged_back',
        ].includes(String(attempt.state)) ||
        ![
          'pending',
          'applied',
          'review',
          'test_approved',
        ].includes(
          String(attempt.application_state)
        ) ||
        typeof attempt.blocks_new_attempt !== 'boolean'
      ) {
        invalid()
      }

      const qr = nullableText(
        attempt.pix_qr_base64,
        300000
      )

      if (
        qr &&
        !/^[A-Za-z0-9+/]+={0,2}$/.test(qr)
      ) {
        invalid()
      }

      const canDisplay =
        attempt.state === 'pending' &&
        attempt.application_state !== 'review'

      const provider = attempt.provider == null ? 'mercado_pago' : attempt.provider
      if (!['mercado_pago', 'asaas'].includes(String(provider))) invalid()
      const providerPaymentId = nullableText(attempt.provider_payment_id, 104)
      if (providerPaymentId && !(provider === 'asaas' ? /^pay_[A-Za-z0-9_-]{1,100}$/ : /^[0-9]{1,40}$/).test(providerPaymentId)) invalid()
      let invoiceUrl: string | null = null
      if (provider === 'asaas' && canDisplay && attempt.invoice_url != null) {
        const value = nullableText(attempt.invoice_url, 2048)
        let url: URL
        try { url = new URL(value || '') } catch { invalid() }
        if (url.protocol !== 'https:' || url.hostname !== (context.environment === 'test' ? 'sandbox.asaas.com' : 'www.asaas.com') ||
          url.port || url.username || url.password || !url.pathname.startsWith('/i/')) invalid()
        invoiceUrl = url.toString()
      }
      let cardAuthentication: { externalResourceURL: string; creq: string } | null = null
      if (canDisplay && attempt.method === 'card' && attempt.card_authentication != null) {
        const auth = object(attempt.card_authentication)
        const resource = nullableText(auth.external_resource_url, 2048)
        const creq = nullableText(auth.creq, 16384)
        if (!resource || !creq || !/^[A-Za-z0-9_+/=-]+$/.test(creq)) invalid()
        let url: URL
        try { url = new URL(resource) } catch { invalid() }
        if (url.protocol !== 'https:' || url.username || url.password) invalid()
        cardAuthentication = { externalResourceURL: url.toString(), creq }
      }

      return {
        id: attempt.id,
        provider: provider as 'mercado_pago' | 'asaas',
        invoiceUrl,
        providerPaymentId,
        cardAuthentication,
        method: attempt.method as 'pix' | 'card',
        state: String(attempt.state),
        applicationState: String(
          attempt.application_state
        ),
        blocksNewAttempt:
          attempt.blocks_new_attempt,
        pixCode: canDisplay
          ? nullableText(attempt.pix_code, 4096)
          : null,
        pixQr: canDisplay ? qr : null,
        expiresAt:
          attempt.expires_at == null
            ? null
            : date(attempt.expires_at),
      }
    }
  )

  let paymentOptions: CheckoutSessionV2['paymentOptions']
  if (context.payment_options != null) {
    const options = object(context.payment_options)
    const pixTotalCents = integer(options.pix_total_cents)
    const cardTotalCents = integer(options.card_total_cents)
    const pixDiscountCents = integer(options.pix_discount_cents, 0)
    const appliedDiscountCents = integer(options.applied_discount_cents, 0)
    if (cardTotalCents - pixTotalCents !== pixDiscountCents || appliedDiscountCents > cardTotalCents ||
      ![null, 'pix', 'card'].includes(options.selected_method as null | string)) invalid()
    paymentOptions = { pixTotalCents, cardTotalCents, pixDiscountCents, appliedDiscountCents,
      selectedMethod: options.selected_method as 'pix' | 'card' | null }
  }

  return {
    id,
    ...(context.guest_checkout === true ? {guestCheckout:true} : {}),
    state: String(context.state),
    environment:
      context.environment as 'test' | 'production',
    pricingMode:
      context.pricing_mode as 'retail' | 'wholesale',
    totalCents: integer(context.total_cents),
    ...(paymentOptions ? { paymentOptions } : {}),
    shippingPending: context.shipping_pending,
    reservedUntil: date(context.reserved_until),
    orderId: orderId as string | null,
    orderNumber,
    needsReview: context.needs_review,
    testApproved: context.test_approved,
    attempts,
  }
}

// A chave de acesso fica somente no servidor e no cookie HttpOnly.
export function checkoutAccessV2(
  id: string,
  fingerprint: string
) {
  if (
    !UUID.test(id) ||
    !HASH.test(fingerprint)
  ) {
    throw new Error('CHECKOUT_ACCESS_INVALID')
  }

  const token = checkoutHash(
    `serenity-checkout-access-v2:${id}:${fingerprint}`
  )

  return {
    token,
    hash: createHash('sha256')
      .update(token)
      .digest('hex'),
  }
}

export function writeCheckoutCookieV2(
  id: string,
  token: string
) {
  if (
    !UUID.test(id) ||
    !HASH.test(token)
  ) {
    throw new Error('CHECKOUT_ACCESS_INVALID')
  }

  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/pagamento/${id}`,
    maxAge: 24 * 60 * 60,
  })
}

export async function readCheckoutSessionV2(
  db: SupabaseClient,
  id: string
) {
  if (!UUID.test(id)) {
    throw new Error('CHECKOUT_ACCESS_INVALID')
  }

  const token = cookies().get(COOKIE)?.value

  if (!token || !HASH.test(token)) {
    throw new Error('CHECKOUT_ACCESS_INVALID')
  }

  const accessHash = createHash('sha256')
    .update(token)
    .digest('hex')

  const result = await db.rpc(
    'serenity_checkout_context_v2',
    {
      p_checkout: id,
      p_access_hash: accessHash,
    }
  )

  if (result.error) throw result.error

  return {
    accessHash,
    session: normalizeCheckoutSessionV2(
      result.data,
      id
    ),
  }
}

export function checkoutSessionErrorV2(
  error: unknown,
  diagnostic?: {stage:string;checkoutId:string}
): string {
  const wholesale = wholesaleError(error)

  if (wholesale) return wholesale

  const record =
    error && typeof error === 'object'
      ? error as {
          message?: unknown
          code?: unknown
        }
      : {}

  const message =
    typeof record.message === 'string'
      ? record.message
      : ''

  const known: Record<string, string> = {
    PAYMENT_PROVIDER_CHANGED: 'A integração de pagamento mudou. Atualize a página antes de continuar.',
    ASAAS_CARD_INPUT_INVALID: 'Confira os dados do cartão, documento do titular, telefone e endereço de cobrança.',
    ASAAS_PAYMENTS_DISABLED: 'O pagamento online ainda não foi liberado pela equipe.',
    ASAAS_ENVIRONMENT_REQUIRED: 'O ambiente do pagamento precisa ser configurado pela equipe.',
    ASAAS_CREDENTIALS_REQUIRED: 'As credenciais do pagamento precisam ser configuradas pela equipe.',
    ASAAS_CREDENTIAL_ENVIRONMENT_MISMATCH: 'A chave de pagamento não corresponde ao ambiente configurado.',
    ASAAS_ENVIRONMENT_MISMATCH: 'Esta tentativa pertence a outro ambiente de pagamento. Fale com a equipe.',
    ASAAS_PRODUCTION_CONFIGURATION: 'A confirmação automática dos pagamentos precisa ser configurada pela equipe.',
    ASAAS_HTTP_401: 'O Asaas recusou a credencial. A equipe precisa conferir a integração.',
    ASAAS_HTTP_403: 'O Asaas não autorizou a operação. A equipe precisa conferir a integração.',
    GUEST_TRACKING_CONFIGURATION:
      'O acompanhamento de compras está em configuração. Fale com a Lunarity.',
    GUEST_CHECKOUT_MIGRATION_REQUIRED:
      'A compra sem cadastro está em configuração. Fale com a Lunarity.',
    CHECKOUT_LOGIN_REQUIRED:
      'Entre na sua conta antes de iniciar o pagamento. Seu carrinho continua salvo.',
    CHECKOUT_ACCOUNT_MISMATCH:
      'Esta tentativa não está vinculada à conta conectada. Fale com a equipe Lunarity para conferir antes de continuar.',
    MP_CARD_INPUT_INVALID:
      'Confira os dados do cartão e do titular.',
    MP_CARD_METHOD_INVALID:
      'Esta bandeira de cartão de crédito não está disponível. Use outro cartão ou Pix.',
    MP_CARD_CONFIGURATION:
      'O pagamento com cartão está sendo configurado. Use Pix ou fale com a equipe.',

    MP_ENVIRONMENT_REQUIRED:
      'O pagamento ainda está em configuração. Fale com a equipe Lunarity.',
    MP_CREDENTIALS_REQUIRED:
      'As credenciais do pagamento precisam ser conferidas pela equipe.',
    MP_PRODUCTION_DISABLED:
      'O pagamento online ainda não foi liberado pela equipe.',
    MP_PRODUCTION_CREDENTIALS_REQUIRED:
      'A integração precisa das credenciais de produção do Mercado Pago.',
    MP_PRODUCTION_ACCOUNT_REQUIRED:
      'A integração de produção está apontando para uma conta de teste.',
    MP_WEBHOOK_CONFIGURATION:
      'A confirmação automática do pagamento precisa ser configurada pela equipe.',
    MP_SITE_CONFIGURATION:
      'O endereço da loja precisa ser configurado na integração de pagamento.',
    MP_PAYMENT_ENVIRONMENT_MISMATCH:
      'Esta tentativa pertence a outro ambiente. Fale com a equipe antes de iniciar outra compra.',
    PAYMENT_DATABASE_MIGRATION_REQUIRED:
      'A atualização do banco para pagamentos precisa ser concluída pela equipe.',

    CHECKOUT_LIMIT:
      'Muitas tentativas em pouco tempo. Aguarde um pouco.',

    CHECKOUT_ACCESS_INVALID:
      'Não foi possível acessar este pagamento. Use o navegador em que iniciou o checkout.',

    CHECKOUT_RESERVATION_EXPIRED:
      'A reserva expirou. Confira as peças e o frete novamente.',

    SHIPPING_QUOTE_EXPIRED:
      'A cotação do frete expirou ou mudou. Atualize as opções de entrega.',

    UNIT_SALE_REQUIRED:
      'Essa joia é vendida por unidade. Atualize a peça no carrinho; para duas peças, escolha quantidade 2.',
    TOP_STEM_REQUIRED:
      'Escolha a haste incluída dos labrets no carrinho antes de continuar.',
    INVALID_STEM:
      'Confira a haste e a variação escolhidas no carrinho.',
    INVALID_STERILIZATION:
      'Atualize o carrinho e confira a opção de esterilização antes de continuar.',

    PRICE_CHANGED:
      'Os valores mudaram. Confira o resumo e o frete novamente antes de continuar.',

    REQUEST_CHANGED:
      'Este checkout já foi iniciado com outros dados. Não repita o pagamento; confira a tentativa anterior.',

    COUPON_INVALID:
      'Confira o código do cupom.',

    COUPON_UNAVAILABLE:
      'Esse cupom não está disponível.',

    COUPON_NOT_STARTED:
      'O período desse cupom ainda não começou.',

    COUPON_EXPIRED:
      'Esse cupom expirou.',

    COUPON_MINIMUM:
      'O valor das peças ainda não atinge o mínimo desse cupom.',

    COUPON_NO_PRODUCTS:
      'Esse cupom não se aplica às peças do carrinho.',

    COUPON_LIMIT:
      'O limite de usos desse cupom foi atingido.',

    COUPON_CUSTOMER_LIMIT:
      'O limite de usos desse cupom por cliente foi atingido.',

    COUPON_RESERVATION:
      'A reserva do cupom precisa ser conferida. Atualize o resumo.',

    CUSTOMER_ACCOUNT_UNAVAILABLE:
      'Entre novamente em Minha conta antes de continuar.',

    MP_TEST_ENVIRONMENT_REQUIRED:
      'O pagamento ainda está em configuração. A equipe precisa definir MERCADO_PAGO_ENVIRONMENT=test no ambiente deste deployment.',

    MP_TEST_CREDENTIALS_REQUIRED:
      'A configuração das credenciais de teste precisa ser conferida na Vercel.',

    MP_TEST_ACCOUNT_REQUIRED:
      'O Mercado Pago não identificou esta conta como conta de teste. A credencial precisa ser conferida.',

    MP_HTTP_401:
      'O Mercado Pago recusou a autenticação. A equipe precisa conferir a autorização da credencial neste ambiente.',

    MP_HTTP_403:
      'O Mercado Pago não autorizou esta operação. A equipe precisa conferir as permissões da integração.',

    PAYMENT_METHOD_CHANGED:
      'A forma de pagamento mudou. Atualize a página e confira o valor antes de continuar.',
    PAYMENT_ALREADY_STARTED:
      'Já existe uma tentativa de pagamento. Aguarde a confirmação; não refaça a compra.',

    PAYMENT_RESERVATION_EXPIRED:
      'A reserva precisa ser conferida antes de iniciar o pagamento.',

    PAYMENT_CHECKOUT_UNAVAILABLE:
      'Este checkout não está disponível para um novo pagamento. Confira o frete e a situação da tentativa.',

    PAYMENT_REQUEST_CHANGED:
      'A tentativa já foi iniciada com outros dados. Não gere outro pagamento.',
  }

  const found = Object.keys(known).find(code =>
    new RegExp(
      '(?:^|[^A-Z_])' + code + '(?:$|[^A-Z_])'
    ).test(message)
  )

  const sqlCode = typeof record.code === 'string' && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(record.code) ? record.code : ''
  const internalCode = /^(?:CHECKOUT_(?:UNAVAILABLE|CONFIGURATION|CONTEXT_INVALID|DATABASE_CONNECTION)|MP_(?:QUERY_FAILED|RESPONSE_INVALID|ACCOUNT_COUNTRY_INVALID|HTTP_[45][0-9]{2}))$/.test(message) ? message : ''
  const code = found || sqlCode || internalCode || 'INDISPONIVEL'
  const stage = diagnostic && ['configuration','database','readiness','account','merchant','session','context','cookie'].includes(diagnostic.stage) ? diagnostic.stage : ''
  console.error('[checkout-v2]', { code, ...(stage ? {stage}:{}), ...(diagnostic && UUID.test(diagnostic.checkoutId) ? {checkout_id:diagnostic.checkoutId}:{}) })

  if (found) return known[found]

  if (
    /STOCK_RESERVED|STOCK_UNAVAILABLE|STOCK_CHANGED|PRODUCT_UNAVAILABLE|VARIANT_UNAVAILABLE|PRICE_UNAVAILABLE|INVALID_ANODIZATION/.test(
      message
    )
  ) {
    return 'Uma peça, variação ou cor mudou de disponibilidade. Confira o carrinho antes de continuar.'
  }

  return `Não foi possível continuar agora. Tente novamente nesta tela, sem refazer a compra. Referência: CHECKOUT-${code}${stage ? `-${stage.toUpperCase()}` : ''}.`
}
