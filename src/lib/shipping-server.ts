import { getCommercePolicy } from '@/lib/commerce-server'
import 'server-only'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CheckoutLine,
  CheckoutQuote,
} from '@/lib/checkout'
import type {
  ShippingSettings,
  DeliveryOption,
} from '@/lib/shipping'
import { checkoutHash } from '@/lib/checkout-server'
import { deliveryEstimateDays, SHIPPING_PREPARATION_DAYS } from '@/lib/shipping'
import {
  melhorEnvio,
  readQuotes,
} from '@/lib/melhor-envio'

interface WholesaleQuote extends CheckoutQuote {
  pricing_mode?: string
  wholesale?: {
    active: boolean
    discount_percent: number
    minimum_products_cents: number
    settings_version: number
    account_version: number | null
    products_cents: number
    minimum_met: boolean
  }
}

function wholesaleSnapshot(
  quote: WholesaleQuote,
  userId?: string
): Record<string, unknown> {
  if (!userId) {
    if (quote.pricing_mode === 'wholesale') {
      throw new Error('WHOLESALE_UNAVAILABLE')
    }

    return {
      pricing_mode: 'retail',
    }
  }

  const rules = quote.wholesale

  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      userId
    ) ||
    quote.pricing_mode !== 'wholesale' ||
    !rules ||
    rules.active !== true ||
    !Number.isFinite(rules.discount_percent) ||
    rules.discount_percent < 0 ||
    rules.discount_percent > 99.99 ||
    !Number.isSafeInteger(rules.settings_version) ||
    rules.settings_version < 1 ||
    !Number.isSafeInteger(rules.account_version) ||
    Number(rules.account_version) < 1 ||
    !Number.isSafeInteger(rules.minimum_products_cents) ||
    rules.minimum_products_cents < 0 ||
    !Number.isSafeInteger(rules.products_cents) ||
    rules.products_cents < 0
  ) {
    throw new Error('WHOLESALE_CONFIGURATION')
  }

  if (
    rules.minimum_met !== true ||
    rules.products_cents < rules.minimum_products_cents
  ) {
    throw new Error('WHOLESALE_MINIMUM')
  }

  return {
    pricing_mode: 'wholesale',
    wholesale: {
      user_id: userId,
      discount_percent: rules.discount_percent,
      minimum_products_cents: rules.minimum_products_cents,
      settings_version: rules.settings_version,
      account_version: rules.account_version,
      products_cents: rules.products_cents,
    },
  }
}

export async function shippingSettings(
  db: SupabaseClient
): Promise<ShippingSettings> {
  const { data, error } = await db
    .from('serenity_shipping_settings')
    .select('*')
    .eq('singleton', true)
    .single()

  if (error) {
    throw new Error('SHIPPING_CONFIGURATION')
  }

  return data as ShippingSettings
}

