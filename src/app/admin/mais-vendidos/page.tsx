import Link from 'next/link'
import {adminDatabase} from '@/lib/admin-auth'
export const dynamic='force-dynamic'
export default async function Bestsellers({searchParams={}}:{searchParams?:Record<string,string|string[]|undefined>}){
 const {db}=await adminDatabase()
 const requestedDays=Number(searchParams.dias ?? 30),days=[0,7,30,90,365].includes(requestedDays)?requestedDays:30
 const requestedPage=Number(searchParams.page || 1),page=Number.isSafeInteger(requestedPage)&&requestedPage>0?requestedPage:1
 const {data,error}=await db.rpc('serenity_bestsellers_v1',{p_days:days,p_offset:(page-1)*50,p_limit:50})
 const rows=(data || []) as {product_id:string;name:string;sku:string;quantity:number;orders:number;total_products:number}[]
 const total=Number(rows[0]?.total_products || 0)
 return <main className="mx-auto max-w-6xl px-5 py-8"><h1 className="text-3xl">Mais vendidos</h1><p className="mt-3 text-sm leading-6 text-[#756B5D]">Controle interno por quantidade de peças em pedidos pagos deste sistema, incluindo vendas manuais. Variações são somadas por produto. Pedidos cancelados, estornados, com reembolso parcial ou pagamento de teste ficam fora. O histórico do site antigo não entra neste relatório.</p>
  <nav aria-label="Período do relatório" className="my-6 flex flex-wrap gap-2">{[7,30,90,365,0].map(value=><Link key={value} href={`?dias=${value}`} aria-current={days===value?'page':undefined} className="rounded-full border bg-white px-4 py-3 text-xs aria-[current=page]:bg-[#292621] aria-[current=page]:text-white">{value===0?'Todo o período':`${value} dias`}</Link>)}</nav>
  {error?<p role="alert" className="rounded-xl border p-5">Não foi possível carregar o relatório. Confira a instalação do SQL de mais vendidos e tente novamente.</p>:<><div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-4">Posição</th><th>Produto</th><th className="p-4">Peças vendidas</th><th className="p-4">Pedidos</th></tr></thead><tbody>{rows.map((row,index)=><tr key={row.product_id} className="border-b"><td className="p-4">{(page-1)*50+index+1}</td><td className="min-w-48 py-3">{/^[a-f0-9-]{36}$/i.test(row.product_id)?<Link className="underline" href={`/admin/produtos/${row.product_id}`}>{row.name}</Link>:row.name}<p className="mt-1 text-xs text-[#756B5D]">{row.sku}</p></td><td className="p-4 font-medium">{row.quantity}</td><td className="p-4">{row.orders}</td></tr>)}</tbody></table>{!rows.length && <p className="p-5 text-sm">Nenhuma venda paga encontrada neste período.</p>}</div><nav className="mt-5 flex gap-5 text-sm" aria-label="Páginas de mais vendidos">{page>1 && <Link href={`?dias=${days}&page=${page-1}`}>← Anterior</Link>}{page*50<total && <Link href={`?dias=${days}&page=${page+1}`}>Próxima →</Link>}</nav></>}
 </main>
}
