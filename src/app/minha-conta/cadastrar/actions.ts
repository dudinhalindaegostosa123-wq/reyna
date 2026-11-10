'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { customerAuth } from '@/lib/customer-auth'
import { normalizeCheckoutDocument } from '@/lib/checkout-document'

export interface RegisterState {
  error: string
  success?: boolean
  fieldErrors?: Record<string, string>
}

type Profile = {
  name: string
  phone: string
  document: string
  account_type: 'retail' | 'wholesale'
}

function readProfile(
  input: Record<string, unknown>
): {
  profile?: Profile
  errors: Record<string, string>
} {
  const errors: Record<string, string> = {}

  const name =
    typeof input.name === 'string'
      ? input.name.trim()
      : ''

  const rawPhone =
    typeof input.phone === 'string'
      ? input.phone
      : ''

  const phone = rawPhone.replace(/\D/g, '')
  const type = input.account_type

  let document = ''

  if (
    !name ||
    name.length > 180 ||
    /[\u0000-\u001F\u007F]/.test(name)
  ) {
    errors.name =
      'Informe seu nome completo ou razão social.'
  }

  if (
    rawPhone.length > 25 ||
    !/^\d{10,11}$/.test(phone)
  ) {
    errors.phone =
      'Informe seu telefone com DDD.'
  }

  try {
    document = normalizeCheckoutDocument(
      input.document
    )
  } catch (error) {
    errors.document =
      error instanceof Error
        ? error.message
        : 'Informe um CPF ou CNPJ válido.'
  }

  if (
    type !== 'retail' &&
    type !== 'wholesale'
  ) {
    errors.account_type =
      'Escolha compra na loja ou solicitação de atacado.'
  }

  if (Object.keys(errors).length) {
    return { errors }
  }

  return {
    errors,
    profile: {
      name,
      phone,
      document,
      account_type: type as 'retail' | 'wholesale',
    },
  }
}

export async function completeCustomerRegistration(): Promise<{
  error: string
}> {
  try {
    const auth = customerAuth()

    const {
      data: { user },
      error,
    } = await auth.auth.getUser()

    if (
      error ||
      !user ||
      !user.email ||
      !user.email_confirmed_at
    ) {
      return {
        error:
          'Entre com seu e-mail confirmado para concluir o cadastro.',
      }
    }

    const existing = await auth
      .from('serenity_customer_accounts')
      .select('customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing.error) {
      return {
        error:
          'Não foi possível conferir seu cadastro. Tente novamente em instantes.',
      }
    }

    if (existing.data) {
      return {
        error: existing.data.customer_id
          ? ''
          : 'Seu cadastro precisa de conferência. Fale com a equipe Lunarity.',
      }
    }

    const metadata: unknown =
      user.user_metadata?.serenity_registration

    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata)
    ) {
      return {
        error:
          'Não foi possível recuperar seus dados de cadastro. Fale com a equipe Lunarity.',
      }
    }

    const checked = readProfile(
      metadata as Record<string, unknown>
    )

    if (!checked.profile) {
      return {
        error:
          'Confira seus dados de cadastro com a equipe Lunarity.',
      }
    }

    const url = process.env.SUPABASE_URL?.trim()
    const key = process.env.SUPABASE_SECRET_KEY?.trim()

    if (!url || !key) {
      return {
        error:
          'O cadastro está temporariamente indisponível. Tente novamente mais tarde.',
      }
    }

    const db = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: 'no-store',
          }),
      },
    })

    const profile = checked.profile

    const result = await db.rpc(
      'serenity_customer_account_register',
      {
        p_user: user.id,
        p_email: user.email,
        p_name: profile.name,
        p_phone: profile.phone,
        p_document: profile.document,
        p_wholesale:
          profile.account_type === 'wholesale',
      }
    )

    if (
      result.error ||
      !result.data ||
      result.data.user_id !== user.id ||
      !result.data.customer_id
    ) {
      return {
        error:
          'Não foi possível concluir seu cadastro. Tente entrar novamente ou fale com a equipe Lunarity.',
      }
    }

    revalidatePath('/minha-conta', 'layout')
    revalidatePath('/admin/clientes')
    if (profile.account_type === 'wholesale') {
      try {
        const { safeDrainOrderEmails } = await import('@/lib/order-email-server')
        await safeDrainOrderEmails(db)
      } catch { /* Cadastro salvo; falhas de e-mail não exigem repetir a solicitação. */ }
    }

    return { error: '' }
  } catch {
    return {
      error:
        'A conexão falhou ao concluir o cadastro. Tente novamente em instantes.',
    }
  }
}

