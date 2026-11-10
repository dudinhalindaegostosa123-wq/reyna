'use server'

import { revalidatePath } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { saleUuid } from '@/lib/admin-sales'
import { matchLegacyRecipient } from '@/lib/legacy-label-binding'
import { labelShipmentRequest, inspectShipment } from '@/lib/label-purchase-server'
import { remotePrice } from '@/lib/label-cart-server'

function message(error: unknown) {
  const code = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  if (code.includes('LEGACY_LABEL_RECIPIENT')) return 'O nome/e-mail e CEP do destinatário não conferem com este pedido. Confira o ID e os dados antes de vincular.'
  if (code.includes('LABEL_REMOTE_ALREADY_LINKED') || code.includes('duplicate key')) return 'Essa etiqueta já está vinculada a um pedido. Não compre outra; confira o vínculo existente.'
  if (code.includes('LEGACY_LABEL_REVIEW')) return 'Este pedido tem uma pendência, estorno ou situação que precisa ser conferida antes do envio.'
  if (code.includes('LABEL_JOB_LOCKED')) return 'Este pedido já tem uma preparação ou etiqueta vinculada. Atualize a central para conferir.'
  return 'Não foi possível concluir. Confira se o SQL de etiquetas antigas foi instalado e atualize a central antes de tentar novamente.'
}
export async function startLegacyLabel(oldId: string, intent: 'new' | 'existing', confirmed: boolean) {
  const { db, user } = await adminDatabase()
  if (!/^[1-9][0-9]{0,14}$/.test(oldId) || !['new','existing'].includes(intent) || confirmed !== true) return { error: 'Confirme a situação deste pedido antes de continuar.' }
  try {
    const result = await db.rpc('serenity_legacy_label_start_v1', { p_old: oldId, p_intent: intent, p_actor: user.id })
    if (result.error) throw result.error
    if (!saleUuid(result.data)) throw new Error('LEGACY_LABEL_RESULT')
    revalidatePath('/admin/etiquetas'); revalidatePath('/admin/historico')
    return { error: '', id: result.data as string }
  } catch (error) { return { error: message(error) } }
}

export async function linkLegacyLabel(oldId: string, remoteId: string, confirmed: boolean) {
  const { db, user } = await adminDatabase()
  if (!/^[1-9][0-9]{0,14}$/.test(oldId) || !saleUuid(remoteId) || confirmed !== true) return { error: 'Informe o ID completo do envio e confirme a conferência do destinatário.' }
  try {
    const old = await db.from('serenity_legacy_orders_v1').select('payload').eq('old_id', oldId).single()
    if (old.error) throw old.error
    // Apenas leitura no provedor; vincular não compra nem gera uma etiqueta.
    const response = await labelShipmentRequest('info', remoteId, user.email || '')
    const recipient = matchLegacyRecipient(response, old.data.payload)
    const service = String(recipient.value.service_id || (recipient.value.service as { id?: unknown })?.id || recipient.value.service || '')
    if (!/^[1-9][0-9]*$/.test(service)) throw new Error('PURCHASE_SERVICE')
    const context = { checkoutServiceId: service, external_binding: { postalCode: recipient.postalCode, document: /^(?:[0-9]{11}|[0-9]{14})$/.test(recipient.document) ? recipient.document : '', name: recipient.name, email: recipient.email } }
    const selected = { id: 'existing', provider: { id: service } }
    const observed = inspectShipment(response, { remote_id: remoteId, context, selected })
    if (!observed.paid || observed.blocked) return { error: 'Essa etiqueta não está paga ou está cancelada/expirada. Confira a situação no Melhor Envio; nenhuma compra foi feita.' }
    const started = await db.rpc('serenity_legacy_label_start_v1', { p_old: oldId, p_intent: 'existing', p_actor: user.id })
    if (started.error) throw started.error
    const bound = await db.rpc('serenity_legacy_label_bind_v1', { p_order: started.data, p_remote: remoteId, p_context: context, p_selected: selected, p_price: remotePrice(response), p_actor: user.id })
    if (bound.error) throw bound.error
    const job = await db.from('serenity_legacy_label_jobs_v1').select('operation').eq('order_id', started.data).single()
    if (job.error || !job.data?.operation) throw new Error('LEGACY_LABEL_RESULT')
    const recorded = await db.rpc('serenity_legacy_label_purchase_observe_v1', { p_order: started.data, p_operation: job.data.operation, p_remote: remoteId, p_status: observed.status, p_paid: observed.paid, p_generated: observed.generated, p_blocked: observed.blocked, p_cents: observed.cents, p_actor: user.id })
    if (recorded.error) throw recorded.error
    revalidatePath('/admin/etiquetas'); revalidatePath('/admin/historico')
    return { error: '', id: started.data as string }
  } catch (error) { return { error: message(error) } }
}
