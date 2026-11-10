'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { customerAuth } from '@/lib/customer-auth'
import { completeCustomerRegistration } from '../cadastrar/actions'

export interface LoginState {
  error: string
}

export async function loginCustomer(
  _previous: LoginState,
  form: FormData
): Promise<LoginState> {
  const rawEmail = form.get('email')
  const password = form.get('password')
  const website = form.get('website')

  if (
    typeof rawEmail !== 'string' ||
    typeof password !== 'string' ||
    (website !== null && website !== '')
  ) {
    return {
      error: 'Confira seu e-mail e sua senha.',
    }
  }

  const email = rawEmail.trim().toLowerCase()

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password.length ||
    password.length > 128
  ) {
    return {
      error: 'Confira seu e-mail e sua senha.',
    }
  }

  let needsImportedProfile = false
  try {
    const auth = customerAuth()

    const result = await auth.auth.signInWithPassword({
      email,
      password,
    })

    if (result.error) {
      if (result.error.status === 429) {
        return {
          error:
            'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
        }
      }

      if (result.error.code === 'email_not_confirmed') {
        return {
          error:
            'Confirme seu e-mail antes de entrar. Confira também a caixa de spam.',
        }
      }

      return {
        error:
          'Não foi possível entrar. Confira seu e-mail e sua senha.',
      }
    }

    if (!result.data.user?.email_confirmed_at) {
      await auth.auth.signOut({
        scope: 'local',
      })

      return {
        error: 'Confirme seu e-mail antes de entrar.',
      }
    }

    if (process.env.SERENITY_LEGACY_ACTIVATION_ENABLED === 'true') {
      const { legacyProfile } = await import('@/lib/legacy-history-server')
      const imported = await legacyProfile(auth)
      needsImportedProfile = imported.eligible && imported.needs_profile === true
    }
    if (!needsImportedProfile) {
      const completed = await completeCustomerRegistration()
      if (completed.error) return { error: completed.error }
    }
  } catch {
    return {
      error:
        'Não foi possível conectar agora. Tente novamente em instantes.',
    }
  }

  revalidatePath('/minha-conta', 'layout')
  if (needsImportedProfile) redirect(form.get('return_to') === '/checkout' ? '/minha-conta/completar?retorno=checkout' : '/minha-conta/completar')
  redirect(form.get('return_to') === '/checkout' ? '/checkout' : '/minha-conta')
}

export async function logoutCustomer(): Promise<void> {
  let failed = false

  try {
    const auth = customerAuth()

    const { error } = await auth.auth.signOut({
      scope: 'local',
    })

    failed = Boolean(error)
  } catch {
    failed = true
  }

  if (failed) {
    redirect('/minha-conta?aviso=saida-nao-confirmada')
  }

  revalidatePath('/minha-conta', 'layout')
  redirect('/minha-conta/entrar')
}
