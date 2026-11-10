'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {openGuestTracking} from './actions'
import type {GuestTracking} from '@/lib/guest-tracking-server'
import CustomerShipmentStatus from '@/components/account/CustomerShipmentStatus'
export default function GuestTrackingClient(){
 const [tracking,setTracking]=useState<GuestTracking|null>(null)
 const [busy,setBusy]=useState(true),[error,setError]=useState('')
 const running=useRef(false)
 const pendingToken=useRef<string|undefined>(undefined)
 async function update(token?:string){
  if(running.current)return
  running.current=true;setBusy(true);setError('')
  try{const result=await openGuestTracking(token ?? pendingToken.current);if(result.tracking)pendingToken.current=undefined;setTracking(result.tracking||null);setError(result.error)}
  catch{setError('Não foi possível consultar agora. Tente novamente em instantes.')}
  finally{running.current=false;setBusy(false)}
 }
 useEffect(()=>{
  // Fragments are not sent to the server. Remove before network requests;
  // analytics are disabled entirely on this route.
  const fragment=window.location.hash.slice(1)
  pendingToken.current=fragment||undefined
  if(fragment)window.history.replaceState(null,'',window.location.pathname)
  void update(fragment||undefined)
 },[])
 return <main className="mx-auto max-w-xl px-5 py-12 sm:py-20"><p className="text-[10px] uppercase tracking-[0.25em] text-store-accent">Serenity Piercings</p><h1 className="mt-3 text-3xl font-medium tracking-tight">Acompanhe sua compra</h1><p className="mt-3 text-sm leading-6 text-store-muted">As atualizações do seu pedido, sem precisar entrar em uma conta.</p>
  {busy&&<p role="status" className="mt-8 text-sm">Consultando seu pedido…</p>}
  {error&&<p role="alert" className="mt-6 rounded-2xl border border-store-border bg-store-surface p-5 text-sm leading-6">{error}</p>}
  {tracking&&<section className="mt-8 rounded-2xl border border-store-border bg-store-surface p-6"><div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg">Pedido #{tracking.number}</h2><p className="text-sm">{tracking.total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p></div><p className="mt-2 text-xs text-store-muted">{new Date(tracking.createdAt).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p>
   {tracking.environment==='test'&&<p className="mt-3 text-xs text-store-warning">Ambiente de teste. Não representa uma compra real.</p>}
   {tracking.status==='review'?<div className="mt-5"><p className="text-sm font-medium">Pagamento em conferência</p><p className="mt-2 text-xs leading-6 text-store-muted">Estamos conferindo a confirmação da sua compra. Se você já pagou, não pague novamente.</p></div>:<CustomerShipmentStatus status={tracking.status} carrier={tracking.carrier} trackingCode={tracking.trackingCode}/>}
  </section>}
  <button type="button" disabled={busy} onClick={()=>void update()} className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-store-action px-6 text-sm text-white disabled:opacity-40">Atualizar acompanhamento</button><p className="mt-5 text-xs leading-6 text-store-muted">Precisa de ajuda? <a href="mailto:contato@serenitypiercings.com.br" className="underline">Fale com a Serenity</a>.</p><Link href="/" className="mt-6 inline-flex min-h-[44px] items-center text-xs underline">Voltar à loja</Link>
 </main>
}
