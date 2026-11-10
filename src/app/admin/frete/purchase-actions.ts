'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { scopedLabelDatabase } from '@/lib/label-scope-server'
import type { LabelScope } from '@/lib/label-scope'
import { adminDatabase } from '@/lib/admin-auth'
import { saleUuid } from '@/lib/admin-sales'
import {
  labelShipmentRequest,
  observeShipment,
  privatePrintUrl,
  purchaseError,
  purchaseSource,
  purchaseView,
} from '@/lib/label-purchase-server'
import type { LabelPurchaseView } from '@/lib/label-purchase'
import type { SupabaseClient } from '@supabase/supabase-js'

type Result = {
  error: string
  message?: string
  view?: LabelPurchaseView
  url?: string
}

async function note(
  db: SupabaseClient,
  id: string,
  operation: string,
  actor: string,
  value: string
) {
  await db.rpc('serenity_label_purchase_note', {
    p_order: id,
    p_operation: operation,
    p_note: value,
    p_actor: actor,
  })
}

async function generate(
  db: SupabaseClient,
  id: string,
  actor: string,
  contact: string
) {
  const source = await observeShipment(db, id, actor, contact)

  if (source.remote.generated) return

  if (!source.remote.paid || source.remote.blocked) {
    throw new Error('PURCHASE_ORDER')
  }

  const { error } = await db.rpc(
    'serenity_label_purchase_claim',
    {
      p_order: id,
      p_operation: source.job.operation,
      p_step: 'generate',
      p_review: null,
      p_actor: actor,
    }
  )

  if (error) throw error

  try {
    await labelShipmentRequest(
      'generate',
      source.job.remote_id,
      contact
    )

    const next = await observeShipment(db, id, actor, contact)

    if (!next.remote.generated) {
      await note(
        db, id, source.job.operation,
        actor, 'generation_waiting'
      )
    }
  } catch (error) {
    await note(
      db, id, source.job.operation,
      actor, 'generation_unknown'
    )
    throw error
  }
}

export async function labelPurchaseAction(
  id: string,
  command: 'load' | 'check' | 'buy' | 'generate' | 'print',
  reviewId = '',
  scope: LabelScope = 'current'
): Promise<Result> {
  const { db: rawDb, user } = await adminDatabase()
  const db = scopedLabelDatabase(rawDb, scope)

  if (
    !saleUuid(id) ||
    !['load', 'check', 'buy', 'generate', 'print'].includes(command)
  ) {
    return { error: 'Operação inválida.' }
  }

  try {
    if (command === 'load') {
      return { error: '', view: await purchaseView(db, id) }
    }

    if (command === 'check') {
      const source = await observeShipment(
        db, id, user.id, user.email || ''
      )

      const current = await purchaseView(db, id)

      if (
        !source.remote.paid &&
        !source.remote.blocked &&
        ['empty', 'review'].includes(current.phase) &&
        !source.issues.length
      ) {
        if (source.remote.cents === null) {
          return {
            error: 'O Melhor Envio não retornou um custo válido. Confira o envio na sua conta.',
            view: current,
          }
        }

        const { error } = await db.rpc(
          'serenity_label_purchase_review',
          {
            p_order: id,
            p_operation: source.job.operation,
            p_remote: source.job.remote_id,
            p_review: randomUUID(),
            p_cents: source.remote.cents,
            p_version: source.order.updated_at,
            p_actor: user.id,
          }
        )

        if (error) throw error
      }
    } else if (command === 'buy') {
      if (!saleUuid(reviewId)) {
        throw new Error('PURCHASE_STALE')
      }

      const source = await purchaseSource(db, id)

      if (source.issues.length) {
        return {
          error: source.issues.join(' '),
          view: await purchaseView(db, id),
        }
      }

      const p = source.purchase

      if (
        !p ||
        p.phase !== 'review' ||
        p.review_id !== reviewId ||
        Date.parse(p.review_expires) <= Date.now()
      ) {
        throw new Error('PURCHASE_STALE')
      }

      const fresh = await observeShipment(
        db, id, user.id, user.email || ''
      )

      if (fresh.remote.blocked) {
        return {
          error: 'O envio foi cancelado ou expirou no Melhor Envio.',
          view: await purchaseView(db, id),
        }
      }

      if (fresh.remote.paid) {
        return {
          error: '',
          message: 'A compra já estava confirmada no Melhor Envio.',
          view: await purchaseView(db, id),
        }
      }

      if (fresh.remote.cents !== Number(p.review_cents)) {
        return {
          error: 'O custo mudou. Atualize a situação para conferir o novo valor antes de comprar.',
          view: await purchaseView(db, id),
        }
      }

      const { error } = await db.rpc(
        'serenity_label_purchase_claim',
        {
          p_order: id,
          p_operation: source.job.operation,
          p_step: 'buy',
          p_review: reviewId,
          p_actor: user.id,
        }
      )

      if (error) throw error

      try {
        await labelShipmentRequest(
          'buy',
          source.job.remote_id,
          user.email || ''
        )

        const result = await observeShipment(
          db, id, user.id, user.email || ''
        )

        if (!result.remote.paid) {
          await note(
            db, id, source.job.operation,
            user.id, 'purchase_unknown'
          )

          return {
            error: 'O pagamento da etiqueta ainda não foi confirmado. Atualize a situação; a compra não será repetida automaticamente.',
            view: await purchaseView(db, id),
          }
        }
      } catch (error) {
        await note(
          db, id, source.job.operation,
          user.id, 'purchase_unknown'
        )
        throw error
      }

      await generate(db, id, user.id, user.email || '')
    } else if (command === 'generate') {
      await generate(db, id, user.id, user.email || '')
    } else if (command === 'print') {
      const source = await observeShipment(
        db, id, user.id, user.email || ''
      )

      if (!source.remote.generated || source.remote.blocked) {
        return {
          error: 'Aguarde a confirmação de geração da etiqueta.',
          view: await purchaseView(db, id),
        }
      }

      const response = await labelShipmentRequest(
        'print',
        source.job.remote_id,
        user.email || ''
      )

      return {
        error: '',
        url: privatePrintUrl(response),
        view: await purchaseView(db, id),
      }
    }

    revalidatePath('/admin/etiquetas')
    revalidatePath('/admin/pedidos/' + id)

    return {
      error: '',
      message: 'Situação do envio atualizada.',
      view: await purchaseView(db, id),
    }
  } catch (error) {
    revalidatePath('/admin/etiquetas')
    revalidatePath('/admin/pedidos/' + id)

    let view: LabelPurchaseView | undefined

    try {
      view = await purchaseView(db, id)
    } catch {}

    return {
      error: purchaseError(error),
      view,
    }
  }
}
