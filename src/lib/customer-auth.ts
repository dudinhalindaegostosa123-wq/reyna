import { readFetch } from '@/lib/read-fetch'
import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export function customerAuth() {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!url || !key) {
    throw new Error('CUSTOMER_AUTH_CONFIGURATION')
  }

  const jar = cookies()

  return createServerClient(url, key, {
    global: {
      fetch: (input, init) =>
        readFetch(input, {
          ...init,
          cache: 'no-store',
        }, fetch),
    },

    cookieOptions: {
      name: 'serenity-customer',
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },

    cookies: {
      getAll: () => jar.getAll(),

      setAll: items => {
        try {
          items.forEach(({ name, value, options }) =>
            jar.set(name, value, options)
          )
        } catch {
          // Em páginas, a renovação será feita pelo middleware.
        }
      },
    },
  })
}

export async function requireCustomer() {
  const auth = customerAuth()

  const {
    data: { user },
    error,
  } = await auth.auth.getUser()

  if (error || !user) {
    redirect('/minha-conta/entrar')
  }

  if (!user.email_confirmed_at) {
    redirect('/minha-conta/entrar?aviso=confirme-email')
  }

  return { auth, user }
}
