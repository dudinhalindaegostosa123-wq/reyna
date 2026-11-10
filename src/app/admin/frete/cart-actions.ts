'use server'
import { isLabelProviderRejection } from '@/lib/label-provider-errors'
import { revalidatePath } from 'next/cache'
import { scopedLabelDatabase } from '@/lib/label-scope-server'
import type { LabelScope } from '@/lib/label-scope'
import { adminDatabase } from '@/lib/admin-auth'
import { saleUuid } from '@/lib/admin-sales'
import { quoteLabel,loadLabelJobView,labelPayload,labelCartRequest,remoteCart,remotePrice,verifyRemote,labelJobError,rememberLabelRejection } from '@/lib/label-cart-server'
import type { LabelJobView } from '@/lib/label-cart'

type Result={error:string;message?:string;view?:LabelJobView;remoteHint?:string}

export async function labelJobAction(id:string,command:'quote'|'prepare'|'recover',data:FormData,scope:LabelScope='current'):Promise<Result>{
  const {db:rawDb,user}=await adminDatabase()
  const db=scopedLabelDatabase(rawDb,scope)
  if(!saleUuid(id)||!['quote','prepare','recover'].includes(command))return {error:'Operação inválida.'}
  let remoteHint=''
  try{
    if(command==='quote'){
      const agency=String(data.get('agency')||'').trim(),cnae=String(data.get('cnae')||'').replace(/\D/g,'')
      if(agency&&!/^[1-9]\d{0,8}$/.test(agency))return {error:'Informe um ID de agência válido ou deixe vazio.'}
      if(cnae&&!/^\d{7}$/.test(cnae))return {error:'O CNAE deve ter sete números ou ficar vazio.'}
      await quoteLabel(db,id,user.id,user.email||'',{agency,cnae})
      revalidatePath('/admin/etiquetas');revalidatePath('/admin/pedidos/'+id)
      return {error:'',message:'Custo consultado. Selecione o serviço para conferir a preparação.',view:await loadLabelJobView(db,id)}
    }

    const operation=String(data.get('operation')||'')
    if(!saleUuid(operation))return {error:'Confira o custo antes de preparar.'}

    const {data:job,error:jobError}=await db.from('serenity_label_jobs').select('*').eq('order_id',id).single()
    if(jobError)throw jobError
    if(job.operation!==operation)throw new Error('LABEL_STALE')

    if(command==='recover'){
      if(!['creating','uncertain'].includes(job.state))throw new Error('LABEL_JOB_LOCKED')
      const remoteId=String(data.get('remote_id')||'').trim()
      if(!saleUuid(remoteId))return {error:'Informe o ID completo do envio no Melhor Envio.'}

      const response=await labelCartRequest('GET',user.email||'',remoteId)
      verifyRemote(response,remoteId,operation)

      const {error}=await db.rpc('serenity_label_job_finish',{p_order:id,p_operation:operation,p_state:'prepared',p_remote:remoteId,p_price:remotePrice(response),p_actor:user.id})
      if(error)throw error

      revalidatePath('/admin/etiquetas');revalidatePath('/admin/pedidos/'+id)
      return {error:'',message:'Envio existente localizado e vinculado ao pedido.',view:await loadLabelJobView(db,id)}
    }

    const view=await loadLabelJobView(db,id)
    if(view.issues.length)return {error:'Complete as pendências abaixo antes de preparar no Melhor Envio.',view}
    if(view.stale)throw new Error('LABEL_STALE')
    if(!process.env.MELHOR_ENVIO_TOKEN?.trim()||!user.email)throw new Error('LABEL_CONFIG')

    const selected=String(data.get('selected')||'')
    const choice=(job.quotes as unknown[]).find(q=>q&&typeof q==='object'&&'id' in q&&q.id===selected)
    if(!choice)return {error:'Selecione um serviço da cotação atual.'}

    const body=labelPayload(job.context,choice,operation)

    const {error:claimError}=await db.rpc('serenity_label_job_claim',{p_order:id,p_operation:operation,p_selected:selected,p_actor:user.id})
    if(claimError)throw claimError

    try{
      const response=await labelCartRequest('POST',user.email||'',undefined,body),created=remoteCart(response)
      if(!saleUuid(created.id))throw new Error('LABEL_REMOTE_UNKNOWN')
      remoteHint=created.id

      const {error}=await db.rpc('serenity_label_job_finish',{p_order:id,p_operation:operation,p_state:'prepared',p_remote:created.id,p_price:remotePrice(response),p_actor:user.id})
      if(error)throw error
    }catch(error){
      const definitive=isLabelProviderRejection(error)
      await db.rpc('serenity_label_job_finish',{p_order:id,p_operation:operation,p_state:definitive?'rejected':'uncertain',p_remote:null,p_price:null,p_actor:user.id})
      if(definitive) {
        try { await rememberLabelRejection(db,id,operation,job.context,labelJobError(error)) } catch { /* Mantém o erro original visível nesta tentativa. */ }
      }
      throw error
    }

    revalidatePath('/admin/etiquetas');revalidatePath('/admin/pedidos/'+id)
    return {error:'',message:'Envio preparado no carrinho do Melhor Envio. Nenhuma compra foi feita pelo painel.',view:await loadLabelJobView(db,id)}
  }catch(error){
    revalidatePath('/admin/etiquetas');revalidatePath('/admin/pedidos/'+id)
    let view:LabelJobView|undefined
    try{view=await loadLabelJobView(db,id)}catch{}
    return {error:labelJobError(error),view,...(remoteHint?{remoteHint}:{} )}
  }
}
