'use server'
import { revalidatePath } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { parseLegacyItemOptions } from '@/lib/legacy-item-options'
export async function importLegacyItemOptions(_previous: { error: string; changed?: number }, form: FormData): Promise<{ error: string; changed?: number }> {
  const { db } = await adminDatabase()
  if (process.env.VERCEL_ENV !== 'production') return { error: 'Importe as opções pelo painel de produção.' }
  const file = form.get('options')
  if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024) return { error: 'Escolha o CSV de opções com até 3 MB.' }
  try {
    const rows = parseLegacyItemOptions(await file.text())
    const result = await db.rpc('serenity_legacy_import_options_v1', { p_rows: rows })
    if (result.error) {
      if (result.error.message.includes('CONFLICT')) return { error: 'Uma opção difere da já importada. Nenhuma alteração aplicada; confira o arquivo.' }
      if (result.error.message.includes('ITEM_NOT_FOUND')) return { error: 'Há um item que não corresponde ao pedido importado. Nenhuma alteração aplicada.' }
      return { error: 'Não foi possível importar. Confira se o SQL das opções foi instalado no Supabase.' }
    }
    revalidatePath('/admin/historico'); revalidatePath('/minha-conta')
    return { error: '', changed: Number(result.data) }
  } catch (error) { return { error: error instanceof Error ? error.message : 'Não foi possível ler o CSV.' } }
}
