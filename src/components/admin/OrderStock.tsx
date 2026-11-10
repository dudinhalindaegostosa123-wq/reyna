'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saleDate } from '@/lib/admin-sales'
import { manageOrderStock } from '@/app/admin/pedidos/stock-actions'

interface Movement {
  entity:string
  id:string
  name?:string
  quantity:number
  before:number
  after:number
}

interface Event {
  id:string
  kind:string
  created_at:string
  changes:Movement[]|{until?:string;untracked?:number}
}

interface Props {
  id:string
  status:string
  state:string
  expires:string|null
  untracked:number
  version:string
  events:Event[]
}

const labels:Record<string,string>={
  legacy:'Pedido anterior ao controle automático',
  none:'Sem movimentação',
  reserved:'Reserva temporária',
  released:'Reserva liberada',
  debited:'Baixa de estoque registrada',
  returned:'Devolvido ao estoque'
}

const eventLabels:Record<string,string>={
  reserved:'Reserva criada',
  released:'Reserva liberada',
  debited:'Baixa registrada',
  returned:'Peças devolvidas ao estoque'
}

export default function OrderStock({id,status,state,expires,untracked,version,events}:Props){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const router=useRouter()
  const active=state==='reserved' && Boolean(expires) && Date.parse(expires!)>Date.now()
  const commands:string[][]=[]

  if(status==='pending'){
    if(active)commands.push(['release','Liberar reserva'])
    else if(!['debited','returned'].includes(state))commands.push(['reserve','Reservar por 30 minutos'])
  }

  if(status==='refunded' && state==='debited')commands.push(['return','Devolver peças ao estoque'])

  return <section className="mb-5 rounded-3xl border border-[#DED4C5] bg-white p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">Estoque deste pedido</h2><span className="rounded-full bg-[#F1EBE1] px-3 py-2 text-xs">{state==='reserved' && !active ? 'Reserva expirada' : labels[state] || state}</span></div>

    {state==='reserved' && expires && <p className="mt-3 text-xs leading-relaxed text-[#756B5D]">{active ? 'Reservado até ' : 'A reserva terminou em '}{saleDate(expires)}.{!active && ' O saldo já pode ser usado por outros pedidos; é necessário conferir novamente antes de confirmar o pagamento.'}</p>}

    {state==='legacy' && <p className="mt-3 text-xs leading-relaxed text-[#756B5D]">Este pedido foi criado antes desta etapa. Não alteramos seu estoque retroativamente.</p>}

    {untracked>0 && <p className="mt-3 rounded-xl bg-[#FBF2E2] p-3 text-xs leading-relaxed text-[#806131]">{untracked} unidade(s) sem quantidade cadastrada no produto ou na variação. A venda fica registrada, mas não existe saldo numérico para baixar nessas peças.</p>}

    {status==='refunded' && state==='debited' && <p className="mt-3 text-xs leading-relaxed text-[#756B5D]">O estorno financeiro não repõe o estoque. Confirme a devolução somente quando as peças estiverem disponíveis para venda novamente.</p>}

    <div className="mt-5 flex flex-wrap gap-3">{commands.map(([command,label])=><button key={command} disabled={busy} className="min-h-[44px] rounded-full border border-[#CFC3B1] px-5 text-sm disabled:opacity-50" onClick={async()=>{
      const question=command==='return'
        ? 'As peças foram recebidas ou ficaram na loja e estão aptas para venda? A confirmação repõe somente as quantidades efetivamente baixadas.'
        : command==='release'
          ? 'Liberar estas peças para outros pedidos? O pedido continuará pendente.'
          : 'Reservar as peças deste pedido por 30 minutos, se houver saldo livre?'

      if(!window.confirm(question))return
      setBusy(true)
      setMessage('')

      try {
        const result=await manageOrderStock(id,version,command)
        setMessage(result.error)
        if(!result.error)router.refresh()
      }catch{
        setMessage('Falha de conexão. Atualize o pedido para conferir o resultado antes de tentar novamente.')
      }finally{
        setBusy(false)
      }
    }}>{busy ? 'Salvando…' : label}</button>)}</div>

    {message && <p role="alert" className="mt-4 text-sm text-[#8B3E2F]">{message}</p>}

    <details className="mt-5 border-t border-[#E5DED3] pt-4"><summary className="cursor-pointer text-xs text-[#756B5D]">Histórico de estoque · últimos 100 movimentos</summary><ol className="mt-4 space-y-4">{events.map(event=><li key={event.id} className="border-l-2 border-[#D6C6AF] pl-4"><p className="text-xs font-medium">{eventLabels[event.kind] || event.kind}</p><p className="mt-1 text-[11px] text-[#81796C]">{saleDate(event.created_at)}</p>{Array.isArray(event.changes) ? event.changes.map((change,index)=><p key={index} className="mt-2 break-words text-xs text-[#756B5D]">{change.entity==='variant' ? 'Variação' : 'Produto'}: {change.name || change.id} · saldo {change.before} → {change.after}</p>) : event.changes.until && <p className="mt-2 text-xs text-[#756B5D]">Prazo: {saleDate(event.changes.until)}</p>}</li>)}</ol>{!events.length && <p className="mt-3 text-xs text-[#81796C]">Nenhuma movimentação automática registrada.</p>}</details>
  </section>
}
