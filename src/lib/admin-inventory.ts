import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { InventoryRow } from '@/lib/inventory'

export async function getAdminInventory(
  db: SupabaseClient,
  ids: string[]
): Promise<Map<string, InventoryRow>> {
  if (!ids.length) return new Map()

  const { data, error } = await db
    .from('serenity_admin_inventory')
    .select('*')
    .in('product_id', ids)

  if (error) {
    // A instalação inicial da vitrine ainda não inclui esta visão administrativa.
    if (['PGRST205', '42P01'].includes(error.code)) {
      throw new Error('ADMIN_INVENTORY_NOT_INSTALLED')
    }
    throw Object.assign(new Error('ADMIN_INVENTORY_QUERY'), { code: error.code })
  }

  return new Map(
    (data || []).map(row => [String(row.product_id), row as InventoryRow])
  )
}
