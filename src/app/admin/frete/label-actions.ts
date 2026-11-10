'use server'

import { revalidatePath } from 'next/cache'
import { scopedLabelDatabase } from '@/lib/label-scope-server'
import type { LabelScope } from '@/lib/label-scope'
import { adminDatabase } from '@/lib/admin-auth'
import { saleUuid } from '@/lib/admin-sales'
import { readLabelFields } from '@/lib/label-draft'
import type { SenderData, LabelData } from '@/lib/label-draft'
import { loadLabelSender, loadLabelPreparation } from '@/lib/label-draft-server'

function version(data: FormData, key: string, minimum = 0) {
  const raw = String(data.get(key) || '')
  if (!/^\d{1,15}$/.test(raw) || Number(raw) < minimum) {
    throw new Error('Atualize a página antes de salvar.')
  }
  return Number(raw)
}

function errorMessage(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : ''

  if (message.includes('LABEL_JOB_LOCKED')) return 'Já existe uma preparação em andamento ou vinculada ao Melhor Envio. Confira o estado do envio antes de editar.'
  if (message.includes('LABEL_STALE')) {
    return 'O pedido, remetente ou rascunho mudou em outra tela. Atualize a página e confira antes de salvar.'
  }
  if (message.includes('LABEL_ORDER_STATUS')) {
    return 'Pedidos cancelados ou estornados não podem receber uma preparação de envio.'
  }
  return 'Não foi possível salvar os dados do envio. Tente novamente; se persistir, confira se o SQL desta etapa foi executado.'
}

export async function saveLabelSender(
  data: FormData
): Promise<{ error: string; sender?: SenderData }> {
  const { db, user } = await adminDatabase()
  let fields: ReturnType<typeof readLabelFields>, expected: number

  try {
    fields = readLabelFields(data, 'sender')
    expected = version(data, 'version', 1)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Confira os campos.' }
  }

  try {
    const { error } = await db.rpc('serenity_label_save_sender', {
      p_fields: fields,
      p_version: expected,
      p_actor: user.id,
    })
    if (error) throw error

    const { data: config, error: configError } = await db
      .from('serenity_shipping_settings')
      .select('origin').eq('singleton', true).single()

    if (configError) throw configError

    const sender = await loadLabelSender(db, config.origin)
    revalidatePath('/admin/frete')
    revalidatePath('/admin/pedidos/[id]', 'page')

    return { error: '', sender }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

export async function saveLabelDraft(
  id: string,
  data: FormData,
  scope: LabelScope = 'current'
): Promise<{ error: string; draft?: LabelData }> {
  const { db: rawDb, user } = await adminDatabase()
  const db = scopedLabelDatabase(rawDb, scope)
  if (!saleUuid(id)) return { error: 'Pedido inválido.' }

  let fields: ReturnType<typeof readLabelFields>
  let expected: number, senderVersion: number, orderVersion: string

  try {
    fields = readLabelFields(data, 'draft')
    expected = version(data, 'version')
    senderVersion = version(data, 'sender_version', 1)
    orderVersion = String(data.get('order_version') || '')

    if (orderVersion.length > 50 || !Number.isFinite(Date.parse(orderVersion))) {
      throw new Error('Atualize a página antes de salvar.')
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Confira os dados.' }
  }

  try {
    const { error } = await db.rpc('serenity_label_save_draft', {
      p_order: id,
      p_fields: fields,
      p_version: expected,
      p_order_version: orderVersion,
      p_sender_version: senderVersion,
      p_actor: user.id,
    })
    if (error) throw error

    const { data: order, error: orderError } = await db
      .from('serenity_orders').select('*').eq('id', id).single()

    if (orderError) throw orderError

    const draft = await loadLabelPreparation(db, order)
    revalidatePath('/admin/pedidos/' + id)

    return { error: '', draft }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

// Serenity: custo e carrinho de etiquetas v1
