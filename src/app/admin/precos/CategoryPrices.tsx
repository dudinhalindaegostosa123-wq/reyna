'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { categoryPrices,type CategoryPricePreview as PricePreview } from './actions'
import { formatPrice } from '@/lib/data'
export default function CategoryPrices({categories}:{categories:{slug:string;name:string}[]}) {
 const router=useRouter()
 const [category,setCategory]=useState(''),[percent,setPercent]=useState(''),[direction,setDirection]=useState('decrease'),[preview,setPreview]=useState<PricePreview|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[batch,setBatch]=useState('')
 const reset=()=>{setPreview(null);setMessage('');setBatch('')}
 async function run(apply=false){
  const entered=Number(percent.replace(',','.'))
  if(!Number.isFinite(entered) || entered<=0 || entered>(direction==='decrease'?90:500) || Math.abs(Math.round(entered*100)-entered*100)>0.000001){setMessage('Informe um percentual positivo, com até duas casas decimais.');return}
  setBusy(true);setMessage('')
  try{
   const amount=entered*(direction==='decrease'?-1:1)
   const result=await categoryPrices(category,amount,apply?batch:undefined,apply?preview?.fingerprint:undefined)
   if(result.error){setMessage(result.error);if(apply)resetPreview();return}
   if(apply){setMessage('Preços atualizados. Pedidos e pagamentos existentes foram preservados.');resetPreview();router.refresh()}
   else {setPreview(result.preview || null);setBatch(crypto.randomUUID())}
  }catch{setMessage('Não foi possível confirmar a operação. Atualize a página para conferir o histórico antes de repetir.')}
  finally{setBusy(false)}
 }
 function resetPreview(){setPreview(null);setBatch('')}
 return <section className="mt-6 space-y-5 rounded-2xl border border-[#E5DED3] bg-white p-6">
  <label className="block text-sm">Categoria<select disabled={busy} value={category} onChange={e=>{setCategory(e.target.value);reset()}} className="mt-2 block min-h-12 w-full rounded-lg border p-3"><option value="">Selecionar categoria</option>{categories.map(value=><option key={value.slug} value={value.slug}>{value.name}</option>)}</select></label>
  <div className="flex flex-wrap gap-3"><select aria-label="Tipo de ajuste" disabled={busy} value={direction} onChange={e=>{setDirection(e.target.value);reset()}} className="rounded-lg border p-3"><option value="decrease">Diminuir preços</option><option value="increase">Aumentar preços</option></select><label className="text-sm">Percentual (%)<input disabled={busy} type="number" min="0.01" max={direction==='decrease'?90:500} step="0.01" value={percent} onChange={e=>{setPercent(e.target.value);reset()}} className="ml-2 rounded-lg border p-3"/></label></div>
  <p className="text-sm leading-6 text-[#756B5D]">Altera os preços dos produtos publicados desta categoria e suas variações. Produtos presentes em mais de uma categoria são reajustados uma única vez nesta operação. Os preços promocionais recebem o mesmo percentual, e a base do atacado acompanha o reajuste. Pedidos já feitos não mudam. Ajustes sucessivos se acumulam.</p>
  <button disabled={busy || !category || !percent} onClick={()=>run()} className="rounded-full bg-[#292621] px-6 py-3 text-sm text-white disabled:opacity-40">{busy?'Processando…':'Ver prévia'}</button>
  {preview && <div className="space-y-4 border-t pt-5"><p>{preview.count} preços receberão {preview.percent}%.</p><table className="w-full text-left text-sm"><thead><tr><th>Peça</th><th>Atual</th><th>Novo</th></tr></thead><tbody>{preview.examples.map((item,index)=><tr key={index}><td className="py-2">{item.name}</td><td>{formatPrice(item.before)}</td><td>{formatPrice(item.after)}</td></tr>)}</tbody></table><button disabled={busy} onClick={()=>run(true)} className="rounded-full bg-[#292621] px-6 py-3 text-sm text-white disabled:opacity-40">Confirmar e aplicar {preview.percent}%</button></div>}
  {message && <p role="status" className="text-sm leading-6">{message}</p>}
 </section>
}
