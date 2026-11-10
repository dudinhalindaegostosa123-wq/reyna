import { readFetch } from '@/lib/read-fetch'
import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { customerAuth } from '@/lib/customer-auth'

export interface WholesaleRules {
  active: boolean
  discount_percent: number
  minimum_products_cents: number
  settings_version: number
  account_version: number | null
}

export interface WholesaleAccess {
  userId: string | null
  rules: WholesaleRules | null
}

function rulesFrom(value: unknown): WholesaleRules {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error('WHOLESALE_CONFIGURATION')
  }

  const data = value as Record<string, unknown>

  const discount = Number(data.discount_percent)
  const minimum = Number(data.minimum_products_cents)
  const settingsVersion = Number(data.settings_version)

  const accountVersion =
    data.account_version == null
      ? null
      : Number(data.account_version)

  if (
    typeof data.active !== 'boolean' ||
    data.discount_percent == null ||
    !Number.isFinite(discount) ||
    discount < 0 ||
    discount > 99.99 ||
    data.minimum_products_cents == null ||
    !Number.isSafeInteger(minimum) ||
    minimum < 0 ||
    data.settings_version == null ||
    !Number.isSafeInteger(settingsVersion) ||
    settingsVersion < 1 ||
    (
      accountVersion !== null &&
      (
        !Number.isSafeInteger(accountVersion) ||
        accountVersion < 1
      )
    ) ||
    (data.active && accountVersion === null)
  ) {
    throw new Error('WHOLESALE_CONFIGURATION')
  }

  return {
    active: data.active,
    discount_percent: discount,
    minimum_products_cents: minimum,
    settings_version: settingsVersion,
    account_version: accountVersion,
  }
}

function privateDatabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SECRET_KEY?.trim()

  if (!url || !key) {
    throw new Error('WHOLESALE_CONFIGURATION')
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        readFetch(input, {
          ...init,
          cache: 'no-store',
        }, fetch),
    },
  })
}

export const readWholesaleAccess = cache(
  async (
    database?: SupabaseClient
  ): Promise<WholesaleAccess> => {
    const hasSession = cookies()
      .getAll()
      .some(
        cookie =>
          cookie.name === 'serenity-customer' ||
          cookie.name.startsWith('serenity-customer.')
      )

    if (!hasSession) {
      return {
        userId: null,
        rules: null,
      }
    }

    const auth = customerAuth()

    const { data, error } = await auth.auth.getUser()

    if (error || !data.user) {
      if (process.env.SERENITY_GUEST_CHECKOUT_ENABLED === 'true') return {userId:null,rules:null}
      throw new Error('WHOLESALE_SESSION')
    }

    if (!data.user.email_confirmed_at) {
      if (process.env.SERENITY_GUEST_CHECKOUT_ENABLED === 'true') return {userId:null,rules:null}
      throw new Error('WHOLESALE_EMAIL')
    }

    const db = database || privateDatabase()

    const result = await db.rpc(
      'serenity_wholesale_context',
      {
        p_user: data.user.id,
      }
    )

    if (result.error) {
      throw new Error('WHOLESALE_CONFIGURATION')
    }

    return {
      userId: data.user.id,
      rules: rulesFrom(result.data),
    }
  }
)

export function wholesaleError(error: unknown): string {
  const message =
    error &&
    typeof error === 'object' &&
    'message' in error
      ? String(error.message)
      : ''

  if (message.includes('WHOLESALE_SESSION')) {
    return 'Sua sessão precisa ser renovada. Entre novamente em Minha conta antes de continuar.'
  }

  if (message.includes('WHOLESALE_EMAIL')) {
    return 'Confirme o e-mail da sua conta antes de continuar.'
  }

  if (message.includes('WHOLESALE_MINIMUM')) {
    return 'O pedido ainda não atingiu o mínimo do atacado em produtos após o desconto. Frete e anodização não entram nesse mínimo.'
  }

  if (message.includes('WHOLESALE_COUPON')) {
    return 'O atacado já utiliza seu desconto próprio. Remova o cupom da loja para continuar.'
  }

  if (message.includes('WHOLESALE_UNAVAILABLE')) {
    return 'O acesso ou as regras do atacado mudaram. Atualize a página e confira sua conta antes de continuar.'
  }

  if (message.includes('WHOLESALE_CONFIGURATION')) {
    return 'Não foi possível conferir as regras do atacado agora. Tente novamente em instantes.'
  }

  return ''
}
