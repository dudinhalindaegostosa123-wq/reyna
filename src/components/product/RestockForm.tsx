'use client'
import {useState} from 'react'
import {subscribeRestock} from '@/app/avisos/estoque/actions'
export default function RestockForm({slug,variants=[],initialVariant=''}:{slug:string;variants?:{id:string;name:string}[];initialVariant?:string}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 const [variant,setVariant]=useState(variants.some(v=>v.id===initialVariant)?initialVariant:variants.length===1?variants[0].id:'')
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setMessage('');setError('')
  const form=event.currentTarget
  try{const result=await subscribeRestock(new FormData(form));if(result.error)setError(result.error);else{setMessage(result.success || 'Pedido de aviso registrado.');setOpen(false)}}
  catch{setError('Não foi possível registrar agora. Tente novamente mais tarde.')}
  finally{setBusy(false)}
 }
 return <section className="mt-5 rounded-2xl border border-store-border bg-store-raised p-5">
  <h2 className="text-lg font-medium">Sua peça está indisponível?</h2><p className="mt-2 text-sm leading-6 text-store-muted">Deixe seu e-mail para receber um aviso quando ela voltar ao estoque.</p>
  {!open && !message && <button type="button" onClick={()=>setOpen(true)} className="mt-4 min-h-12 w-full rounded-xl bg-store-action px-4 py-3 text-sm text-white">Avise-me quando disponível</button>}
  {open && <form onSubmit={submit} className="mt-4 space-y-4">
   <input type="hidden" name="slug" value={slug}/>
   {variants.length>0?<label className="block text-sm">Variação desejada<select name="variant" required value={variant} disabled={busy} onChange={event=>setVariant(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border bg-store-surface p-3"><option value="">Escolha a variação esgotada</option>{variants.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>:<input type="hidden" name="variant" value=""/>}
   <label className="block text-sm">Seu e-mail<input type="email" name="email" required maxLength={254} autoComplete="email" disabled={busy} className="mt-2 min-h-12 w-full rounded-xl border bg-store-surface p-3"/></label>
   <label className="flex gap-2 text-xs leading-5"><input type="checkbox" name="consent" required disabled={busy} className="mt-1 h-4 w-4 shrink-0"/>Autorizo um único aviso por e-mail sobre a reposição desta peça ou variação. Não é inscrição em publicidade.</label>
   <div className="hidden" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
   <button disabled={busy} className="min-h-12 w-full rounded-xl bg-store-action px-4 py-3 text-sm text-white disabled:opacity-50">{busy?'Registrando…':'Quero receber o aviso'}</button>
  </form>}
  {message && <p role="status" className="mt-3 text-sm leading-6">{message}</p>}{error && <p role="alert" className="mt-3 text-sm">{error}</p>}
 </section>
}
