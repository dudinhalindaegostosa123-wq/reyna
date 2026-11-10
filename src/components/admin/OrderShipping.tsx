import { saleMoney } from '@/lib/admin-sales'

export default function OrderShipping({ details }: { details: unknown }) {
  if (!details || typeof details !== 'object') return null
  const d = details as {
    manual?: boolean
    company?: string
    service?: string
    days?: number | null
    preparation_days?: number
    amount_cents?: number
    volume?: { weight?: number; height?: number; width?: number; length?: number }
  }

  return (
    <section className="mb-5 rounded-2xl border border-[#DED4C5] bg-white p-4">
      <h2 className="text-sm font-medium">Entrega escolhida no checkout</h2>
      {d.manual ? (
        <p className="mt-2 text-sm">Frete a confirmar com a equipe. A entrega ainda não está incluída no total.</p>
      ) : (
        <>
          <p className="mt-2 text-sm">{d.company} · {d.service} · {saleMoney(Number(d.amount_cents || 0) / 100)}</p>
          <p className="mt-2 text-xs text-[#756B5D]">{d.days == null ? 'Prazo a confirmar' : `${d.days} dia(s) estimado(s) ${typeof d.preparation_days === 'number' ? 'para entrega após a confirmação do pagamento.' : 'de transporte após a postagem.'}`}</p>
        </>
      )}
      {d.volume && (
        <p className="mt-2 text-xs text-[#756B5D]">
          Pacote cotado: {d.volume.height} × {d.volume.width} × {d.volume.length} cm · {d.volume.weight} kg
        </p>
      )}
      <p className="mt-2 text-xs text-[#756B5D]">
        Cotação registrada no pedido. A etiqueta ainda precisa ser contratada e o rastreio será vinculado na próxima etapa.
      </p>
    </section>
  )
}