export async function deliveryOptions(
  db: SupabaseClient,
  items: CheckoutLine[],
  request: string,
  cep: string,
  quote: CheckoutQuote,
  wholesaleUserId?: string,
  discountedQuote?: CheckoutQuote
) {
  const pricing = wholesaleSnapshot(
    quote,
    wholesaleUserId
  )

  const settings = await shippingSettings(db)

  const manual =
    !settings.enabled ||
    settings.max_units === null ||
    items.reduce(
      (quantity, item) => quantity + item.quantity,
      0
    ) > settings.max_units ||
    items.some(item =>
      settings.manual_slugs.includes(item.slug)
    )

  const volume = {
    weight: settings.weight_g / 1000,
    height: Number(settings.height),
    width: Number(settings.width),
    length: Number(settings.length),
    insurance: quote.total_cents / 100,
  }

  let options: DeliveryOption[]
  let raw: unknown[] = []

  const providers = new Map<string, unknown>()

  if (manual) {
    options = [
      {
        id: randomUUID(),
        company: 'Lunarity',
        service: 'Frete a confirmar com a equipe',
        amount_cents: 0,
        days: null,
        manual: true,
      },
    ]
  } else {
    raw = await melhorEnvio(
      'calculate',
      settings.contact_email || '',
      {
        from: {
          postal_code: settings.origin,
        },
        to: {
          postal_code: cep,
        },
        volumes: [volume],
        options: {
          receipt: false,
          own_hand: false,
        },
      }
    )

    options = readQuotes(raw)
      .filter(quote => quote.price <= 1000000)
      .slice(0, 50)
      .map(quote => {
        const id = randomUUID()

        providers.set(
          id,
          raw.find(
            row =>
              row &&
              typeof row === 'object' &&
              'id' in row &&
              String(
                (row as { id: unknown }).id
              ) === quote.id
          ) || null
        )

        return {
          id,
          company: quote.company,
          service: quote.service,
          amount_cents: Math.round(
            quote.price * 100
          ),
          days: deliveryEstimateDays(quote.days),
          manual: false,
        }
      })
  }

  if (!options.length) {
    return {
      options: [],
      message:
        'Nenhuma transportadora retornou um serviço para esse CEP e pacote. Confira o CEP ou fale com o atendimento.',
    }
  }

  const commerce = await getCommercePolicy()
  const threshold = commerce.retail_free_shipping_minimum_cents
  const eligibleTotal = commerce.free_shipping_after_discounts ? (discountedQuote || quote).total_cents : quote.total_cents
  const freeIndex = !manual && !wholesaleUserId && threshold !== null && eligibleTotal >= threshold
    ? options.reduce((best,option,index)=>best<0 || option.amount_cents<options[best].amount_cents?index:best,-1) : -1
  const originalFreight = freeIndex >= 0 ? options[freeIndex].amount_cents : null
  if(freeIndex>=0) options=options.map((option,index)=>index===freeIndex?{...option,amount_cents:0}:option)

  const expires = new Date(
    Date.now() + 15 * 60 * 1000
  ).toISOString()

  const rows = options.map(option => ({
    id: option.id,
    request_id: request,
    cart_hash: checkoutHash(
      JSON.stringify(items)
    ),
    destination: cep,
    subtotal_cents: quote.total_cents,
    amount_cents: option.amount_cents,
    manual: option.manual,
    settings_version: settings.version,
    expires_at: expires,
    snapshot: {
      company: option.company,
      service: option.service,
      days: option.days,
      ...(!option.manual ? { preparation_days: SHIPPING_PREPARATION_DAYS } : {}),
      origin: settings.origin,
      destination: cep,
      volume,
      provider:
        providers.get(option.id) || null,
      ...(freeIndex >= 0 && options[freeIndex].id===option.id ? {free_shipping:{minimum_cents:threshold,basis_cents:eligibleTotal,original_amount_cents:originalFreight,commerce_version:commerce.version}}:{}),
      ...pricing,
    },
  }))

  await db
    .from('serenity_shipping_quotes')
    .delete()
    .lt(
      'expires_at',
      new Date(
        Date.now() - 48 * 60 * 60 * 1000
      ).toISOString()
    )

  const { error } = await db
    .from('serenity_shipping_quotes')
    .insert(rows)

  if (error) {
    throw new Error('SHIPPING_QUOTE_SAVE')
  }

  return {
    options,
    message: manual
      ? 'Este pedido precisa de confirmação do frete pela equipe. O valor da entrega será informado antes do pagamento.'
      : 'Escolha uma entrega. A cotação vale por 15 minutos; o prazo estimado de entrega começa após a confirmação do pagamento.',
  }
}

export function deliveryError(error: unknown) {
  const message =
    error &&
    typeof error === 'object' &&
    'message' in error
      ? String(error.message)
      : ''

  if (
    message.includes('SHIPPING_QUOTE_EXPIRED')
  ) {
    return 'A cotação expirou ou os dados mudaram. Calcule o frete novamente.'
  }

  if (
    message.includes('SHIPPING_CONFIGURATION')
  ) {
    return 'As configurações de envio ainda não estão disponíveis. Fale com o atendimento.'
  }

  return ''
}
