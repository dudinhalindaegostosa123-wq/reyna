import Link from 'next/link'
import {adminDatabase} from '@/lib/admin-auth'
import {GA4_MEASUREMENT_ID} from '@/lib/analytics-server'
import AnalyticsControls from './AnalyticsControls'
export const dynamic='force-dynamic'
const states:Record<string,string>={pending:'Aguardando envio',sending:'Enviando',sent:'Enviado ao endpoint do GA4',review:'Conferir envio incerto',blocked:'Bloqueado — conferir motivo'}
export default async function AnalyticsPage(){
 const {db}=await adminDatabase()
 const [result,orders]=await Promise.all([
  db.from('serenity_analytics_outbox_v1').select('order_id,state,occurred_at,sent_at,error_code').order('created_at',{ascending:false}).limit(20),
  db.from('serenity_orders').select('id,number,paid_at').eq('source','site').eq('status','paid').order('paid_at',{ascending:false}).limit(20),
 ])
 let missing:{id:string;number:number}[]=[]
 let contextError=false
 if(!result.error && !orders.error && orders.data?.length){
  const context=await db.from('serenity_analytics_context_v1').select('checkout_id').in('checkout_id',orders.data.map(row=>row.id))
  contextError=Boolean(context.error)
  if(!context.error){const captured=new Set(context.data?.map(row=>row.checkout_id));missing=orders.data.filter(row=>!captured.has(row.id))}
 }
 const secret=process.env.SERENITY_GA4_API_SECRET?.trim() || ''
 const ready=/^[A-Za-z0-9_-]{10,200}$/.test(secret)
 const production=process.env.VERCEL_ENV==='production'
 const enabled=process.env.SERENITY_GA4_SERVER_ENABLED==='true'
 return <main className="mx-auto max-w-5xl px-5 py-8">
  <h1 className="text-3xl">Mensuração</h1>
  <section className="mt-6 rounded-2xl border bg-white p-6 text-sm leading-7">
   <h2 className="mb-3 text-lg">Configuração desta publicação</h2>
   <p>Fluxo GA4: <strong>{process.env.SERENITY_GA4_MEASUREMENT_ID || GA4_MEASUREMENT_ID}</strong></p>
   <p>Ambiente: {production?'produção':'teste ou preview — sem envio de conversões'}</p>
   <p>Chave secreta: {ready?'configurada':secret?'formato inválido — conferir na Vercel':'pendente'}</p>
   <p>Envio pelo servidor: {enabled?'habilitado':'desativado'}</p>
   <p>Fila de compras: {result.error?'indisponível — conferir SQL e conexão':'acessível'}</p>
   {(!ready || !enabled || result.error) && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm">O envio automático de compras ainda precisa de configuração. Cadastre SERENITY_GA4_API_SECRET e SERENITY_GA4_SERVER_ENABLED=true na Vercel, instale os SQLs de mensuração e publique novamente. Não coloque a chave em variáveis NEXT_PUBLIC.</p>}
   <p className="mt-4 text-[#756B5D]">Compras entram na fila após aprovação efetiva. O envio não depende de o cliente manter a tela aberta. O status abaixo confirma a resposta HTTP; o recebimento e a atribuição devem ser conferidos no Analytics e no Google Ads.</p>
   <AnalyticsControls/>
  </section>
  <section className="mt-6 rounded-2xl border bg-white p-6 text-sm leading-7">
   <h2 className="text-lg">Conferência das últimas 20 compras pagas do site</h2>
   {orders.error || result.error || contextError?<p className="mt-3">Não foi possível concluir a conferência. Confira a instalação do SQL e a conexão com o banco.</p>:<>
    <p className="mt-3">{missing.length} de {orders.data?.length || 0} sem identificação de navegação para mensuração pelo servidor.</p>
    <p className="mt-2 text-[#756B5D]">Compras antigas, bloqueadores ou ausência de identificação podem gerar esse resultado. A correção começa a capturar novas sessões; não inventa a origem das compras anteriores.</p>
    {missing.length>0 && <div className="mt-3 flex flex-wrap gap-2">{missing.map(row=><Link key={row.id} href={`/admin/pedidos/${row.id}`} className="inline-flex min-h-11 items-center rounded-full border px-4 text-xs">Pedido #{row.number}</Link>)}</div>}
   </>}
  </section>
  <section className="mt-8"><h2 className="text-lg">Últimos 20 eventos de compra</h2>
   {result.error?<p className="mt-4 text-sm">Instalação da fila pendente ou consulta indisponível. Confira o SQL.</p>:!result.data?.length?<p className="mt-4 text-sm">Nenhum evento registrado. Compras sem contexto de navegação válido não geram atribuição inventada.</p>:result.data.map(row=><article key={row.order_id} className="mt-3 rounded-xl border bg-white p-4 text-sm"><p>{states[row.state] || row.state}</p><Link href={`/admin/pedidos/${row.order_id}`} className="mt-2 inline-flex min-h-11 items-center text-xs underline">Ver pedido</Link><p className="mt-2 text-xs text-[#756B5D]">{new Date(row.occurred_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}{row.error_code?' · '+row.error_code:''}</p></article>)}
  </section>
  <aside className="mt-8 rounded-2xl border p-6 text-sm leading-7"><h2 className="text-lg">Conferir no Google Ads</h2><p className="mt-3">Após validar purchase no GA4, importe essa compra no Google Ads. Mantenha apenas uma ação de compra como principal: usar a compra direta da tag e a compra importada do GA4 como principais ao mesmo tempo pode contar uma venda duas vezes.</p><p className="mt-2 text-[#756B5D]">add_to_cart mede adições ao carrinho e view_cart mede sua abertura. Use esses eventos como acompanhamento do funil. Vendas do site e vendas atribuídas aos anúncios podem ter totais diferentes.</p></aside>
 </main>
}
