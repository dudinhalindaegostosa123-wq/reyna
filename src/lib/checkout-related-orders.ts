import 'server-only'
import type {SupabaseClient} from '@supabase/supabase-js'
export interface RelatedContact {
 id:string;token_hash?:string;email?:string;environment?:string;created_at?:string;updated_at?:string;items?:unknown
}
interface RelatedSession {id:string;order_id?:string|null;state:string;environment:string;created_at:string;customer_snapshot?:{email?:string};cart_items?:unknown}
interface RelatedOrder {id:string;number:number|string;status:string}
export interface RelatedPurchase {orderId:string;number:number|string;confidence?:'browser-cart'|'email'}
function cartKey(value:unknown):string|null {
 if(!Array.isArray(value) || !value.length)return null
 const quantities=new Map<string,number>()
 for(const item of value){
  if(!item || typeof item.slug!=='string' || !item.slug || !Number.isSafeInteger(item.quantity) || item.quantity<1)return null
  quantities.set(item.slug,(quantities.get(item.slug) || 0)+item.quantity)
 }
 return JSON.stringify(Array.from(quantities).sort(([a],[b])=>a.localeCompare(b)))
}
export function matchRelatedPurchase(contact:RelatedContact,candidate:RelatedContact,session:RelatedSession,order:RelatedOrder):RelatedPurchase|null {
 const email=(value:unknown)=>typeof value==='string'?value.trim().toLowerCase():''
 if(!/^[a-f0-9]{64}$/.test(contact.token_hash || '') || contact.token_hash!==candidate.token_hash || !email(contact.email) || email(contact.email)!==email(candidate.email))return null
 if(contact.id===candidate.id || session.id!==candidate.id || session.order_id!==order.id || session.state!=='converted' || order.status!=='paid')return null
 if(email(session.customer_snapshot?.email)!==email(contact.email))return null
 if(!contact.environment || candidate.environment!==contact.environment || session.environment!==contact.environment)return null
 const started=Date.parse(contact.created_at || ''),lastActivity=Date.parse(contact.updated_at || ''),next=Date.parse(candidate.created_at || ''),checkout=Date.parse(session.created_at)
 if(![started,lastActivity,next,checkout].every(Number.isFinite) || next<started || checkout<lastActivity || next>started+86400000 || checkout>started+86400000)return null
 const cart=cartKey(contact.items)
 if(!cart || cart!==cartKey(candidate.items) || cart!==cartKey(session.cart_items))return null
 return {orderId:order.id,number:order.number}
}
async function pages<T>(query:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>):Promise<T[]> {
 const rows:T[]=[]
 for(let offset=0;;offset+=500){
  const result=await query(offset,offset+499)
  if(result.error)throw Error('RELATED_LOOKUP')
  rows.push(...(result.data || []))
  if(!result.data || result.data.length<500)return rows
 }
}
export function matchSameEmailPurchase(contact:RelatedContact,session:RelatedSession,order:RelatedOrder):RelatedPurchase|null {
 const email=(value:unknown)=>typeof value==='string'?value.trim().toLowerCase():''
 if(!email(contact.email) || email(contact.email)!==email(session.customer_snapshot?.email) || contact.id===session.id)return null
 if(!contact.environment || session.environment!==contact.environment || session.state!=='converted' || session.order_id!==order.id || order.status!=='paid')return null
 const started=Date.parse(contact.created_at || ''),checkout=Date.parse(session.created_at)
 if(!Number.isFinite(started) || !Number.isFinite(checkout) || checkout<started || checkout>started+86400000)return null
 return {orderId:order.id,number:order.number}
}
export async function readRelatedPurchases(db:Pick<SupabaseClient,'from'>,contacts:RelatedContact[]):Promise<{purchases:Map<string,RelatedPurchase>;error:boolean}> {
 const purchases=new Map<string,RelatedPurchase>()
 const eligible=contacts.filter(row=>row.email?.trim() && Number.isFinite(Date.parse(row.created_at || '')) && row.environment)
 if(!eligible.length)return {purchases,error:false}
 try{
  for(const environment of Array.from(new Set(eligible.map(row=>row.environment!)))){
   const sources=eligible.filter(row=>row.environment===environment)
   const emails=Array.from(new Set(sources.map(row=>row.email!.trim().toLowerCase())))
   const earliest=new Date(Math.min(...sources.map(row=>Date.parse(row.created_at!)))).toISOString()
   const latest=new Date(Math.max(...sources.map(row=>Date.parse(row.created_at!)))+86400000).toISOString()
   const sessions:RelatedSession[]=[]
   for(let offset=0;offset<emails.length;offset+=50){
    sessions.push(...await pages<RelatedSession>((from,to)=>db.from('serenity_checkout_sessions_v2').select('id,order_id,state,environment,created_at,customer_snapshot,cart_items').in('customer_snapshot->>email',emails.slice(offset,offset+50)).eq('environment',environment).eq('state','converted').gte('created_at',earliest).lte('created_at',latest).order('id').range(from,to)))
   }
   const ids=Array.from(new Set(sessions.map(row=>row.id)))
   const candidates:RelatedContact[]=[]
   for(let offset=0;offset<ids.length;offset+=100){
    candidates.push(...await pages<RelatedContact>((from,to)=>db.from('serenity_checkout_contacts_v1').select('id,token_hash,email,items,environment,created_at,updated_at').in('id',ids.slice(offset,offset+100)).eq('environment',environment).order('id').range(from,to)))
   }
   const orderIds=Array.from(new Set(sessions.map(row=>row.order_id).filter((id):id is string=>Boolean(id))))
   const orders:RelatedOrder[]=[]
   for(let offset=0;offset<orderIds.length;offset+=100){
    orders.push(...await pages<RelatedOrder>((from,to)=>db.from('serenity_orders').select('id,number,status').in('id',orderIds.slice(offset,offset+100)).eq('status','paid').order('id').range(from,to)))
   }
   const byContact=new Map(candidates.map(row=>[row.id,row])),byOrder=new Map(orders.map(row=>[row.id,row]))
   sessions.sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at))
   for(const contact of sources){
    let fallback:RelatedPurchase|null=null
    for(const session of sessions){
     const order=session.order_id?byOrder.get(session.order_id):undefined
     if(!order)continue
     const candidate=byContact.get(session.id)
     const strong=candidate?matchRelatedPurchase(contact,candidate,session,order):null
     if(strong){purchases.set(contact.id,{...strong,confidence:'browser-cart'});break}
     fallback ||= matchSameEmailPurchase(contact,session,order)
    }
    if(!purchases.has(contact.id) && fallback)purchases.set(contact.id,{...fallback,confidence:'email'})
   }
  }
  return {purchases,error:false}
 }catch{return {purchases:new Map(),error:true}}
}
