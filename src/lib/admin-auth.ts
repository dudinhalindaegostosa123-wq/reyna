import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { adminKeyProblem } from '@/lib/admin-diagnostics'

export function adminAuth() {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) throw new Error('ADMIN_CONFIGURATION')
  const jar = cookies()

  return createServerClient(url, key, {
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
    cookieOptions: {
      name: 'serenity-admin',
      path: '/admin',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) => jar.set(name, value, options))
        } catch {
          // A renovação dos cookies em páginas é feita pelo middleware.
        }
      },
    },
  })
}

export function allowedAdmin(id: string) {
  const ids = (process.env.SERENITY_ADMIN_USER_IDS || '')
    .split(',').map((item) => item.trim()).filter(Boolean)
  return ids.includes(id)
}

export async function requireAdmin() {
  const auth = adminAuth()
  const { data: { user }, error } = await auth.auth.getUser()

  if (error || !user) redirect('/admin/login')

  if (!user.email_confirmed_at || !allowedAdmin(user.id)) {
    redirect('/admin/login?erro=permissao')
  }

  return user
}

export async function adminDatabase() {
  const user = await requireAdmin()
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SECRET_KEY?.trim()

  if (!url || !key) redirect('/admin/configuracao')
  if (adminKeyProblem(key, url)) redirect('/admin/configuracao?motivo=chave')

  const db = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })

  return { db, user }
}
