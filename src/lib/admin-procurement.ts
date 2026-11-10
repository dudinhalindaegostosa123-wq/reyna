import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export const PROCUREMENT_TABS = [
  { value: 'comprar', label: 'A comprar' },
  { value: 'receber', label: 'A receber' },
  { value: 'recebidos', label: 'Recebidos' },
  {
    value: 'conferir',
    label: 'Conferir anteriores e pendências',
  },
] as const

export type ProcurementTab =
  typeof PROCUREMENT_TABS[number]['value']

export interface ProcurementReference {
  order_id: string
  order_number: number
  line_number: number
  signature: string
  quantity: number
  ordered: number
  received: number
  version: number
}

export interface ProcurementLine extends ProcurementReference {
  order_status: string
  product_name: string
  variation: string
  sku: string
  supplier: string
  anodization: string
  voltage: string
  review_reason: string
}

export interface ProcurementGroup {
  group_id: string
  product_name: string
  variation: string
  sku: string
  supplier: string
  anodization: string
  voltage: string
  quantity: number | string
  ordered: number | string
  received: number | string
  to_order: number | string
  to_receive: number | string
  orders?: ProcurementReference[]
}

export const GROUP_FIELDS =
  'group_id,product_name,variation,sku,supplier,anodization,voltage,quantity,ordered,received,to_order,to_receive'

const LINE_FIELDS =
  'order_id,order_number,order_status,line_number,signature,product_name,variation,sku,supplier,anodization,voltage,quantity,ordered,received,version,review_reason'

export function procurementTab(
  value: string
): ProcurementTab {
  return PROCUREMENT_TABS.find(
    tab => tab.value === value
  )?.value || 'comprar'
}

export function procurementSearch(value: string): string {
  return value
    .slice(0, 80)
    .replace(/[^a-zA-Z0-9À-ÿ .-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function procurementHref(
  tab: ProcurementTab,
  search = '',
  page = 1,
  group = '',
  itemPage = 1
): string {
  const params = new URLSearchParams({ aba: tab })

  if (search) params.set('q', search)
  if (page > 1) params.set('page', String(page))
  if (group) params.set('grupo', group)
  if (group && itemPage > 1) {
    params.set('itens', String(itemPage))
  }

  return '/admin/compras?' + params.toString()
}

export function procurementQuery(
  db: SupabaseClient,
  tab: ProcurementTab,
  search: string,
  head = false
) {
  const reviewing = tab === 'conferir'

  let query = db
    .from(
      reviewing
        ? 'serenity_admin_procurement_lines_v1'
        : 'serenity_admin_procurement_summary_v1'
    )
    .select(
      head
        ? reviewing
          ? 'order_id'
          : 'group_id'
        : reviewing
          ? LINE_FIELDS
          : GROUP_FIELDS,
      { count: 'exact', head }
    )

  if (reviewing) {
    query = query.neq('review_reason', '')
  } else if (tab === 'comprar') {
    query = query.gt('to_order', 0)
  } else if (tab === 'receber') {
    query = query.gt('to_receive', 0)
  } else {
    query = query
      .eq('to_order', 0)
      .eq('to_receive', 0)
      .gt('received', 0)
  }

  if (search) {
    query = query.or(
      `product_name.ilike.*${search}*,sku.ilike.*${search}*,supplier.ilike.*${search}*`
    )
  }

  return query
}
