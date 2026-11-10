import Link from 'next/link'
import CheckoutAutoRefresh from '@/components/admin/CheckoutAutoRefresh'
import {adminDatabase} from '@/lib/admin-auth'
import {readCheckoutReport} from '@/lib/checkout-report'
import {saleDate,saleMoney} from '@/lib/admin-sales'
export const dynamic='force-dynamic'
export const metadata={title:'Checkouts não concluídos',robots:{index:false,follow:false}}
export default async function CheckoutsPage({searchParams={}}:{searchParams?:{ambiente?:string;numero?:string;concluidos?:string;tentativa?:string}}){
 const {db}=await adminDatabase()
 let report
 try{report=await readCheckoutReport(db,searchParams)}catch{return <main className="mx-auto max-w-5xl px-5 py-8"><h1 className="text-3xl">Checkouts não concluídos</h1><p role="alert" className="mt-5">Não foi possível consultar os registros. Tente novamente.</p></main>}
 const {environment,number,requestedId,rows,contactError,contextError,numberError,relatedError}=report
 const exportParams=new URLSearchParams({ambiente:environment})
 if(number)exportParams.set('numero',number)
 else if(requestedId)exportParams.set('tentativa',requestedId)
 if(searchParams.concluidos==='1')exportParams.set('concluidos','1')
 return <main className="mx-auto max-w-6xl px-5 py-8">
  <CheckoutAutoRefresh/>
  <h1 className="text-3xl">{requestedId && !number?'Detalhes do checkout':'Checkouts não concluídos'}</h1>
  {requestedId && <Link href={`/admin/checkouts?ambiente=${environment}`} className="mt-3 inline-flex min-h-11 items-center text-xs underline">← Voltar aos checkouts</Link>}
  <p className="mt-3 max-w-3xl text-sm leading-6 text-[#756B5D]">Contatos preenchidos e tentativas de compra, mesmo sem pedido confirmado. A situação é atualizada automaticamente a cada 30 segundos enquanto esta tela está visível. Um número pode ser reservado antes do pagamento. Após 30 minutos sem atividade e sem checkout de pagamento, o contato aparece como possível abandono; isso não confirma que a pessoa desistiu.</p>
  <form className="my-6 flex flex-wrap items-end gap-3">
   <label className="text-xs">Ambiente<select name="ambiente" defaultValue={environment} className="mt-2 block min-h-11 rounded-xl border bg-white px-3 text-sm"><option value="production">Produção</option><option value="test">Teste</option></select></label>
   <label className="text-xs">Número reservado<input name="numero" inputMode="numeric" defaultValue={number} placeholder="Ex.: 83" className="mt-2 block min-h-11 w-36 rounded-xl border bg-white px-3 text-sm"/></label>
   <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" name="concluidos" value="1" defaultChecked={searchParams.concluidos==='1'}/>Mostrar compras concluídas</label>
   <button className="min-h-11 rounded-full bg-[#292621] px-5 text-sm text-white">Consultar</button>
  </form>
  <div className="mb-5"><a href={`/admin/checkouts/exportar?${exportParams}`} className="inline-flex min-h-11 items-center rounded-full border border-[#DDD4C7] bg-white px-5 text-sm">Baixar e-mails em CSV</a><p className="mt-2 text-xs leading-5 text-[#756B5D]">Exporta todos os resultados dos filtros, além dos 100 exibidos na lista, com um registro por e-mail.</p></div>
  {contactError && <p role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">A captura de nome e e-mail antes do pagamento ainda precisa do SQL atualizado de contatos e WhatsApp no banco. As sessões de checkout existentes continuam sendo consultadas abaixo.</p>}
  {(contextError || numberError || relatedError) && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm">Não foi possível conferir todos os dados de pagamento ou números reservados. Nenhum registro deve ser considerado abandono confirmado.</p>}
  <p className="mb-4 text-xs text-[#756B5D]">Até 100 contatos recentes e 100 sessões recentes por ambiente. A busca por número consulta diretamente o registro reservado. Registros de contato sem pagamento são estimativas, sem reservar estoque nem gerar pedido.</p>
  <div className="space-y-4">{rows.map(row=><article key={row.id} className="rounded-2xl border border-[#E5DED3] bg-white p-5">
   <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-medium">{row.number?`#${row.number} · `:''}{row.name}</h2><p className="mt-1 break-all text-sm text-[#756B5D]">{row.email}</p></div><p className="rounded-full bg-[#F2EDE5] px-3 py-1 text-xs">{row.status}</p></div>
   <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">{row.phone?<><p>WhatsApp: +{row.phone}</p><a href={`https://wa.me/${row.phone}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">Abrir WhatsApp ↗</a></>:<p className="text-xs text-[#756B5D]">WhatsApp ainda não informado.</p>}</div>
   <p className="mt-3 text-xs text-[#756B5D]">Última atividade: {saleDate(row.lastActivity)} · {row.estimated?'Estimativa das peças':'Total do checkout'}: {saleMoney(row.total/100)}</p>
   <ul className="mt-3 space-y-1 text-sm">{row.items.map((item,index)=><li key={index}>{item.quantity || 1} × {item.name || 'Peça'}</li>)}</ul>
   {!requestedId && <Link className="mr-5 mt-3 inline-flex min-h-11 items-center text-xs underline" href={`/admin/checkouts?tentativa=${row.id}&ambiente=${environment}&concluidos=1`}>Abrir detalhes do checkout</Link>}
   {row.relatedPurchase && <div className="mt-3 rounded-xl border border-[#DDD4C7] bg-[#F8F5F0] p-3 text-xs leading-6"><p>{row.relatedPurchase.confidence==='email'?'Existe uma compra paga posterior com este e-mail, em até 24 horas. Confira o pedido antes de considerar este contato como abandono. Isso não confirma que as duas tentativas são a mesma compra.':'Foi encontrada uma compra paga do mesmo navegador, com o mesmo e-mail, peças e quantidades, em até 24 horas. Este contato permanece como registro separado.'}</p><Link className="inline-flex min-h-11 items-center underline" href={`/admin/pedidos/${row.relatedPurchase.orderId}`}>Ver compra relacionada #{row.relatedPurchase.number}</Link></div>}
   {row.orderId && <Link className="mt-3 inline-flex min-h-11 items-center text-xs underline" href={`/admin/pedidos/${row.orderId}`}>Abrir pedido confirmado</Link>}
  </article>)}</div>
  {!rows.length && <p className="rounded-xl border bg-white p-5 text-sm">Nenhum registro encontrado nesta consulta.</p>}
  <p className="mt-6 text-xs leading-6 text-[#756B5D]">Registros de contato sem atividade há mais de 90 dias são removidos nas atualizações da captura. Esta tela não envia e-mails nem mensagens e não recupera formulários antigos que nunca foram registrados.</p>
 </main>
}
