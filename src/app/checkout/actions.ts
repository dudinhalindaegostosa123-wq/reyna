'use server'

import { optionalCheckoutAccess } from '@/lib/guest-checkout'

import { normalizeCheckoutDocument } from '@/lib/checkout-document'
import { normalizeCouponCode } from '@/lib/coupon-ui'
import {
  wholesaleError,
} from '@/lib/wholesale-server'
import type { WholesaleRules } from '@/lib/wholesale-server'
import {
  checkoutDatabase,
  checkoutError,
  checkoutHash,
} from '@/lib/checkout-server'
import {
  validateCheckoutLines,
} from '@/lib/checkout'
import type {
  CheckoutLine,
  CheckoutQuote,
  CheckoutCustomer,
  CheckoutAddress,
} from '@/lib/checkout'
import type {
  DeliveryOption,
  DeliveryReceipt,
} from '@/lib/shipping'
import {
  deliveryOptions,
  deliveryError,
} from '@/lib/shipping-server'

export interface CheckoutCouponInfo {
  id: string
  code: string
  version: number
  applied: boolean
  discount_cents: number
  nominal_discount_cents: number
  existing_discount_cents: number
  customer_check_required: boolean
}

export interface WholesaleCheckoutInfo extends WholesaleRules {
  products_cents: number
  minimum_met: boolean
}

export interface CouponCheckoutQuote extends CheckoutQuote {
  pricing_mode?: 'retail' | 'wholesale'
  wholesale?: WholesaleCheckoutInfo
  subtotal_cents?: number
  discount_cents?: number
  coupon?: CheckoutCouponInfo | null
  progressive?: { campaign: string; quantity: number; percent: number; eligible_cents: number; basis_cents: number; discount_cents: number }
}

export interface CouponDeliveryReceipt extends DeliveryReceipt {
  payment?: {
    orderId: string
    accessReady: boolean
    message: string
  }
  pricing_mode?: 'retail' | 'wholesale'
  wholesale?: WholesaleCheckoutInfo & {
    user_id: string
  }
  discount?: number
  coupon?: CheckoutCouponInfo | null
}

const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
    value
  )

function readCouponCode(value: unknown): string {
  if (value === undefined || value === null) return ''

  if (typeof value !== 'string') {
    throw new Error('Confira o código do cupom.')
  }

  return value.trim()
    ? normalizeCouponCode(value)
    : ''
}

function readOptionalDocument(value: unknown): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return null
  }

  if (typeof value !== 'string') {
    throw new Error('Confira o CPF ou CNPJ.')
  }

  return value.trim()
    ? normalizeCheckoutDocument(value)
    : null
}

function couponError(error: unknown): string {
  const code =
    error &&
    typeof error === 'object' &&
    'message' in error
      ? String(error.message)
      : ''

  const messages: Record<string, string> = {
    COUPON_INVALID:
      'Confira o código do cupom.',
    COUPON_UNAVAILABLE:
      'Esse cupom não está disponível.',
    COUPON_NOT_STARTED:
      'O período desse cupom ainda não começou.',
    COUPON_EXPIRED:
      'Esse cupom expirou.',
    COUPON_MINIMUM:
      'O valor dos produtos ainda não atinge a compra mínima desse cupom.',
    COUPON_NO_PRODUCTS:
      'Esse cupom não se aplica aos produtos do carrinho.',
    COUPON_LIMIT:
      'O limite de usos desse cupom foi atingido.',
    COUPON_CUSTOMER_LIMIT:
      'O limite de usos desse cupom para este cliente foi atingido.',
    COUPON_RESERVATION:
      'O prazo da reserva mudou. Confira as peças e o frete novamente.',
  }

  const found = Object.keys(messages).find(key =>
    new RegExp(
      '(?:^|[^A-Z_])' + key + '(?:$|[^A-Z_])'
    ).test(code)
  )

  return found ? messages[found] : ''
}

function operationError(
  error: unknown,
  stage: 'cupom' | 'frete' | 'pedido'
): string {
  const known =
    wholesaleError(error) ||
    couponError(error) ||
    deliveryError(error)

  if (known) return known

  const record =
    error && typeof error === 'object'
      ? error as {
          code?: unknown
          message?: unknown
        }
      : {}

  const rawCode =
    typeof record.code === 'string'
      ? record.code
      : ''

  const reference =
    /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(rawCode)
      ? rawCode
      : 'INDISPONIVEL'

  const message =
    typeof record.message === 'string'
      ? record.message
      : ''

  if (
    /TOP_STEM_REQUIRED|INVALID_STEM|CHECKOUT_LIMIT|PRICE_CHANGED|REQUEST_CHANGED|STOCK_RESERVED|STOCK_UNAVAILABLE|STOCK_CHANGED|PRODUCT_UNAVAILABLE|VARIANT_UNAVAILABLE|PRICE_UNAVAILABLE|INVALID_ANODIZATION/.test(
      message
    )
  ) {
    return checkoutError(error)
  }

  console.error('[checkout]', {
    stage,
    code: reference,
  })

  if (stage === 'cupom') {
    return `Não foi possível validar o cupom agora. Referência: CUPOM-${reference}. Você pode removê-lo para continuar.`
  }

  if (stage === 'frete') {
    return `Não foi possível consultar a entrega agora. Tente novamente. Referência: FRETE-${reference}.`
  }

  return `Não foi possível confirmar o pedido agora. Tente novamente nesta tela. Referência: PEDIDO-${reference}.`
}

