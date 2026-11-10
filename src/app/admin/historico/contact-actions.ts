'use server'
import { revalidatePath } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { parseLegacyContacts } from '@/lib/legacy-contacts'
export interface LegacyContactSummary { imported: number; ignored: number }
export async function importLegacyContacts(_previous: { error: string; summary?: LegacyContactSummary }, form: FormData): Promise<{ error: string; summary?: LegacyContactSummary }> {
  const { db, user } = await adminDatabase()
  if (process.env.VERCEL_ENV !== 'production') return { error: 'Importe os contatos e endereços no painel de produção.' }
  const file = form.get('contacts')
  if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024) return { error: 'Escolha o CSV de contatos e endereços com até 3 MB.' }
  try {
    const rows = parseLegacyContacts(await file.text())
    const result = await db.rpc('serenity_legacy_import_contacts_v1', { p_rows: rows, p_actor: user.id })
    if (result.error) return { error: result.error.message.includes('CONFLICT') ? 'Um contato difere de uma importação anterior. Nenhuma alteração aplicada; confira os registros.' : 'Não foi possível importar. Confira se o SQL de contatos e endereços foi instalado no Supabase.' }
    revalidatePath('/admin/historico'); revalidatePath('/admin/etiquetas')
    return { error: '', summary: result.data as LegacyContactSummary }
  } catch (error) { return { error: error instanceof Error ? error.message : 'Não foi possível ler o arquivo.' } }
}