export async function registerCustomer(
  _previous: RegisterState,
  form: FormData
): Promise<RegisterState> {
  const website = form.get('website')

  if (website !== null && website !== '') {
    return {
      error: 'Não foi possível enviar o cadastro.',
    }
  }

  const checked = readProfile({
    name: form.get('name'),
    phone: form.get('phone'),
    document: form.get('document'),
    account_type: form.get('account_type'),
  })

  const fieldErrors = {
    ...checked.errors,
  }

  const rawEmail = form.get('email')

  const email =
    typeof rawEmail === 'string'
      ? rawEmail.trim().toLowerCase()
      : ''

  const password = form.get('password')
  const confirmation = form.get(
    'password_confirmation'
  )

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    fieldErrors.email =
      'Informe um e-mail válido.'
  }

  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    password.length > 128
  ) {
    fieldErrors.password =
      'Use uma senha de 8 a 128 caracteres.'
  }

  if (
    typeof confirmation !== 'string' ||
    confirmation !== password
  ) {
    fieldErrors.password_confirmation =
      'As senhas precisam ser iguais.'
  }

  if (
    Object.keys(fieldErrors).length ||
    !checked.profile ||
    typeof password !== 'string'
  ) {
    return {
      error: 'Confira os campos destacados.',
      fieldErrors,
    }
  }

  let immediateSession = false

  try {
    const site = new URL(
      process.env.SERENITY_SITE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_URL || 'https://reyna-three.vercel.app'
    )

    if (
      site.protocol !== 'https:' ||
      site.username ||
      site.password
    ) {
      return {
        error:
          'O cadastro está temporariamente indisponível.',
      }
    }

    // Guarda somente o destino permitido, para retornar após confirmar o e-mail.
    const jar = cookies()
    if (form.get('return_to') === '/checkout') {
      jar.set('serenity-auth-return', 'checkout', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/minha-conta', maxAge: 86400 })
    } else {
      jar.set('serenity-auth-return', '', { path: '/minha-conta', maxAge: 0 })
    }
    const auth = customerAuth()

    const result = await auth.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          `${site.origin}/minha-conta/confirmar`,
        data: {
          serenity_registration: checked.profile,
        },
      },
    })

    if (result.error) {
      if (
        result.error.code === 'user_already_exists'
      ) {
        return {
          error: '',
          success: true,
        }
      }

      if (
        result.error.status === 429 ||
        result.error.code ===
          'over_email_send_rate_limit'
      ) {
        return {
          error:
            'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
        }
      }

      if (result.error.code === 'weak_password') {
        return {
          error: 'Escolha uma senha mais forte.',
          fieldErrors: {
            password:
              'Use uma senha mais forte, com letras, números e símbolos.',
          },
        }
      }

      return {
        error:
          'Não foi possível iniciar o cadastro. Tente novamente mais tarde.',
      }
    }

    immediateSession = Boolean(
      result.data.session
    )

    if (immediateSession) {
      const completed =
        await completeCustomerRegistration()

      if (completed.error) {
        return {
          error: completed.error,
        }
      }
    }
  } catch {
    return {
      error:
        'Não foi possível conectar agora. Tente novamente em instantes.',
    }
  }

  if (immediateSession) {
    cookies().set('serenity-auth-return', '', { path: '/minha-conta', maxAge: 0 })
    redirect(form.get('return_to') === '/checkout' ? '/checkout' : '/minha-conta')
  }

  return {
    error: '',
    success: true,
  }
}


// Completa uma conta antiga somente após comprovação de acesso ao e-mail.
export async function finishImportedProfile(_previous: RegisterState, form: FormData): Promise<RegisterState> {
  const checked = readProfile({ name: form.get('name'), phone: form.get('phone'), document: form.get('document'), account_type: 'retail' })
  if (!checked.profile) return { error: 'Confira os campos.', fieldErrors: checked.errors }
  try {
    const auth = customerAuth()
    const { data, error } = await auth.auth.getUser()
    if (error || !data.user?.email_confirmed_at) return { error: 'Entre com seu e-mail confirmado para continuar.' }
    const { legacyProfile } = await import('@/lib/legacy-history-server')
    const imported = await legacyProfile(auth)
    if (!imported.eligible) return { error: 'Não foi possível validar este cadastro antigo. Fale com a equipe Lunarity.' }
    if (imported.needs_profile) {
      const saved = await auth.auth.updateUser({ data: { ...data.user.user_metadata, serenity_registration: checked.profile } })
      if (saved.error) return { error: 'Não foi possível salvar agora. Tente novamente.' }
      const completed = await completeCustomerRegistration()
      if (completed.error) return { error: completed.error }
    }
  } catch { return { error: 'Não foi possível concluir agora. Tente novamente nesta tela.' } }
  revalidatePath('/minha-conta', 'layout')
  redirect(form.get('return_to') === '/checkout' ? '/checkout' : '/minha-conta')
}
