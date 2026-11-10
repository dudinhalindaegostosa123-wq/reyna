'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { customerAuth } from '@/lib/customer-auth'

export interface RecoveryState { error: string; success?: boolean }
const genericSuccess = { error: '', success: true }

export async function requestPasswordReset(_state: RecoveryState, form: FormData): Promise<RecoveryState> {
  const email = String(form.get('email') || '').trim().toLowerCase()
  if (form.get('website')) return genericSuccess
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Informe um e-mail válido.' }
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://reyna-three.vercel.app')
    if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('AUTH_ORIGIN')
    if (process.env.SERENITY_LEGACY_ACTIVATION_ENABLED === 'true') {
      const { prepareLegacyRecovery } = await import('@/lib/legacy-auth-server')
      await prepareLegacyRecovery(email)
    }
    const auth = customerAuth()
    const result = await auth.auth.resetPasswordForEmail(email, { redirectTo: `${origin.origin}/minha-conta/recuperar/confirmar` })
    if (result.error) {
      if (result.error.status === 429) return { error: 'Aguarde alguns minutos antes de pedir outro link.' }
      console.error('[auth-email]', { stage: 'recovery', code: 'AUTH_EMAIL_FAILED' })
      return { error: 'Não foi possível solicitar o link agora. Tente novamente em alguns instantes.' }
    }
    // A mesma resposta para contas existentes e inexistentes.
    return genericSuccess
  } catch { return { error: 'Não foi possível solicitar o link agora. Tente novamente em alguns instantes.' } }
}

export async function changeRecoveredPassword(_state: RecoveryState, form: FormData): Promise<RecoveryState> {
  const password = form.get('password')
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 || password !== form.get('confirmation')) {
    return { error: 'Use de 12 a 128 caracteres e repita a mesma senha nos dois campos.' }
  }
  try {
    const auth = customerAuth()
    const { data, error } = await auth.auth.getUser()
    if (error || !data.user || cookies().get('serenity-password-recovery')?.value !== data.user.id) {
      return { error: 'Seu link expirou. Solicite um novo link em “Esqueci minha senha”.' }
    }
    const result = await auth.auth.updateUser({ password })
    if (result.error) return { error: 'Não foi possível alterar a senha. Use uma senha diferente da anterior ou solicite um novo link.' }
    cookies().set('serenity-password-recovery', '', { path: '/minha-conta', maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' })
    await auth.auth.signOut({ scope: 'global' })
  } catch { return { error: 'Não foi possível concluir agora. Tente novamente nesta tela.' } }
  redirect('/minha-conta/entrar?aviso=senha-alterada')
}
