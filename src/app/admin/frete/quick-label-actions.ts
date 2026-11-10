'use server'

import { scopedLabelDatabase } from '@/lib/label-scope-server'
import type { LabelScope } from '@/lib/label-scope'
import { adminDatabase } from '@/lib/admin-auth'
import { saleUuid } from '@/lib/admin-sales'
import { loadLabelPreparation } from '@/lib/label-draft-server'
import { loadLabelJobView, quoteLabel } from '@/lib/label-cart-server'

export async function loadQuickLabel(id: string, scope: LabelScope = 'current') {
  const { db: rawDb, user } = await adminDatabase()
  const db = scopedLabelDatabase(rawDb, scope)
  if (!saleUuid(id)) return { error: 'Pedido inválido.' }
  try {
    const order = await db.from('serenity_orders').select('*').eq('id', id).single()
    if (order.error || !order.data) throw new Error('ORDER_QUERY')
    if (order.data.status !== 'paid') return { error: 'Este pedido precisa estar pago para preparar o envio.' }
    let [draft, job] = await Promise.all([
      loadLabelPreparation(db, order.data), loadLabelJobView(db, id),
    ])
    // Reading the saved shipment needs no manual address confirmation. Renew an
    // existing draft only through its version-checked RPC; never touch a locked job.
    const locked = ['creating','prepared','uncertain'].includes(job.state)
    if (!locked && user && draft.orderVersion && draft.senderVersion && draft.issues.some(issue => issue.includes('após este rascunho'))) {
      const saved = await db.rpc('serenity_label_save_draft', {
        p_order:id,p_fields:draft.fields,p_version:draft.version,
        p_order_version:draft.orderVersion,p_sender_version:draft.senderVersion,p_actor:user.id,
      })
      if (saved.error) throw saved.error
      draft = await loadLabelPreparation(db,order.data)
      job = await loadLabelJobView(db,id)
    }
    let automaticError = ''
    const needsNewQuote = (issue: string) => issue.includes('CEP do destinatário está diferente do cotado') || issue.includes('pacote foi alterado em relação à cotação')
    const quoteIssues = draft.issues.filter(issue => !needsNewQuote(issue))
    if (!locked && user?.email && !quoteIssues.length && !job.issues.length &&
      (draft.issues.some(needsNewQuote) || job.stale || job.state === 'empty' || job.state === 'rejected' || (job.state === 'quoted' && Date.parse(job.expires) <= Date.now()))) {
      try {
        await quoteLabel(db,id,user.id,user.email,{agency:job.agency || '',cnae:job.cnae || ''})
        job = await loadLabelJobView(db,id)
        draft = {...draft,issues:quoteIssues}
      } catch { automaticError = 'Não foi possível consultar o frete automaticamente. Tente atualizar o custo abaixo.' }
    }
    return { error: '', draft, job, automaticError }
  } catch {
    return { error: 'Não foi possível carregar o envio. Tente novamente ou abra os detalhes do pedido.' }
  }
}
