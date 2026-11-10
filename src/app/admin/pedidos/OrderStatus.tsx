'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { changeOrderStatus } from './actions'
export default function OrderStatus({id,status,canConfirm=true}:{id:string;status:string;canConfirm?:boolean}) {
  const [pending,setPending]=useState(false),[message,setMessage]=useState('')
  async function start(task:()=>Promise<void>) {setPending(true);try {await task()} finally {setPending(false)}}
  const router=useRouter()
  const options=status==='pending' ? [['paid','Confirmar pagamento'],['cancelled','Cancelar pedido']] : status==='paid' ? [['refunded','Registrar estorno integral']] : []
  return <div className="mt-6"><div className="flex flex-wrap gap-3">{options.filter(([value])=>canConfirm || value!=="paid").map(([value,label])=><button key={value} disabled={pending} className="min-h-[44px] rounded-full border border-[#CFC3B1] bg-white px-5 text-sm disabled:opacity-50" onClick={()=>{if(!window.confirm(value==='paid' ? 'Você conferiu e recebeu o pagamento integral deste pedido?' : value==='refunded' ? 'Você já devolveu integralmente o pagamento ao cliente? O painel apenas registra o estorno.' : 'Confirmar o cancelamento deste pedido pendente?'))return;start(async()=>{try {const result=await changeOrderStatus(id,status,value);setMessage(result.error);if(!result.error)router.refresh()}catch{setMessage('Falha de conexão. Atualize para conferir a situação do pedido.')}})}}>{pending ? 'Salvando…' : label}</button>)}</div>{message && <p role="alert" className="mt-3 text-sm text-red-800">{message}</p>}</div>
}

// Serenity: pedidos do site v1
