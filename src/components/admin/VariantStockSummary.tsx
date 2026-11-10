'use client'

import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { EditableProduct } from '@/lib/admin-product-editor'
import type { InventoryRow } from '@/lib/inventory'
import { inventoryQuantity } from '@/lib/inventory'

interface Props {
  variants: EditableProduct[]
  formRef: RefObject<HTMLFormElement>
  inventory?: InventoryRow
}

interface Summary {
  total: number
  missing: number
  available: number
  availableMissing: number
  active: number
  invalid: number
}

export default function VariantStockSummary({ variants, formRef, inventory }: Props) {
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    missing: 0,
    available: 0,
    availableMissing: 0,
    active: 0,
    invalid: 0,
  })

  useEffect(() => {
    const form = formRef.current
    if (!form) return

    function update() {
      const data = new FormData(form!)
      const result: Summary = {
        total: 0,
        missing: 0,
        available: 0,
        availableMissing: 0,
        active: 0,
        invalid: 0,
      }

      for (const variant of variants) {
        const prefix = `v.${variant.id}.`
        if (data.get(prefix + 'enabled') !== 'on') continue

        result.active++

        const raw = String(data.get(prefix + 'stock_quantity') || '').trim()
        const status = String(data.get(prefix + 'stock_status') || '')

        if (!raw) {
          result.missing++
          if (status === 'instock') result.availableMissing++
          continue
        }

        if (!/^\d+$/.test(raw) || Number(raw) > 100000000) {
          result.invalid++
          continue
        }

        const quantity = Number(raw)
        result.total += quantity

        if (status === 'instock') {
          result.available += Math.max(
            0,
            quantity - Number(inventory?.reserved_by_variant[String(variant.id)] || 0)
          )
        }
      }

      setSummary(result)
    }

    const onChange = (event: Event) => {
      const name = (event.target as HTMLInputElement)?.name || ''
      if (/^v\..*\.(stock_quantity|stock_status|enabled)$/.test(name)) update()
    }

    update()
    form.addEventListener('input', onChange)
    form.addEventListener('change', onChange)

    return () => {
      form.removeEventListener('input', onChange)
      form.removeEventListener('change', onChange)
    }
  }, [variants, formRef, inventory])

  return (
    <section
      aria-label="Estoque geral calculado"
      className="rounded-2xl border border-[#DDD1BF] bg-[#F8F4ED] p-4 sm:col-span-2"
    >
      <h3 className="text-sm font-medium">Estoque geral · automático</h3>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ['Cadastrado', summary.invalid ? 'Confira os campos' : inventoryQuantity(summary.total, summary.missing)],
          ['Reservado', String(inventory?.reserved || 0)],
          ['Disponível', summary.invalid ? 'Confira os campos' : inventoryQuantity(summary.available, summary.availableMissing)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-[11px] text-[#81796C]">{label}</p>
            <p className="mt-1 text-sm font-medium">{value}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-[#756B5D]">
        Preencha a quantidade somente nas variações abaixo.
        O total soma as {summary.active} variações habilitadas;
        o disponível considera a situação de estoque e as reservas
        carregadas ao abrir a página. Salve para aplicar as alterações.
      </p>

      {summary.missing > 0 && (
        <p className="mt-3 text-[11px] text-[#8A6532]">
          {summary.missing} variação(ões) sem quantidade definida.
          O total permanece parcial até preencher esses campos.
        </p>
      )}
    </section>
  )
}
