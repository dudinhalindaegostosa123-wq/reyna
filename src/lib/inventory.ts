export interface InventoryRow {
  product_id: string
  product_type: string
  variant_count: number
  untracked: number
  known_total: number
  reserved: number
  available_untracked: number
  available_known: number
  reserved_by_variant: Record<string, number>
}

export function inventoryQuantity(known: number, missing: number): string {
  if (missing > 0) {
    return known > 0
      ? `${Number(known).toLocaleString('pt-BR')} + não definido`
      : 'Não definido'
  }

  return Number(known).toLocaleString('pt-BR')
}
