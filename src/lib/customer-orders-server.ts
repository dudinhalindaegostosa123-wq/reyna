import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CustomerOrderRow {
  id: string
  number: number | string
  status: string
  created_at: string
  total: number | string
  workflow_stage: string
  shipping_pending: boolean
  shipping_details: unknown
}

export async function loadCustomerOrders(db: SupabaseClient, userId: string, page: number, size: number) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(userId)) {
    throw new Error('CUSTOMER_ACCOUNT_ID')
  }

  // A propriedade do pedido vem da tabela original. A view de andamento
  // não possui account_user_id em todas as instalações do banco.
  const result = await db.from('serenity_orders')
    .select('id,number,status,created_at,total,shipping_pending,shipping_details', { count: 'exact' })
    .eq('account_user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range((page - 1) * size, page * size - 1)

  const orders = (result.data || []) as Omit<CustomerOrderRow, 'workflow_stage'>[]
  if (result.error || !orders.length) return { ...result, data: [] as CustomerOrderRow[] }

  // Consulta exclusivamente os IDs já autorizados para esta conta.
  const workflow = await db.from('serenity_admin_order_workflow')
    .select('id,workflow_stage')
    .in('id', orders.map(order => order.id))
  const stages = new Map<string, string>()
  if (!workflow.error) {
    for (const row of workflow.data || []) {
      if (typeof row.id === 'string' && typeof row.workflow_stage === 'string') {
        stages.set(row.id, row.workflow_stage)
      }
    }
  }

  // Uma falha no andamento não deve esconder um pedido pago.
  return { ...result, data: orders.map(order => ({ ...order, workflow_stage: stages.get(order.id) || '' })) }
}
