'use server'

import { assertPaymentOwner } from '@/lib/guest-checkout'

import { assertProductionPaymentReady, observeCheckoutPayment } from '@/lib/payment-processing-server'

import {
  checkoutDatabase,
  checkoutHash,
} from '@/lib/checkout-server'
import { normalizeCheckoutDocument } from '@/lib/checkout-document'
import {
  mercadoPagoMerchant,
  mercadoPagoPublicConfig,
  mercadoPagoConfig,
} from '@/lib/mercado-pago-server'
import { createMercadoPagoPix } from '@/lib/mercado-pago-pix-server'
import { reconcileMercadoPagoPayment } from '@/lib/mercado-pago-reconcile-server'
import {
  readCheckoutSessionV2,
  checkoutSessionErrorV2,
} from '@/lib/checkout-session-server-v2'
import type {
  CheckoutSessionV2,
} from '@/lib/checkout-session-server-v2'

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

interface Result {
  error: string
  session?: CheckoutSessionV2
}

function paymentCode(error: unknown): string {
  const message =
    error instanceof Error ? error.message : ''

  return /^MP_[A-Z0-9_]{1,70}$/.test(message)
    ? message
    : 'MP_SUBMISSION_UNCERTAIN'
}

export async function startPixV2(
  id: string,
  attemptId: string,
  expectedCents?: number
): Promise<Result> {
  try {
    if (process.env.ASAAS_ENVIRONMENT) throw new Error('PAYMENT_PROVIDER_CHANGED')
    if (
      typeof id !== 'string' ||
      typeof attemptId !== 'string' ||
      !UUID.test(id) ||
      !UUID.test(attemptId)
    ) {
      throw new Error('CHECKOUT_ACCESS_INVALID')
    }

    const configuration = mercadoPagoPublicConfig()

    const db = await checkoutDatabase('submit')
    await assertProductionPaymentReady(db)

    const { session, accessHash } =
      await readCheckoutSessionV2(db, id)

    if (session.environment !== configuration.environment) {
      throw new Error('MP_PAYMENT_ENVIRONMENT_MISMATCH')
    }

    if (
      session.orderId ||
      session.testApproved ||
      session.needsReview ||
      session.attempts.some(
        a =>
          a.blocksNewAttempt ||
          a.applicationState === 'review' ||
          [
            'approved',
            'refunded',
            'charged_back',
          ].includes(a.state)
      )
    ) {
      return { error: '', session }
    }

    if (session.paymentOptions && (!Number.isSafeInteger(expectedCents) || expectedCents !== session.totalCents)) {
      return { error: 'O valor mudou. Confira o total atualizado e confirme novamente.', session }
    }

    if (
      session.state !== 'pending' ||
      session.shippingPending
    ) {
      throw new Error('PAYMENT_CHECKOUT_UNAVAILABLE')
    }

    if (
      Date.parse(session.reservedUntil) <=
      Date.now() + 60000
    ) {
      throw new Error('PAYMENT_RESERVATION_EXPIRED')
    }

    const saved = await db
      .from('serenity_checkout_sessions_v2')
      .select('customer_snapshot,account_user_id')
      .eq('id', id)
      .single()

    if (saved.error) throw saved.error
    await assertPaymentOwner(saved.data?.account_user_id,db)

    const customer = saved.data?.customer_snapshot

    if (
      !customer ||
      typeof customer !== 'object' ||
      Array.isArray(customer)
    ) {
      throw new Error('MP_PIX_INPUT_INVALID')
    }

    const document = normalizeCheckoutDocument(
      customer.document
    )

    const email =
      typeof customer.email === 'string'
        ? customer.email.trim()
        : ''

    if (
      !/^([0-9]{11}|[0-9]{14})$/.test(document) ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return {
        error:
          'Confira o e-mail e o CPF ou CNPJ numérico do pagador.',
        session,
      }
    }

    const merchant = await mercadoPagoMerchant()

    const hash = checkoutHash(
      JSON.stringify({
        version: 2,
        id,
        attemptId,
        merchant,
        environment: configuration.environment,
        method: 'pix',
        amountCents: session.totalCents,
        email,
        document,
      })
    )

    const claimed = await db.rpc(
      'serenity_checkout_claim_pix_v2',
      {
        p_checkout: id,
        p_access_hash: accessHash,
        p_attempt: attemptId,
        p_merchant: merchant,
        p_request_hash: hash,
      }
    )

    if (claimed.error) throw claimed.error

    if (claimed.data?.submit !== true) {
      return {
        error: '',
        session: (
          await readCheckoutSessionV2(db, id)
        ).session,
      }
    }

    const claim = claimed.data

    try {
      if (
        typeof claim.lease_id !== 'string' ||
        !UUID.test(claim.lease_id) ||
        claim.checkout_id !== id ||
        claim.attempt_id !== attemptId ||
        claim.environment !== configuration.environment ||
        claim.merchant_id !== merchant ||
        claim.method !== 'pix' ||
        claim.currency !== 'BRL' ||
        Number(claim.amount_cents) !==
          session.totalCents ||
        claim.customer?.email !== email ||
        claim.customer?.document !== document ||
        typeof claim.expires_at !== 'string'
      ) {
        throw new Error('MP_CLAIM_INVALID')
      }

      const observation =
        await createMercadoPagoPix(
          {
            orderId: id,
            attemptId,
            merchantId: merchant,
            amountCents: session.totalCents,
            method: 'pix',
            environment: configuration.environment,
          },
          {
            email,
            documentNumber: document,
            documentType:
              document.length === 11 ? 'CPF' : 'CNPJ',
          },
          claim.expires_at
        )

      const observed = await db.rpc(
        'serenity_checkout_observe_payment_v2',
        {
          p_attempt: attemptId,
          p_observation: observation,
          p_source: 'create',
        }
      )

      if (observed.error) throw observed.error
    } catch (error) {
      const code = paymentCode(error)

      console.error('[pix-v2]', {
        stage: 'create',
        code,
      })

      if (
        typeof claim.lease_id === 'string' &&
        UUID.test(claim.lease_id)
      ) {
        await db.rpc(
          'serenity_checkout_pix_uncertain_v2',
          {
            p_attempt: attemptId,
            p_lease: claim.lease_id,
            p_request_hash: hash,
            p_code: code,
          }
        )
      }

      return {
        error:
          code === 'MP_HTTP_401' || code === 'MP_HTTP_403'
            ? `O Mercado Pago recusou a autorização para gerar o Pix. A equipe precisa conferir a integração. Não refaça a compra. Referência: ${code}.`
            : `A tentativa precisa de conferência. Não refaça o pagamento. Referência: ${code}.`,
        session: (
          await readCheckoutSessionV2(db, id)
        ).session,
      }
    }

    return {
      error: '',
      session: (
        await readCheckoutSessionV2(db, id)
      ).session,
    }
  } catch (error) {
    return {
      error: checkoutSessionErrorV2(error),
    }
  }
}

