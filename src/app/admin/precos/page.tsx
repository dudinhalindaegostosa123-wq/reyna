import {adminDatabase} from '@/lib/admin-auth'
import {readAdminPriceOptions} from '@/lib/admin-price-options'
import MaterialPrices from './MaterialPrices'
import CategoryPrices from './CategoryPrices'
import UndoPrices from './UndoPrices'
export const dynamic='force-dynamic'
const date=(value:string)=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})
export default async function PricesPage(){
 const {db}=await adminDatabase()
 const [options,materialHistory,categoryHistory]=await Promise.all([
  readAdminPriceOptions(db),
  db.from('serenity_material_price_batches_v1').select('id,material,percent,applied_at,result').order('applied_at',{ascending:false}).limit(20),
  db.from('serenity_category_price_batches_v1').select('id,category,percent,applied_at,result').order('applied_at',{ascending:false}).limit(20),
 ])
 const batchIds=[...(materialHistory.data || []),...(categoryHistory.data || [])].map(row=>row.id)
 const undoHistory=batchIds.length?await db.from('serenity_price_undos_v1').select('kind,batch').in('batch',batchIds):{data:[]}
 const undone=new Set((undoHistory.data || []).map(row=>`${row.kind}:${row.batch}`))
 const names=new Map(options.categories.map(item=>[item.slug,item.name]))
 return <main className="mx-auto max-w-5xl px-5 py-8">
  <h1 className="text-3xl">Reajuste de preços</h1>
  <p className="mt-3 text-sm text-[#756B5D]">Ajuste por categoria ou material. Confira os produtos e os valores na prévia antes de aplicar.</p>
  {options.error?<section role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm"><p>{options.error}</p><a href="/admin/precos" className="mt-3 inline-flex min-h-11 items-center underline">Tentar carregar novamente</a></section>:<>
   <h2 className="mt-8 text-lg">Por categoria</h2><CategoryPrices categories={options.categories}/>
   <h2 className="mt-8 text-lg">Por material</h2><MaterialPrices materials={options.materials}/>
  </>}
  <section className="mt-8"><h2 className="text-lg">Últimos reajustes por material</h2>{materialHistory.error?<p className="mt-3 text-sm text-[#756B5D]">Histórico indisponível. Confira a instalação do SQL de preços por material e a disponibilidade do banco.</p>:materialHistory.data?.length?materialHistory.data.map(row=><div key={row.id} className="mt-3 text-sm">{date(row.applied_at)} · {row.material} · {row.percent}% · {row.result?.count} preços<UndoPrices kind="material" batch={row.id} undone={undone.has(`material:${row.id}`)}/></div>):<p className="mt-3 text-sm text-[#756B5D]">Nenhum reajuste registrado nesta ferramenta.</p>}</section>
  <section className="mt-8"><h2 className="text-lg">Últimos reajustes por categoria</h2>{categoryHistory.error?<p className="mt-3 text-sm text-[#756B5D]">Histórico indisponível. Confira a instalação do SQL de preços por categoria e a disponibilidade do banco.</p>:categoryHistory.data?.length?categoryHistory.data.map(row=><div key={row.id} className="mt-3 text-sm">{date(row.applied_at)} · {names.get(row.category) || row.category} · {row.percent}% · {row.result?.count} preços<UndoPrices kind="category" batch={row.id} undone={undone.has(`category:${row.id}`)}/></div>):<p className="mt-3 text-sm text-[#756B5D]">Nenhum reajuste registrado nesta ferramenta.</p>}</section>
 </main>
}