export async function reviewCheckout(
  input: CheckoutLine[],
  requestId?: string,
  couponCode?: string,
  document?: string
): Promise<{
  error: string
  quote?: CouponCheckoutQuote
}> {
  let items: CheckoutLine[]
  let code: string
  let normalizedDocument: string | null

  try {
    items = validateCheckoutLines(input)
    code = readCouponCode(couponCode)
    normalizedDocument = code
      ? readOptionalDocument(document)
      : null
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Confira o carrinho e o cupom.',
    }
  }

  try {
    const db = await checkoutDatabase('review')
    const request = uuid(requestId) ? requestId : null
    const access = await optionalCheckoutAccess(db)

    const wholesaleUser = access.rules?.active
      ? access.userId
      : null

    if (wholesaleUser && code) {
      throw new Error('WHOLESALE_COUPON')
    }

    const result = wholesaleUser
      ? await db.rpc('serenity_wholesale_stock_review_v2', {
          p_user: wholesaleUser,
          p_items: items,
          p_request: request,
        })
      : await db.rpc('serenity_checkout_coupon_quote_v2', {
            p_items: items,
            p_code: code,
            p_customer_key: normalizedDocument
              ? checkoutHash(
                  `coupon-customer:${normalizedDocument}`
                )
              : null,
            p_request: request,
          })

    if (result.error) throw result.error

    return {
      error: '',
      quote: result.data as CouponCheckoutQuote,
    }
  } catch (error) {
    return {
      error: operationError(
        error,
        code ? 'cupom' : 'pedido'
      ),
    }
  }
}

export async function quoteCheckoutShipping(input: {
  items: CheckoutLine[]
  requestId: string
  cep: string
  couponCode?: string
  document?: string
}): Promise<{
  error: string
  quote?: CouponCheckoutQuote
  options?: DeliveryOption[]
  message?: string
}> {
  let items: CheckoutLine[]
  let cep: string
  let code: string
  let normalizedDocument: string | null

  try {
    if (
      !input ||
      !uuid(input.requestId) ||
      typeof input.cep !== 'string' ||
      !/^\d{5}-?\d{3}$/.test(input.cep.trim())
    ) {
      throw new Error(
        'Confira o CEP de entrega e atualize a página se necessário.'
      )
    }

    items = validateCheckoutLines(input.items)
    cep = input.cep.trim().replace('-', '')
    code = readCouponCode(input.couponCode)
    normalizedDocument = code
      ? readOptionalDocument(input.document)
      : null
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Confira o carrinho e o CEP.',
    }
  }

  try {
    const db = await checkoutDatabase('review')
    const access = await optionalCheckoutAccess(db)

    const wholesaleUser = access.rules?.active
      ? access.userId
      : null

    if (wholesaleUser && code) {
      throw new Error('WHOLESALE_COUPON')
    }

    const base = wholesaleUser
      ? await db.rpc('serenity_wholesale_stock_review_v2', {
          p_user: wholesaleUser,
          p_items: items,
          p_request: input.requestId,
        })
      : await db.rpc('serenity_checkout_stock_review_v2', {
          p_items: items,
          p_request: input.requestId,
        })

    if (base.error) throw base.error

    const baseQuote = base.data as CouponCheckoutQuote
    let quote: CouponCheckoutQuote = baseQuote

    if (!wholesaleUser) {
      const coupon = await db.rpc(
        'serenity_checkout_coupon_quote_v2',
        {
          p_items: items,
          p_code: code,
          p_customer_key: normalizedDocument
            ? checkoutHash(
                `coupon-customer:${normalizedDocument}`
              )
            : null,
          p_request: input.requestId,
        }
      )

      if (coupon.error) throw coupon.error

      quote = coupon.data as CouponCheckoutQuote

      if (
        quote.subtotal_cents !== baseQuote.total_cents
      ) {
        throw new Error('PRICE_CHANGED')
      }
    }

    const result = await deliveryOptions(
      db,
      items,
      input.requestId,
      cep,
      baseQuote,
      wholesaleUser || undefined,
      quote
    )

    return {
      error: '',
      quote,
      ...result,
    }
  } catch (error) {
    return {
      error: operationError(error, 'frete'),
    }
  }
}

export async function submitCheckout(input: {
  id: string
  items: CheckoutLine[]
  customer: CheckoutCustomer & {
    document: string
  }
  address: CheckoutAddress
  totalCents: number
  website: string
  shippingQuote: string
  couponCode?: string
}): Promise<{
  error: string
  receipt?: CouponDeliveryReceipt
}> {
  void input

  // Compatibilidade com telas antigas: nunca criar pedido por este caminho.
  return {
    error:
      'Este checkout foi atualizado. Abra /checkout no endereço do deployment mais recente e continue por lá. Nenhum pedido foi criado por esta tentativa.',
  }
}