export async function refreshCheckoutPaymentV2(
  id: string
): Promise<Result> {
  let session: CheckoutSessionV2 | undefined

  try {
    if (
      typeof id !== 'string' ||
      !UUID.test(id)
    ) {
      throw new Error('CHECKOUT_ACCESS_INVALID')
    }

    const configuration = mercadoPagoConfig()

    const db = await checkoutDatabase('review')

    session = (
      await readCheckoutSessionV2(db, id)
    ).session

    if (session.environment !== configuration.environment) {
      throw new Error('MP_PAYMENT_ENVIRONMENT_MISMATCH')
    }

    const attempt =
      session.attempts.find(
        a => a.applicationState === 'review'
      ) ||
      session.attempts.find(
        a => a.blocksNewAttempt
      ) ||
      session.attempts[0]

    if (!attempt || session.testApproved) {
      return { error: '', session }
    }

    const result = await db
      .from('serenity_checkout_payments_v2')
      .select(
        'id,checkout_id,environment,merchant_id,method,amount_cents,provider_payment_id'
      )
      .eq('id', attempt.id)
      .eq('checkout_id', id)
      .single()

    if (result.error) throw result.error

    const row = result.data

    if (
      !row ||
      row.environment !== configuration.environment ||
      !['pix', 'card'].includes(row.method) ||
      row.checkout_id !== id ||
      Number(row.amount_cents) !== session.totalCents
    ) {
      throw new Error('MP_PAYMENT_MISMATCH')
    }

    const observation =
      await reconcileMercadoPagoPayment(
        {
          orderId: id,
          attemptId: row.id,
          merchantId: String(row.merchant_id),
          amountCents: session.totalCents,
          method: row.method,
          environment: configuration.environment,
        },
        row.provider_payment_id == null
          ? null
          : String(row.provider_payment_id)
      )

    if (observation) {
      await observeCheckoutPayment(db, attempt.id, observation, 'poll')
    }

    return {
      error: '',
      session: (
        await readCheckoutSessionV2(db, id)
      ).session,
    }
  } catch (error) {
    const code = paymentCode(error)

    console.error('[pix-v2]', {
      stage: 'refresh',
      code,
    })

    return {
      error: session
        ? `Não foi possível consultar a situação agora. Não gere outro pagamento. Referência: ${code}.`
        : checkoutSessionErrorV2(error),
      ...(session ? { session } : {}),
    }
  }
}


export async function selectPaymentMethodV4(id: string, method: 'pix' | 'card'): Promise<Result> {
  try {
    if (!UUID.test(id) || !['pix', 'card'].includes(method)) throw new Error('CHECKOUT_ACCESS_INVALID')
    const db = await checkoutDatabase('review')
    const { session, accessHash } = await readCheckoutSessionV2(db, id)
    if (session.orderId || session.needsReview || session.testApproved || session.attempts.some(attempt =>
      attempt.blocksNewAttempt || attempt.applicationState === 'review' || ['approved','refunded','charged_back'].includes(attempt.state))) {
      return { error: '', session }
    }
    const saved = await db.from('serenity_checkout_sessions_v2').select('account_user_id').eq('id',id).single()
    if (saved.error) throw saved.error
    await assertPaymentOwner(saved.data?.account_user_id,db)
    const result = await db.rpc('serenity_checkout_select_method_v4', { p_checkout: id, p_access_hash: accessHash, p_method: method })
    if (result.error) {
      // Keep the existing payment flow available until the SQL migration is installed.
      if (result.error.code === 'PGRST202' && !session.paymentOptions) return { error: '', session }
      throw result.error
    }
    return { error: '', session: (await readCheckoutSessionV2(db,id)).session }
  } catch (error) { return { error: checkoutSessionErrorV2(error) } }
}
