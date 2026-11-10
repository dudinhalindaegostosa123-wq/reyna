'use client'
import {useState} from 'react'
import {useRouter} from 'next/navigation'
import {undoPrices} from './actions'
export default function UndoPrices({kind,batch,undone=false}:{kind:'material'|'category';batch:string;undone?:boolean}){
 const router=useRouter()
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[message,setMessage]=useState('')
 async function undo(){
  setBusy(true);setMessage('')
  try{
   const result=await undoPrices(kind,batch)
   if(result.error){setMessage(result.error);return}
   setDone(true);setConfirm(false);router.refresh()
  }catch{setMessage('Não foi possível confirmar. Atualize o histórico antes de tentar novamente.')}
  finally{setBusy(false)}
 }
 if(undone || done)return <span role="status" className="ml-3 text-sm">Desfeito</span>
 return <div className="mt-2 text-sm">
  {confirm?<><p>Restaurar os preços anteriores deste reajuste? Pedidos já feitos não mudam.</p><button disabled={busy} onClick={undo} className="mr-3 mt-2 rounded-full border px-4 py-2 disabled:opacity-40">{busy?'Desfazendo…':'Confirmar desfazer'}</button><button disabled={busy} onClick={()=>setConfirm(false)} className="underline">Cancelar</button></>:<button onClick={()=>setConfirm(true)} className="rounded-full border px-4 py-2">Desfazer reajuste</button>}
  {message && <p role="alert" className="mt-2">{message}</p>}
 </div>
}
