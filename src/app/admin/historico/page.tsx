import LegacyTrackingStatus from '@/components/account/LegacyTrackingStatus'
import { legacySearch, legacySearchFilter, legacyHistoryHref } from '@/lib/legacy-history-search'
import LegacyLabelStart from '@/components/admin/LegacyLabelStart'
import LegacyOrderAddresses from '@/components/account/LegacyOrderAddresses'
import { legacyPurchaseDate } from '@/lib/legacy-order-display'
import { orderItemOptions } from '@/lib/order-item-options'
import ImportDocuments from './ImportDocuments'
import ImportContacts from './ImportContacts'
import ImportItemOptions from './ImportItemOptions'
import ImportLegacyForm from './ImportLegacyForm'
import Link from 'next/link'
import { adminDatabase } from '@/lib/admin-auth'
import { legacyStatus } from '@/lib/legacy-history-server'
export const dynamic='force-dynamic'
export const maxDuration=60
const money=(value:unknown)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0)
export default async function LegacyAdmin({searchParams={}}:{searchParams?:{page?:string;pedido?:string;clientes?:string;q?:string}}) {
  const {db}=await adminDatabase()
  const page=Math.min(100000,Math.max(1,Number.isSafeInteger(Number(searchParams.page))?Number(searchParams.page):1))
  const selected=/^[1-9][0-9]{0,14}$/.test(searchParams.pedido || '')?searchParams.pedido:null
  const showCustomers=searchParams.clientes==='1'
  const search=legacySearch(searchParams.q)
  const href=(nextPage=page,order='')=>legacyHistoryHref({search,customers:showCustomers,page:nextPage,order})
  let customerQuery=db.from('serenity_legacy_customers_v1').select('old_id,email,name,phone',{count:'exact'})
  let orderQuery=db.from('serenity_legacy_orders_v1').select('old_id,total,original_status,needs_review,account_user_id,payload,created_at',{count:'exact'}).eq('visible',true).eq('kind','shop_order')
  if(search) {customerQuery=customerQuery.or(legacySearchFilter(search,true));orderQuery=orderQuery.or(legacySearchFilter(search))}

  const [manifest,customers,orders,detail,items,refunds,shipment]=await Promise.all([
    db.from('serenity_legacy_imports_v1').select('summary,imported_at').eq('id','serenity-woocommerce-hpos-v1').maybeSingle(),
    showCustomers?customerQuery.order('old_id').range((page-1)*25,page*25-1):Promise.resolve({data:[],error:null,count:0}),
    !showCustomers?orderQuery.order('created_at',{ascending:false}).order('old_id',{ascending:false}).range((page-1)*25,page*25-1):Promise.resolve({data:[],error:null,count:0}),
    selected?db.from('serenity_legacy_orders_v1').select('*').eq('old_id',selected).maybeSingle():Promise.resolve({data:null,error:null}),
    selected?db.from('serenity_legacy_items_v1').select('old_id,name,kind,payload').eq('order_id',selected).order('old_id'):Promise.resolve({data:[],error:null}),
    selected?db.from('serenity_legacy_orders_v1').select('old_id,total,original_status').eq('parent_id',selected).eq('kind','shop_order_refund'):Promise.resolve({data:[],error:null}),
    selected?db.from('serenity_legacy_shipping_orders_v1').select('id,intent').eq('legacy_id',selected).maybeSingle():Promise.resolve({data:null,error:null}),
  ])
  const shipmentJob=shipment.data?.id?await db.from('serenity_legacy_label_jobs_v1').select('state').eq('order_id',shipment.data.id).maybeSingle():{data:null,error:null}
  const shipmentTracking=shipment.data?.id?await db.from('serenity_legacy_shipment_tracking_v1').select('carrier_status,tracking_code,last_checked_at').eq('order_id',shipment.data.id).maybeSingle():{data:null,error:null}
  const installed=!manifest.error && manifest.data
  const count=(showCustomers?customers.count:orders.count) || 0
  const pages=Math.max(1,Math.ceil(count/25))
  return <main className="mx-auto max-w-6xl space-y-6 px-5 py-10"><h1 className="text-3xl">Histórico do site antigo</h1><p className="max-w-3xl text-sm leading-7">Arquivo anterior à migração. Os registros preservam os valores e situações originais e não entram no faturamento, estoque, compras de fornecedor ou notificações do site novo.</p>
    {!installed?<p className="rounded-xl border bg-white p-5 text-sm">Importação ainda não instalada ou indisponível. Execute o SQL da estrutura e envie os CSVs abaixo.</p>:<p className="rounded-xl border bg-white p-5 text-sm">{manifest.data?.summary?.customers} clientes · {manifest.data?.summary?.orders} pedidos · {manifest.data?.summary?.refunds} registros de estorno · {manifest.data?.summary?.needs_review} vínculo(s) para conferir</p>}
    {!installed && <ImportLegacyForm />}
    {installed && <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer py-2 text-xs font-medium">Importação e complementos do histórico</summary><div className="mt-3 space-y-3"><ImportItemOptions /><ImportDocuments /><ImportContacts /></div></details>}
    <nav className="flex gap-5 text-sm"><Link href={legacyHistoryHref({search})} aria-current={!showCustomers?'page':undefined} className="underline">Pedidos antigos</Link><Link href={legacyHistoryHref({search,customers:true})} aria-current={showCustomers?'page':undefined} className="underline">Clientes antigos</Link></nav>
    <form action="/admin/historico" className="flex flex-wrap items-end gap-3">{showCustomers && <input type="hidden" name="clientes" value="1"/>}<label className="min-w-0 flex-1 text-xs">{showCustomers?'Buscar cliente antigo':'Buscar pedido ou cliente'}<input name="q" defaultValue={search} maxLength={100} placeholder={showCustomers?'Nome, e-mail, telefone ou cadastro':'Nome do cliente, e-mail ou número do pedido'} className="mt-2 block min-h-[44px] w-full rounded-lg border bg-white px-3 text-sm" /></label><button className="min-h-[44px] rounded-full bg-[#292621] px-5 text-xs text-white">Buscar</button>{search && <Link href={legacyHistoryHref({customers:showCustomers})} className="inline-flex min-h-[44px] items-center text-xs underline">Limpar busca</Link>}</form>
    {installed && <p className="text-xs text-[#756B5D]">{count} {showCustomers?'cliente(s)':'pedido(s)'} encontrado(s){search?` para “${search}”`:''}</p>}

    {selected && detail.data && <section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-xl">Pedido antigo #{detail.data.old_id}</h2><p className="text-sm">Data da compra: {legacyPurchaseDate(detail.data.created_at)}</p><p className="text-sm">{legacyStatus[detail.data.original_status] || detail.data.original_status} · {money(detail.data.total)}</p><p className="text-sm">{detail.data.payload.primeiro_nome} {detail.data.payload.sobrenome} · {detail.data.payload.email}</p><LegacyOrderAddresses payload={detail.data.payload} /><LegacyTrackingStatus tracking={shipmentTracking.data} />{detail.data.needs_review && <p className="text-sm text-amber-800">Vínculo em conferência. Não foi disponibilizado automaticamente para uma conta.</p>}{items.error?<p>Falha ao carregar itens.</p>:<ul className="space-y-2 text-xs">{items.data?.map(item=><li key={item.old_id}>{item.kind} · {item.payload?.quantidade || '—'} × {item.name} · {money(item.kind==='shipping'?item.payload?.custo_frete:item.payload?.total)}{orderItemOptions(item.payload).map((option,index)=><p key={index} className="mt-1 leading-6 text-[#756B5D]">{option}</p>)}{item.kind==='line_item' && /^[1-9][0-9]*$/.test(String(item.payload?.variacao_antiga || '')) && !orderItemOptions(item.payload).length && <p className="mt-1 leading-6 text-amber-800">Medidas/opções da compra ainda não vieram na importação.</p>}</li>)}</ul>}{refunds.error?<p>Falha ao carregar estornos.</p>:refunds.data?.map(refund=><p key={refund.old_id} className="text-sm">Estorno antigo #{refund.old_id}: {money(refund.total)}</p>)}{!detail.data.needs_review && ['wc-processing','wc-completed'].includes(detail.data.original_status) && !refunds.error && !refunds.data?.length && <LegacyLabelStart oldId={String(detail.data.old_id)} shipmentId={shipment.data?.id} intent={shipment.data?.intent} linked={shipmentJob.data?.state==='prepared'} />}<p className="text-xs text-[#756B5D]">O histórico preserva a venda original. Comprar uma etiqueta é uma operação de envio separada.</p></section>}
    {(customers.error || orders.error) && <p role="alert" className="text-sm">Não foi possível consultar a lista agora.</p>}
    <div className="divide-y rounded-xl border bg-white">{showCustomers?customers.data?.map(customer=><div key={customer.old_id} className="p-4 text-sm"><p>{customer.name} · Cadastro antigo #{customer.old_id}</p><p className="mt-1 text-xs text-[#756B5D]">{customer.email} · {customer.phone}</p></div>):orders.data?.map(order=><Link href={href(page,String(order.old_id))} key={order.old_id} className="block p-4 text-sm"><p>#{order.old_id} · {[order.payload?.primeiro_nome,order.payload?.sobrenome].filter(value=>value && value!=='NULL').join(' ') || 'Nome não informado'} · {money(order.total)}</p><p className="mt-1 text-xs text-[#756B5D]">{legacyPurchaseDate(order.created_at)} · {legacyStatus[order.original_status] || order.original_status} · {order.needs_review?'Vínculo em conferência':order.account_user_id?'Vinculado à conta':'Aguardando acesso com e-mail confirmado'}</p></Link>)}</div>
    {installed && !customers.error && !orders.error && count===0 && <p className="rounded-xl border bg-white p-5 text-sm text-[#756B5D]">Nenhum registro corresponde à busca.</p>}
    {pages>1 && <nav aria-label="Páginas do histórico" className="flex items-center gap-6 text-xs">{page>1&&<Link href={href(page-1)} className="inline-flex min-h-[44px] items-center underline">← Anterior</Link>}<span>Página {page} de {pages}</span>{page<pages&&<Link href={href(page+1)} className="inline-flex min-h-[44px] items-center underline">Próxima →</Link>}</nav>}
  </main>
}
