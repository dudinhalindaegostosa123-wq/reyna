'use client'
import {useState} from 'react'
import {processAnalytics,testAnalytics} from './actions'
export default function AnalyticsControls(){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 async function run(test=false){setBusy(true);setMessage('');try{const result=await(test?testAnalytics():processAnalytics());setMessage(result.message)}catch{setMessage('Não foi possível confirmar a operação.')}finally{setBusy(false)}}
 return <div className="mt-5"><div className="flex flex-wrap gap-3"><button disabled={busy} onClick={()=>void run(true)} className="min-h-11 rounded-full border px-5 text-sm disabled:opacity-40">Testar conexão com GA4</button><button disabled={busy} onClick={()=>void run()} className="min-h-11 rounded-full bg-[#292621] px-5 text-sm text-white disabled:opacity-40">Enviar eventos pendentes</button></div>{message && <p role="status" className="mt-4 text-sm leading-6">{message}</p>}</div>
}
