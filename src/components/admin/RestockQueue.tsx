import type {SupabaseClient} from '@supabase/supabase-js'
import {processRestockEmails} from '@/app/admin/emails/restock-actions'
import EmailActionButton from './EmailActionButton'
const states:Record<string,string>={waiting:'Aguardando reposição',sending:'Em envio',retry:'Tentará novamente',sent:'Aviso enviado',review:'Conferir envio',cancelled:'Cancelado'}
export default async function RestockQueue({db}:{db:SupabaseClient}){
 const {data,error}=await db.from('serenity_restock_subscriptions_v1').select('id,state,attempts,created_at,error_code,products(name,sku),product_variants(name)').order('created_at',{ascending:false}).limit(50)
 const rows=(data || []) as unknown as {id:string;state:string;attempts:number;error_code:string|null;products:{name:string;sku:string}|null;product_variants:{name:string}|null}[]
 return <section className="mt-10 space-y-4 border-t pt-7"><h2 className="text-xl">Avisos de reposição de estoque</h2><p className="text-sm leading-6 text-[#756B5D]">Últimas 50 inscrições. O aviso sai uma vez quando a peça ou a variação volta a ficar disponível. Inscrições expiram em 90 dias. Envios incertos ficam para conferência, sem repetição automática.</p>
 {error?<p role="alert" className="text-sm">Instale o SQL de avisos de estoque para disponibilizar este recurso.</p>:<><form action={processRestockEmails}><EmailActionButton pendingLabel="Processando reposições…">Processar avisos de reposição</EmailActionButton></form><div className="divide-y rounded-xl border bg-white">{rows.map(row=><div key={row.id} className="p-4 text-sm"><p>{row.products?.name || 'Produto'}{row.product_variants?.name?' — '+row.product_variants.name:''}</p><p className="mt-1 text-xs text-[#756B5D]">{states[row.state] || row.state} · {row.attempts} tentativa(s)</p>{row.error_code && <p className="mt-1 text-xs">Referência: {row.error_code}</p>}</div>)}{!rows.length && <p className="p-4 text-sm">Nenhum pedido de aviso registrado.</p>}</div></>}
 </section>
}
