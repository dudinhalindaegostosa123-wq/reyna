import CustomerShipmentStatus from './CustomerShipmentStatus'
import Link from 'next/link'
import { orderItemOptions } from '@/lib/order-item-options'
import { legacyOrderAddresses, legacyPurchaseDate } from '@/lib/legacy-order-display'
import { redirect } from 'next/navigation'
import { customerAuth } from '@/lib/customer-auth'

const money = (value: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)
export default async function LegacyHistory({ page = 1, userId, primary = false }: { page?: number; userId: string; primary?: boolean }) {
  const auth = customerAuth()
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null
  const heading = primary ? 'Meus pedidos' : 'Mais pedidos'
  const empty = <section id="pedidos" className="mt-7 rounded-3xl border border-store-border bg-store-surface p-6 sm:p-8"><h2 className="text-lg font-medium">Meus pedidos</h2><p className="mt-4 text-sm text-store-muted">Suas compras aparecerão aqui.</p><Link href="/categoria/todos" className="mt-3 inline-flex min-h-[44px] items-center text-xs underline underline-offset-4">Explorar joias →</Link></section>
  const linked = await auth.rpc('serenity_legacy_link_my_history_v1')
  if (linked.error) return primary ? <section id="pedidos" className="mt-7 rounded-3xl border border-store-border p-6"><h2 className="text-lg font-medium">Meus pedidos</h2><p className="mt-3 text-sm">Não foi possível consultar todos os pedidos. Atualize a página para tentar novamente.</p></section> : null
  const current = Number.isSafeInteger(page) && page > 0 ? Math.min(page,100000) : 1
  const orders = await auth.from('serenity_legacy_orders_v1').select('old_id,original_status,created_at,total,payload', { count: 'exact' })
    .eq('account_user_id', userId).eq('visible',true).eq('kind','shop_order')
    .order('created_at',{ascending:false}).order('old_id',{ascending:false}).range((current-1)*10,current*10-1)
  if (orders.error) return <section id="historico-antigo" className="mt-7 rounded-3xl border border-store-border p-6"><h2 className="text-lg font-medium">{heading}</h2><p className="mt-3 text-sm">Não foi possível carregar seus pedidos agora. Tente novamente mais tarde.</p></section>
  if (!orders.count) return primary ? empty : null
  const ids = (orders.data || []).map(order=>order.old_id)
  const [lines, tracking] = await Promise.all([
    auth.from('serenity_legacy_items_v1').select('order_id,kind,name,payload').in('order_id',ids).order('old_id',{ascending:true}),
    auth.rpc('serenity_legacy_tracking_my_v1', { p_orders: ids }),
  ])
  const shipments: { legacy_id: number; carrier_status: string; tracking_code?: string | null }[] = !tracking.error && Array.isArray(tracking.data) ? tracking.data : []
  const pages = Math.max(1,Math.ceil(orders.count/10))
  if (current > pages) redirect(`/minha-conta?historico=${pages}#historico-antigo`)
  return <section id="historico-antigo" className="mt-7 scroll-mt-6 overflow-hidden rounded-3xl border border-store-border bg-store-surface">
    {primary && <span id="pedidos" className="block scroll-mt-6" />}
    <div className="flex items-center justify-between gap-3 border-b border-store-border p-6 sm:p-8"><h2 className="text-lg font-medium">{heading}</h2><span className="text-xs text-store-muted">{orders.count} {orders.count === 1 ? 'pedido' : 'pedidos'}</span></div>
    <div className="divide-y divide-store-border">{orders.data?.map(order=>{
      const shipment=shipments.find(value=>String(value.legacy_id)===String(order.old_id))
      const address=legacyOrderAddresses(order.payload).find(value=>value.title==='Endereço de entrega')
      return <article key={order.old_id} className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">Pedido #{order.old_id}</h3><span className="text-sm">{money(order.total)}</span></div>
        <p className="mt-1 text-[11px] text-store-muted">{legacyPurchaseDate(order.created_at)}</p>
        <CustomerShipmentStatus status={order.original_status} carrier={shipment?.carrier_status} trackingCode={shipment?.tracking_code} />
        <details className="mt-4 border-t border-store-border">
          <summary className="min-h-[44px] cursor-pointer py-3 text-xs text-store-muted underline underline-offset-4">Ver detalhes da compra</summary>
          {lines.error ? <p className="mt-2 text-xs">Não foi possível carregar as peças agora.</p> : <ul className="space-y-3 text-xs leading-6">{lines.data?.filter(line=>String(line.order_id)===String(order.old_id)&&line.kind==='line_item').map((line,index)=><li key={index}><p>{line.payload?.quantidade || '—'} × {line.name}</p><p className="text-store-muted">{money(line.payload?.total)}</p>{orderItemOptions(line.payload).map((option,optionIndex)=><p key={optionIndex} className="text-store-muted">{option}</p>)}</li>)}</ul>}
          {address?.lines.length ? <div className="mt-5 border-t border-store-border pt-4"><h4 className="text-xs font-medium">Endereço de entrega</h4><address className="mt-2 text-xs not-italic leading-6 text-store-muted">{address.lines.filter(value=>value!=='BR').map((line,index)=><p key={index}>{line}</p>)}</address></div> : null}
          {Array.isArray(order.payload?.refunds) && order.payload.refunds.map((refund: { old_id: number; total: number })=><p key={refund.old_id} className="mt-3 text-xs">Reembolso registrado: {money(Math.abs(Number(refund.total)))}</p>)}
        </details>
      </article>
    })}</div>
    {pages>1 && <nav aria-label="Páginas dos pedidos" className="flex flex-wrap items-center gap-5 border-t border-store-border px-6 py-4 text-xs">{current>1 && <Link href={`/minha-conta?historico=${current-1}#historico-antigo`} className="inline-flex min-h-[44px] items-center underline">← Anterior</Link>}<span>Página {current} de {pages}</span>{current<pages && <Link href={`/minha-conta?historico=${current+1}#historico-antigo`} className="inline-flex min-h-[44px] items-center underline">Próxima →</Link>}</nav>}
  </section>
}
