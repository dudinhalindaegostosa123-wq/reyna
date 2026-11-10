'use server'

import { revalidatePath } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { shippingFields } from '@/lib/shipping'

export async function saveShippingSettings(
  data: FormData
): Promise<{ error: string; version?: number }> {
  const { db, user } = await adminDatabase()
  let payload: ReturnType<typeof shippingFields>, version: number

  try {
    payload = shippingFields(data, user.email || '')
    version = Number(data.get('version'))
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new Error('Atualize a página e tente salvar novamente.')
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Confira as configurações.',
    }
  }

  const { data: next, error } = await db.rpc(
    'serenity_shipping_settings_save',
    { p_data: payload, p_version: version }
  )

  if (error) {
    return {
      error: error.message.includes('SHIPPING_SETTINGS_CHANGED')
        ? 'As configurações foram alteradas em outra tela. Atualize antes de salvar.'
        : 'Não foi possível salvar. Confira os dados e se o SQL desta etapa foi executado.',
    }
  }

  revalidatePath('/admin/frete')
  return { error: '', version: Number(next) }
}
