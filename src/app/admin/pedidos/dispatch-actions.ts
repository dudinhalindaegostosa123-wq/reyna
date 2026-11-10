'use server'

import { revalidatePath } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { saleUuid } from '@/lib/admin-sales'

interface DispatchResult {
  error: string
  dispatchedAt?: string
}

export async function confirmOrderDispatch(
  orderId: string,
  remoteId: string
): Promise<DispatchResult> {
  const { db, user } = await adminDatabase()

  if (!saleUuid(orderId) || !saleUuid(remoteId)) {
    return {
      error:
        'O pedido ou o vínculo da etiqueta está inválido. Atualize a página.',
    }
  }

  try {
    const { data, error } = await db.rpc(
      'serenity_admin_confirm_dispatch',
      {
        p_order: orderId,
        p_remote: remoteId,
        p_actor: user.id,
      }
    )

    if (error) {
      const messages: Record<string, string> = {
        DISPATCH_INVALID:
          'Não foi possível validar a confirmação. Atualize a página.',

        DISPATCH_ORDER:
          'O pedido não foi encontrado.',

        DISPATCH_PAYMENT:
          'O pedido precisa estar pago para confirmar a postagem.',

        DISPATCH_LINK:
          'O vínculo do envio mudou ou está inválido. Atualize a página e confira a etiqueta.',

        DISPATCH_LABEL:
          'A etiqueta precisa estar paga e gerada antes de confirmar a postagem.',

        DISPATCH_BLOCKED:
          'A etiqueta está cancelada ou expirada. Confira o envio antes de continuar.',
      }

      return {
        error:
          messages[error.message] ||
          'Não foi possível confirmar a postagem. Atualize a página e confira o registro antes de tentar novamente.',
      }
    }

    if (
      typeof data !== 'string' ||
      !Number.isFinite(Date.parse(data))
    ) {
      return {
        error:
          'Não foi possível verificar o resultado. Atualize a página antes de tentar novamente.',
      }
    }

    if (process.env.SERENITY_EMAIL_ENABLED === 'true' && process.env.VERCEL_ENV === 'production') {
      try {
        const { safeDrainOrderEmails } = await import('@/lib/order-email-server')
        await safeDrainOrderEmails(db, orderId)
      } catch { console.error('[order-email]', { code: 'EMAIL_WORKER_FAILED' }) }
    }
    revalidatePath('/admin/pedidos')
    revalidatePath(`/admin/pedidos/${orderId}`)
    revalidatePath('/admin/operacao')

    return {
      error: '',
      dispatchedAt: data,
    }
  } catch {
    return {
      error:
        'A conexão falhou ou o resultado não pôde ser confirmado. Atualize a página e confira o registro antes de tentar novamente.',
    }
  }
}
