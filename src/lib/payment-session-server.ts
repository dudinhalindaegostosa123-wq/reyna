import 'server-only'

import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkoutHash } from '@/lib/checkout-server'

const COOKIE_NAME = 'serenity-payment'

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

const HASH = /^[a-f0-9]{64}$/

export interface CheckoutPaymentSession {
  orderId: string
  number: number
  status: string
  totalCents: number
  shippingPending: boolean
  reservedUntil: string | null
  needsReview: boolean
}

export interface PaymentServerAccess {
  tokenHash: string
  context: Record<string, unknown>
  session: CheckoutPaymentSession
}

function validateOrderId(value: string): void {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new Error('PAYMENT_ACCESS_INVALID')
  }
}

function hashToken(token: string): string {
  return createHash('sha256')
    .update(token)
    .digest('hex')
}

function publicSession(
  value: unknown,
  orderId: string
): {
  context: Record<string, unknown>
  session: CheckoutPaymentSession
} {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error('PAYMENT_CONTEXT_INVALID')
  }

  const context = value as Record<string, unknown>
  const number = Number(context.number)
  const total = Number(context.total_cents)
  const status = context.status
  const reserved = context.reserved_until

  if (
    context.order_id !== orderId ||
    context.number == null ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    context.total_cents == null ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    typeof status !== 'string' ||
    ![
      'pending',
      'paid',
      'cancelled',
      'refunded',
    ].includes(status) ||
    typeof context.shipping_pending !== 'boolean' ||
    typeof context.needs_review !== 'boolean' ||
    (
      reserved !== null &&
      (
        typeof reserved !== 'string' ||
        !Number.isFinite(Date.parse(reserved))
      )
    )
  ) {
    throw new Error('PAYMENT_CONTEXT_INVALID')
  }

  return {
    context,
    session: {
      orderId,
      number,
      status,
      totalCents: total,
      shippingPending: context.shipping_pending,
      reservedUntil: reserved as string | null,
      needsReview: context.needs_review,
    },
  }
}

async function loadContext(
  db: SupabaseClient,
  orderId: string,
  tokenHash: string
): Promise<PaymentServerAccess> {
  const result = await db.rpc(
    'serenity_payment_order_context_v1',
    {
      p_order: orderId,
      p_token_hash: tokenHash,
    }
  )

  if (result.error) throw result.error

  return {
    tokenHash,
    ...publicSession(result.data, orderId),
  }
}

// Usar somente no servidor, após confirmar o pedido no banco.
// fingerprint e userId devem vir da validação do checkout.
export async function registerCheckoutPaymentSession(
  db: SupabaseClient,
  orderId: string,
  fingerprint: string,
  userId: string | null
): Promise<CheckoutPaymentSession> {
  validateOrderId(orderId)

  if (
    typeof fingerprint !== 'string' ||
    !HASH.test(fingerprint) ||
    (
      userId !== null &&
      (
        typeof userId !== 'string' ||
        !UUID.test(userId)
      )
    )
  ) {
    throw new Error('PAYMENT_ACCESS_INVALID')
  }

  const token = checkoutHash(
    `serenity-payment-access-v1:${orderId}:${fingerprint}`
  )

  const tokenHash = hashToken(token)

  const registered = await db.rpc(
    'serenity_payment_register_access_v1',
    {
      p_order: orderId,
      p_fingerprint: fingerprint,
      p_token_hash: tokenHash,
      p_user: userId,
    }
  )

  if (registered.error) throw registered.error

  const { session } = await loadContext(
    db,
    orderId,
    tokenHash
  )

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/pagamento/${orderId}`,
    maxAge: 24 * 60 * 60,
  })

  return session
}

// O contexto completo contém dados do pagador.
// Manter context e tokenHash exclusivamente no servidor.
// Para o navegador, retornar somente session ou campos
// explicitamente selecionados para exibição.
export async function readCheckoutPaymentSession(
  db: SupabaseClient,
  orderId: string
): Promise<PaymentServerAccess> {
  validateOrderId(orderId)

  const token = cookies().get(COOKIE_NAME)?.value

  if (!token || !HASH.test(token)) {
    throw new Error('PAYMENT_ACCESS_INVALID')
  }

  return loadContext(
    db,
    orderId,
    hashToken(token)
  )
}

export function checkoutPaymentError(
  error: unknown
): string {
  const message =
    error &&
    typeof error === 'object' &&
    'message' in error
      ? String(error.message)
      : ''

  if (
    /PAYMENT_ACCESS_INVALID|PAYMENT_ACCOUNT_UNAVAILABLE/.test(
      message
    )
  ) {
    return 'Não foi possível acessar o pagamento deste pedido. Volte à confirmação do pedido ou fale com a equipe Lunarity.'
  }

  if (message.includes('PAYMENT_SHIPPING_PENDING')) {
    return 'O frete precisa ser confirmado pela equipe antes do pagamento.'
  }

  if (message.includes('PAYMENT_RESERVATION_EXPIRED')) {
    return 'A reserva das peças expirou. Confira a disponibilidade com a equipe antes de pagar.'
  }

  if (
    /PAYMENT_ALREADY_STARTED|PAYMENT_SUBMIT_UNCERTAIN/.test(
      message
    )
  ) {
    return 'Já existe uma tentativa de pagamento em conferência. Aguarde a atualização antes de tentar novamente.'
  }

  return 'Não foi possível consultar o pagamento agora. Não refaça o pedido; tente atualizar esta página em alguns instantes.'
}
