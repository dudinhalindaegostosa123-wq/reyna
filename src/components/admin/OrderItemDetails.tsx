import type { OrderItem } from '@/lib/admin-sales'
import { saleMoney } from '@/lib/admin-sales'
import { orderItemOptions } from '@/lib/order-item-options'

/** Usa o retrato da compra, nunca as opções do catálogo atual. */
export default function OrderItemDetails({ item, index }: { item: OrderItem; index: number }) {
  const options = orderItemOptions(item).flatMap(value => value.split(/\s+·\s+/)).filter(Boolean)
  const stem = item.stem_length_mm ? `${item.stem_length_mm} mm` : options.find(value => /haste/i.test(value))?.replace(/^[^:]+:\s*/, '')
  const sterilization = typeof item.sterilized === 'boolean'
    ? item.sterilized ? item.sterilization_fee && item.sterilization_fee > 0 ? `Sim — ${saleMoney(item.sterilization_fee)} por peça` : 'Sim — solicitada' : 'Não solicitada'
    : options.find(value => /esteriliza/i.test(value))?.replace(/^[^:]+:\s*/, '') || 'Não informado na compra'
  const variation = options.filter(value => !/^(?:Haste(?: incluída| \([^)]*\))?|Esterilização solicitada)\s*:/i.test(value))
  const fields = [
    ['Haste / medida', stem ? `${stem}${item.stem_fee ? ` · ${saleMoney(item.stem_fee)} por peça` : ''}` : 'Não informado na compra'],
    ['Anodização', item.anodization ? `${item.anodization}${item.voltage ? ` · ${item.voltage} V` : ''}${item.anodization_fee > 0 ? ` · ${saleMoney(item.anodization_fee)} por unidade` : ' · sem custo adicional'}` : 'Não solicitada'],
    ['Esterilização solicitada', sterilization],
  ]
  return <article className="py-5">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0"><p className="mb-1 text-[11px] text-[#81796C]">Peça {index + 1}{item.sku ? ` · Código: ${item.sku}` : ''}</p><h3 className="break-words text-sm font-medium">{item.name}</h3></div>
      <span className="shrink-0 text-sm font-medium">{saleMoney(item.quantity * item.unit_price)}</span>
    </div>
    {variation.length > 0 && <p className="mt-2 break-words text-xs leading-6 text-[#625B51]">{variation.join(' · ')}</p>}
    <dl className="mt-3 grid gap-2 rounded-xl bg-[#F8F6F2] p-3 text-xs sm:grid-cols-3">{fields.map(([label, value]) => <div key={label}><dt className="text-[#81796C]">{label}</dt><dd className="mt-1 break-words font-medium leading-5">{value}</dd></div>)}</dl>
    <p className="mt-3 text-xs text-[#625B51]">Quantidade: <strong>{item.quantity}</strong> · Valor unitário: {saleMoney(item.unit_price)}</p>
  </article>
}
