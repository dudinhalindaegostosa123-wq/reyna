'use server'

import { revalidatePath } from 'next/cache'
import { scopedLabelDatabase } from '@/lib/label-scope-server'
import type { LabelScope } from '@/lib/label-scope'
import { adminDatabase } from '@/lib/admin-auth'
import { saleUuid } from '@/lib/admin-sales'
import {
  purchaseSource,
  purchaseError,
} from '@/lib/label-purchase-server'
import type { LabelPurchaseView } from '@/lib/label-purchase'
import { loadQuickLabel } from './quick-label-actions'
import { labelJobAction } from './cart-actions'
import { labelPurchaseAction } from './purchase-actions'

export async function bulkLabelPurchaseAction(
  orderId: string,
  command: 'check' | 'buy',
  reviewId = '',
  expectedCents?: number,
  scope: LabelScope = 'current'
): Promise<{
  error: string
  message?: string
  view?: LabelPurchaseView
}> {
  const { db: rawDb } = await adminDatabase()
  const db = scopedLabelDatabase(rawDb, scope)

  if (
    !saleUuid(orderId) ||
    !['check', 'buy'].includes(command)
  ) {
    return { error: 'Operação inválida.' }
  }

  try {
    const job = await db
      .from('serenity_label_jobs')
      .select('state')
      .eq('order_id', orderId)
      .maybeSingle()

    if (job.error) throw job.error

    if (command === 'check' && (!job.data || ['empty','quoted','rejected'].includes(job.data.state))) {
      const loaded = await loadQuickLabel(orderId,scope)
      if (loaded.error || !loaded.job) return {error:loaded.error || 'Não foi possível carregar o envio.'}
      const view = loaded.job
      if (view.state !== 'prepared') {
        if (view.issues.length) return {error:view.issues.join(' ')}
        if (view.state !== 'quoted' || view.stale || view.choices.length !== 1) return {error:'Abra Preparar etiqueta para selecionar a transportadora ou resolver a pendência deste envio.'}
        const data = new FormData()
        data.set('operation',view.operation)
        data.set('selected',view.choices[0].id)
        const prepared = await labelJobAction(orderId,'prepare',data,scope)
        if (prepared.error || prepared.view?.state !== 'prepared') return {error:prepared.error || 'A preparação ainda não foi confirmada. Confira o envio antes de repetir.'}
      }
      return await labelPurchaseAction(orderId,'check','',scope)
    }

    if (job.data?.state !== 'prepared') {
      return {
        error:
          'Abra o pedido e prepare o envio antes de conferir a compra da etiqueta.',
      }
    }

    if (command === 'buy') {
      if (
        !saleUuid(reviewId) ||
        !Number.isSafeInteger(expectedCents) ||
        expectedCents! < 0
      ) {
        return {
          error:
            'Confira novamente as etiquetas e os valores antes de comprar.',
        }
      }

      const source = await purchaseSource(db, orderId)
      const purchase = source.purchase

      const expires = Date.parse(
        String(purchase?.review_expires || '')
      )

      if (source.issues.length) {
        return {
          error: source.issues.join(' '),
        }
      }

      if (
        !purchase ||
        purchase.phase !== 'review' ||
        purchase.review_id !== reviewId ||
        purchase.review_cents == null ||
        Number(purchase.review_cents) !== expectedCents ||
        !Number.isFinite(expires) ||
        expires <= Date.now() ||
        String(purchase.operation || '') !==
          String(source.job.operation || '') ||
        String(purchase.remote_id || '').toLowerCase() !==
          String(source.job.remote_id || '').toLowerCase()
      ) {
        return {
          error:
            'O custo, o vínculo ou a conferência mudou. Confira novamente antes de comprar.',
        }
      }
    }

    return await labelPurchaseAction(
      orderId,
      command,
      reviewId,
      scope
    )
  } catch (error) {
    return {
      error: purchaseError(error),
    }
  } finally {
    revalidatePath('/admin/etiquetas')
    revalidatePath('/admin/operacao')
    revalidatePath('/admin/pedidos/' + orderId)
  }
}
