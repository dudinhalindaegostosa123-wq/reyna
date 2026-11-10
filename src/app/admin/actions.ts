'use server'

import { redirect } from 'next/navigation'
import { adminAuth, allowedAdmin } from '@/lib/admin-auth'

export async function login(form: FormData) {
  const email = String(form.get('email') || '').trim().slice(0, 254)
  const password = String(form.get('password') || '')

  if (!email || !password || password.length > 1024) {
    redirect('/admin/login?erro=login')
  }

  const auth = adminAuth()
  const { data, error } = await auth.auth.signInWithPassword({ email, password })

  if (error || !data.user) redirect('/admin/login?erro=login')

  if (!data.user.email_confirmed_at || !allowedAdmin(data.user.id)) {
    await auth.auth.signOut()
    redirect('/admin/login?erro=permissao')
  }

  redirect('/admin/produtos')
}

export async function logout() {
  const auth = adminAuth()
  await auth.auth.signOut()
  redirect('/admin/login')
}
