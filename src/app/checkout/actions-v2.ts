'use server'

import {captureCheckoutAnalytics} from '@/lib/analytics-server'
import { assertProductionPaymentReady } from '@/lib/payment-processing-server'

import {
  checkoutDatabase,
  checkoutHash,
} from '@/lib/checkout-server'
import {
  validateCheckoutContact,
  validateCheckoutLines,
} from '@/lib/checkout'
import type {
  CheckoutAddress,
  CheckoutCustomer,
  CheckoutLine,
} from '@/lib/checkout'
import { normalizeCheckoutDocument } from '@/lib/checkout-document'
import { normalizeCouponCode } from '@/lib/coupon-ui'
import { guestCheckoutEnabled, optionalCheckoutAccess } from '@/lib/guest-checkout'
import { assertGuestCheckoutReady, registerGuestCheckout } from '@/lib/guest-tracking-server'
import {
  mercadoPagoPublicConfig,
  mercadoPagoMerchant,
} from '@/lib/mercado-pago-server'
import {
  checkoutAccessV2,
  normalizeCheckoutSessionV2,
  writeCheckoutCookieV2,
  checkoutSessionErrorV2,
} from '@/lib/checkout-session-server-v2'
import type {
  PendingCheckoutV2,
} from '@/lib/checkout-session-server-v2'

interface Input {
  analytics?: unknown
  id: string
  items: CheckoutLine[]
  customer: CheckoutCustomer & {
    document: string
  }
  address: CheckoutAddress
  totalCents: number
  shippingQuote: string
  couponCode?: string
  website: string
}

export async function startCheckoutV2(
  input: Input
): Promise<{
  error: string
  loginRequired?: boolean
  checkout?: PendingCheckoutV2
}> {
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

  let items: CheckoutLine[]

  let contact: ReturnType<
    typeof validateCheckoutContact
  > & {
    customer: CheckoutCustomer & {
      document: string
    }
  }

  let code: string

  try {
    if (
      !input ||
      typeof input.id !== 'string' ||
      !uuid.test(input.id) ||
      typeof input.shippingQuote !== 'string' ||
      !uuid.test(input.shippingQuote) ||
      !Number.isSafeInteger(input.totalCents) ||
      input.totalCents < 1 ||
      input.website !== '' ||
      (
        input.couponCode !== undefined &&
        typeof input.couponCode !== 'string'
      )
    ) {
      return {
        error:
          'Confira os dados e escolha uma opção de entrega.',
      }
    }

    items = validateCheckoutLines(input.items)

    const checked = validateCheckoutContact(
      input.customer,
      input.address
    )

    contact = {
      ...checked,
      customer: {
        ...checked.customer,
        document: normalizeCheckoutDocument(
          input.customer.document
        ),
      },
    }

    code = input.couponCode?.trim()
      ? normalizeCouponCode(input.couponCode)
      : ''
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Confira os dados do checkout.',
    }
  }

  let stage = 'configuration'
  try {
    // O modo de teste depende da configuração, não da branch do deployment.
    const { environment } =
      mercadoPagoPublicConfig()

    stage = 'database'
    const db = await checkoutDatabase('submit')
    stage = 'readiness'
    await assertProductionPaymentReady(db)
    stage = 'account'
    const access = await optionalCheckoutAccess(db)
    if (!access.userId && !guestCheckoutEnabled()) {
      return { error: 'Entre na sua conta antes de continuar para o pagamento.', loginRequired: true }
    }

    if (guestCheckoutEnabled()) await assertGuestCheckoutReady(db,input.id)

    if (access.rules?.active && code) {
      throw new Error('WHOLESALE_COUPON')
    }

    // Depois do limite de tentativas, confere a credencial sem criar
    // cobrança nem reservar peças.
    stage = 'merchant'
    await mercadoPagoMerchant()

    const fingerprint = checkoutHash(
      JSON.stringify({
        version: 2,
        environment,
        items,
        ...contact,
        totalCents: input.totalCents,
        shippingQuote: input.shippingQuote,
        coupon: code,
        userId: access.userId,
      })
    )

    const capability = checkoutAccessV2(
      input.id,
      fingerprint
    )

    stage = 'session'
    const result = await db.rpc(
      'serenity_checkout_start_v2',
      {
        p_id: input.id,
        p_fingerprint: fingerprint,
        p_access_hash: capability.hash,
        p_environment: environment,
        p_user: access.userId,
        p_items: items,
        p_customer: contact.customer,
        p_address: contact.address,
        p_expected: input.totalCents,
        p_cart_hash: checkoutHash(
          JSON.stringify(items)
        ),
        p_shipping: input.shippingQuote,
        p_coupon: code,
        p_customer_key: checkoutHash(
          `coupon-customer:${contact.customer.document}`
        ),
      }
    )

    if (result.error) throw result.error

    stage = 'context'
    const session = normalizeCheckoutSessionV2(
      result.data,
      input.id
    )

    if (guestCheckoutEnabled()) await registerGuestCheckout(db,session.id,capability.hash)

    if(input.analytics)await captureCheckoutAnalytics(db,session.id,capability.hash,input.analytics)

    stage = 'cookie'
    writeCheckoutCookieV2(
      session.id,
      capability.token
    )

    return {
      error: '',
      checkout: {
        id: session.id,
        paymentUrl: `/pagamento/${session.id}`,
        totalCents: session.totalCents,
        shippingPending: session.shippingPending,
        reservedUntil: session.reservedUntil,
      },
    }
  } catch (error) {
    const code = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
    const requiresLogin = ['WHOLESALE_SESSION', 'WHOLESALE_EMAIL'].includes(code)
    return {
      error: checkoutSessionErrorV2(error, {stage, checkoutId:input.id}),
      ...(requiresLogin ? { loginRequired: true } : {}),
    }
  }
}
