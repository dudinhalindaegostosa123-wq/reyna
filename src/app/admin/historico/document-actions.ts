'use server'
import { revalidatePath } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { parseLegacyDocuments } from '@/lib/legacy-documents'
export interface LegacyDocumentSummary { ready: number; review: number; ignored: number; review_orders: { order_id: number; reason: string }[] }
export async function importLegacyDocuments(_previous: { error: string; summary?: LegacyDocumentSummary }, form: FormData): Promise<{ error: string; summary?: LegacyDocumentSummary }> {
  const { db, user } = await adminDatabase()
  if (process.env.VERCEL_ENV !== 'production') return { error: 'Importe os documentos no painel de produção.' }
  const file = form.get('documents')
  if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024) return { error: 'Escolha o CSV de documentos com até 3 MB.' }
  try {
    const rows = parseLegacyDocuments(await file.text())
    const result = await db.rpc('serenity_legacy_import_documents_v1', { p_rows: rows, p_actor: user.id })
    if (result.error) return { error: result.error.message.includes('CONFLICT') ? 'Um documento difere de uma importação anterior. Nenhuma alteração aplicada; confira os registros.' : 'Não foi possível importar. Confira se o SQL de documentos foi instalado no Supabase.' }
    revalidatePath('/admin/historico'); revalidatePath('/admin/etiquetas')
    return { error: '', summary: result.data as LegacyDocumentSummary }
  } catch (error) { return { error: error instanceof Error ? error.message : 'Não foi possível ler o arquivo.' } }
}
