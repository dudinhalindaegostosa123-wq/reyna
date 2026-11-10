'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { materialPrices,type PricePreview } from './actions'
import { formatPrice } from '@/lib/data'
export default function MaterialPrices({materials}:{materials:string[]}) {
 const router=useRouter()
 const [material,setMaterial]=useState(''),[percent,setPercent]=useState(''),[direction,setDirection]=useState('decrease'),[preview,setPreview]=useState<PricePreview|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[batch,setBatch]=useState('')
 const reset=()=>{setPreview(null);setMessage('');setBatch('')}
 async function run(apply=false){
  setBusy(true);setMessage('')
  try{
   const amount=Number(percent.replace(',','.'))*(direction==='decrease'?-1:1)
   const result=await materialPrices(material,amount,apply?batch:undefined,apply?preview?.fingerprint:undefined)
   if(result.error){setMessage(result.error);if(apply)resetPreview();return}
   if(apply){setMessage('Preços atualizados. Pedidos e pagamentos existentes foram preservados.');resetPreview();router.refresh()}
   else {setPreview(result.preview || null);setBatch(crypto.randomUUID())}
  }catch{setMessage('Não foi possível confirmar a operação. Atualize a página para conferir o histórico antes de repetir.')}
  finally{setBusy(false)}
 }
 function resetPreview(){setPreview(null);setBatch('')}
 return <section className="mt-6 space-y-5 rounded-2xl border border-[#E5DED3] bg-white p-6">
  <label className="block text-sm">Material<select disabled={busy} value={material} onChange={e=>{setMaterial(e.target.value);reset()}} className="mt-2 block min-h-12 w-full rounded-lg border p-3"><option value="">Selecionar material</option>{materials.map(value=><option key={value}>{value}</option>)}</select></label>
  <div className="flex flex-wrap gap-3"><select aria-label="Tipo de ajuste" disabled={busy} value={direction} onChange={e=>{setDirection(e.target.value);reset()}} className="rounded-lg border p-3"><option value="decrease">Diminuir preços</option><option value="increase">Aumentar preços</option></select><label className="text-sm">Percentual (%)<input disabled={busy} type="number" min="0.01" max={direction==='decrease'?90:500} step="0.01" value={percent} onChange={e=>{setPercent(e.target.value);reset()}} className="ml-2 rounded-lg border p-3"/></label></div>
  <p className="text-sm leading-6 text-[#756B5D]">Altera os preços atuais das joias publicadas e suas variações deste material. Os preços promocionais recebem o mesmo percentual, e a base do atacado acompanha o reajuste. Pedidos já feitos não mudam. Ajustes sucessivos se acumulam.</p>
  <button disabled={busy || !material || !percent} onClick={()=>run()} className="rounded-full bg-[#292621] px-6 py-3 text-sm text-white disabled:opacity-40">{busy?'Processando…':'Ver prévia'}</button>
  {preview && <div className="space-y-4 border-t pt-5"><p>{preview.count} preços receberão {preview.percent}%.</p><table className="w-full text-left text-sm"><thead><tr><th>Peça</th><th>Atual</th><th>Novo</th></tr></thead><tbody>{preview.examples.map((item,index)=><tr key={index}><td className="py-2">{item.name}</td><td>{formatPrice(item.before)}</td><td>{formatPrice(item.after)}</td></tr>)}</tbody></table><button disabled={busy} onClick={()=>run(true)} className="rounded-full bg-[#292621] px-6 py-3 text-sm text-white disabled:opacity-40">Confirmar e aplicar {preview.percent}%</button></div>}
  {message && <p role="status" className="text-sm leading-6">{message}</p>}
 </section>
}
