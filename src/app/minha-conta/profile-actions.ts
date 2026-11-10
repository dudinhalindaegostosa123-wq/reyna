'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireCustomer } from '@/lib/customer-auth'

export interface ProfileValues {
  name: string
  phone: string
}

export interface ProfileState {
  error: string
  fieldErrors?: Partial<
    Record<keyof ProfileValues, string>
  >
  values?: ProfileValues
  saved?: ProfileValues
}

export async function saveCustomerProfile(
  _previous: ProfileState,
  form: FormData
): Promise<ProfileState> {
  const { user } = await requireCustomer()

  const rawName = form.get('name')
  const rawPhone = form.get('phone')
  const previousName = form.get('expected_name')
  const previousPhone = form.get('expected_phone')

  const values = {
    name: typeof rawName === 'string'
      ? rawName
      : '',
    phone: typeof rawPhone === 'string'
      ? rawPhone
      : '',
  }

  const name = values.name.trim()
  const phone = values.phone.replace(/\D/g, '')

  const fieldErrors: Partial<
    Record<keyof ProfileValues, string>
  > = {}

  if (
    typeof rawName !== 'string' ||
    !name ||
    name.length > 180 ||
    /[\u0000-\u001F\u007F]/.test(name)
  ) {
    fieldErrors.name =
      'Informe seu nome completo ou razão social, com até 180 caracteres.'
  }

  if (
    typeof rawPhone !== 'string' ||
    values.phone.length > 25 ||
    !/^[0-9+(). -]+$/.test(values.phone) ||
    !/^\d{10,11}$/.test(phone)
  ) {
    fieldErrors.phone =
      'Informe um telefone com DDD, com 10 ou 11 números.'
  }

  if (Object.keys(fieldErrors).length) {
    return {
      error: 'Confira os campos destacados.',
      fieldErrors,
      values,
    }
  }

  if (
    typeof previousName !== 'string' ||
    previousName.length > 180 ||
    typeof previousPhone !== 'string' ||
    previousPhone.length > 25
  ) {
    return {
      error:
        'Atualize a página antes de salvar seus dados.',
      values,
    }
  }

  try {
    const url = process.env.SUPABASE_URL?.trim()
    const key = process.env.SUPABASE_SECRET_KEY?.trim()

    if (!url || !key) {
      return {
        error:
          'Não foi possível salvar agora. Tente novamente mais tarde.',
        values,
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

    const result = await db.rpc(
      'serenity_customer_profile_update',
      {
        p_user: user.id,
        p_name: name,
        p_phone: phone,
        p_expected_name: previousName,
        p_expected_phone: previousPhone,
      }
    )

    if (result.error) {
      const message = String(result.error.message)

      const error = message.includes(
        'CUSTOMER_PROFILE_STALE'
      )
        ? 'Seus dados mudaram em outra operação. Atualize a página e confira antes de salvar novamente.'
        : message.includes(
            'CUSTOMER_PROFILE_UNAVAILABLE'
          )
          ? 'Não foi possível localizar seu cadastro. Fale com a equipe Serenity.'
          : 'Não foi possível confirmar o salvamento. Atualize a página antes de tentar novamente.'

      return {
        error,
        values,
      }
    }

    const data: unknown = result.data

    const saved =
      data &&
      typeof data === 'object' &&
      !Array.isArray(data)
        ? data as Record<string, unknown>
        : {}

    if (
      saved.name !== name ||
      saved.phone !== phone
    ) {
      return {
        error:
          'Não foi possível confirmar o salvamento. Atualize a página para conferir seus dados.',
        values,
      }
    }

    revalidatePath('/minha-conta')
    revalidatePath('/admin/clientes')
    revalidatePath('/admin/atacado')

    return {
      error: '',
      saved: {
        name,
        phone,
      },
    }
  } catch {
    return {
      error:
        'A conexão falhou. Atualize a página para conferir seus dados antes de tentar novamente.',
      values,
    }
  }
}
