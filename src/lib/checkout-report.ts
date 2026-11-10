import 'server-only'
import type {SupabaseClient} from '@supabase/supabase-js'
import {readRelatedPurchases,type RelatedPurchase} from '@/lib/checkout-related-orders'
import {checkoutContactStatus,checkoutPhone} from '@/lib/checkout-contact'
export interface CheckoutReportFilters {ambiente?:string;numero?:string;concluidos?:string;tentativa?:string}
interface ReportQuery<T> {
 range:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>
 limit:(count:number)=>PromiseLike<{data:T[]|null;error:unknown}>
 gt:(column:string,value:string)=>ReportQuery<T>
}
async function readRows<T>(query:ReportQuery<T>,all:boolean){
 if(!all)return query.limit(100)
 const data:T[]=[]
 let cursor=''
 for(;;){
  const page=await query.range(0,499)
  if(page.error)return {data:[] as T[],error:page.error}
  data.push(...(page.data || []))
  if(!page.data || page.data.length<500)return {data,error:null}
  const last=page.data[page.data.length-1] as {id?:unknown}
  if(typeof last.id!=='string' || last.id<=cursor)throw Error('CHECKOUT_EXPORT_CURSOR')
  cursor=last.id
  query=query.gt('id',cursor)
 }
}
export async function readCheckoutReport(db:SupabaseClient,searchParams:CheckoutReportFilters={},all=false){
 const environment=searchParams.ambiente==='test'?'test':'production'
 const number=typeof searchParams.numero==='string' && /^\d{1,16}$/.test(searchParams.numero)?searchParams.numero:''
 let requestedId=typeof searchParams.tentativa==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(searchParams.tentativa)?searchParams.tentativa:undefined
 if(number){
  const lookup=await db.from('serenity_guest_access_v1').select('checkout_id').eq('number',number).maybeSingle()
  if(lookup.error)throw Error('CHECKOUT_NUMBER_LOOKUP')
  requestedId=lookup.data?.checkout_id || '00000000-0000-4000-8000-000000000000'
 }
 let contactQuery=db.from('serenity_checkout_contacts_v1').select('id,name,email,phone,token_hash,items,estimated_cents,environment,created_at,updated_at').eq('environment',environment).order(all?'id':'updated_at',{ascending:all}).order('id')
 let sessionQuery=db.from('serenity_checkout_sessions_v2').select('id,state,environment,customer_snapshot,order_items,total_cents,created_at,updated_at,expires_at,order_id').eq('environment',environment).order(all?'id':'updated_at',{ascending:all}).order('id')
 if(requestedId){contactQuery=contactQuery.eq('id',requestedId);sessionQuery=sessionQuery.eq('id',requestedId)}
 const [contacts,sessions]=await Promise.all([readRows(contactQuery,all),readRows(sessionQuery,all)])
 const contactRows=contacts.data || [],sessionMap=new Map((sessions.data || []).map(row=>[row.id,row]))
 // Contacts can predate the latest 100 sessions; always read their exact payment context too.
 const ids=contactRows.map(row=>row.id).filter(id=>!sessionMap.has(id))
 let extraError=false
 for(let offset=0;offset<ids.length;offset+=100){
  const extra=await readRows(db.from('serenity_checkout_sessions_v2').select('id,state,environment,customer_snapshot,order_items,total_cents,created_at,updated_at,expires_at,order_id').in('id',ids.slice(offset,offset+100)).eq('environment',environment).order('id'),true)
  extraError ||= Boolean(extra.error);for(const row of extra.data || [])sessionMap.set(row.id,row)
 }
 const allIds=Array.from(new Set([...contactRows.map(row=>row.id),...Array.from(sessionMap.keys())]))
 const blocks=Array.from({length:Math.ceil(allIds.length/100)},(_,index)=>allIds.slice(index*100,index*100+100))
 const details=await Promise.all(blocks.map(async ids=>{
  const [numbers,payments]=await Promise.all([
   db.from('serenity_guest_access_v1').select('checkout_id,number').in('checkout_id',ids),
   db.from('serenity_checkout_payments_v2').select('checkout_id,state,application_state,created_at').in('checkout_id',ids).order('created_at',{ascending:false}),
  ])
  return {numbers,payments}
 }))
 const numbers={data:details.flatMap(block=>block.numbers.data || []),error:details.some(block=>block.numbers.error)}
 const payments={data:details.flatMap(block=>block.payments.data || []),error:details.some(block=>block.payments.error)}
 const reserved=new Map((numbers.data || []).map(row=>[row.checkout_id,row.number]))
 const paymentMap=new Map<string,{state:string;application_state:string}>()
 for(const payment of payments.data || [])if(!paymentMap.has(payment.checkout_id))paymentMap.set(payment.checkout_id,payment)
 const contextError=Boolean(sessions.error || extraError || payments.error)
 const byContact=new Map(contactRows.map(row=>[row.id,row]))
 const related=contextError?{purchases:new Map<string,RelatedPurchase>(),error:false}:await readRelatedPurchases(db,contactRows.filter(row=>!sessionMap.has(row.id)))
 const rows=allIds.map(id=>{
  const contact=byContact.get(id),session=sessionMap.get(id),payment=paymentMap.get(id)
  const customer=session?.customer_snapshot as {name?:string;email?:string;phone?:string}|undefined
  const lastActivity=contact?.updated_at || session?.updated_at || session?.created_at
  const relatedPurchase=related.purchases.get(id)
  const status=relatedPurchase?.confidence==='email'?'Compra paga encontrada para este e-mail — conferir tentativa':relatedPurchase?'Possível tentativa anterior — compra concluída':related.error && !session?'Contato sem checkout — compra relacionada não conferida':contextError?'Situação indisponível — conferir pagamentos':checkoutContactStatus({lastActivity,state:session?.state,orderId:session?.order_id,expiresAt:session?.expires_at,paymentState:payment?.state,needsReview:payment?.application_state==='review'})
  return {id,relatedPurchase,name:customer?.name || contact?.name || 'Nome não informado',email:customer?.email || contact?.email || '',phone:checkoutPhone(customer?.phone || contact?.phone),lastActivity,status,number:reserved.get(id),orderId:session?.order_id,items:(session?.order_items || contact?.items || []) as {name?:string;quantity?:number}[],total:session?.total_cents ?? contact?.estimated_cents ?? 0,estimated:!session}
 }).filter(row=>Boolean(requestedId) || searchParams.concluidos==='1' || row.status!=='Compra concluída').sort((a,b)=>Date.parse(b.lastActivity)-Date.parse(a.lastActivity))
 return {environment,number,requestedId,rows,contactError:Boolean(contacts.error),contextError,numberError:Boolean(numbers.error),relatedError:related.error}
}
