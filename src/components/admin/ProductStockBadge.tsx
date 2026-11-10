import { inventoryQuantity } from '@/lib/inventory'
import type { InventoryRow } from '@/lib/inventory'

export default function ProductStockBadge({row}:{row?:InventoryRow}) {
  if (!row) return <p className="text-xs text-[#81796C]">Não disponível</p>

  return (
    <div className="space-y-1 text-[11px] text-[#756B5D]">
      <p>
        <span className="font-medium text-[#292621]">Cadastrado:</span>{' '}
        {inventoryQuantity(row.known_total, row.untracked)}
      </p>
      <p>Reservado: {Number(row.reserved).toLocaleString('pt-BR')}</p>
      <p>
        <span className="font-medium text-[#292621]">Disponível:</span>{' '}
        {inventoryQuantity(row.available_known, row.available_untracked)}
      </p>
      {row.product_type === 'variable' && (
        <p className="text-[10px] text-[#947B57]">
          {row.variant_count} variações ativas
          {row.untracked > 0 ? ` · ${row.untracked} sem quantidade` : ''}
        </p>
      )}
    </div>
  )
}
