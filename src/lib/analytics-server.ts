import 'server-only'
import type {SupabaseClient} from '@supabase/supabase-js'
import {analyticsContext} from './analytics-model'
export const GA4_MEASUREMENT_ID=process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim() || ''
export async function captureCheckoutAnalytics(db:SupabaseClient,id:string,hash:string,input:unknown){
 const context=analyticsContext(input)
 if(!context || context.measurementId!==(process.env.SERENITY_GA4_MEASUREMENT_ID || GA4_MEASUREMENT_ID))return
 try{const result=await db.rpc('serenity_analytics_capture_v1',{p_checkout:id,p_access_hash:hash,p_context:context}).abortSignal(AbortSignal.timeout(1500));if(result.error)console.error('[analytics]',{code:'ANALYTICS_CAPTURE_UNAVAILABLE'})}catch{console.error('[analytics]',{code:'ANALYTICS_CAPTURE_UNAVAILABLE'})}
}
export interface AnalyticsJob {order_id:string;measurement_id:string;context:Record<string,string>;payload:{subtotal:number;discount:number;shipping:number;total:number;items:{item_id:string;name:string;quantity:number;unit_price:number}[]};occurred_at:string;lease_id:string}
export function measurementPayload(job:AnalyticsJob){
 const cents=(v:unknown)=>{const n=Number(v);if(!Number.isFinite(n) || n<0 || !Number.isSafeInteger(Math.round(n*100)))throw Error('ANALYTICS_AMOUNT');return Math.round(n*100)}
 if(!/^\d{1,20}\.\d{1,20}$/.test(job.context.clientId) || !Number.isSafeInteger(Number(job.context.sessionId)) || Number(job.context.sessionId)<=0 || !/^G-[A-Z0-9]{4,20}$/.test(job.measurement_id))throw Error('ANALYTICS_CONTEXT')
 const subtotal=cents(job.payload.subtotal),discount=cents(job.payload.discount),shipping=cents(job.payload.shipping),total=cents(job.payload.total)
 if(discount>subtotal || subtotal-discount+shipping!==total || !Array.isArray(job.payload.items) || !job.payload.items.length || job.payload.items.length>100)throw Error('ANALYTICS_AMOUNT')
 let allocated=0,cumulative=0
 const lines=job.payload.items.flatMap(item=>{
  if(!Number.isSafeInteger(item.quantity) || item.quantity<1 || item.quantity>999 || typeof item.name!=='string' || !item.item_id)throw Error('ANALYTICS_ITEMS')
  const gross=cents(item.unit_price)*item.quantity;cumulative+=gross
  const next=subtotal?Math.round(cumulative*discount/subtotal):0
  const net=gross-(next-allocated);allocated=next
  if(net<0)throw Error('ANALYTICS_AMOUNT')
  const unit=Math.floor(net/item.quantity),remainder=net%item.quantity
  const base={item_id:String(item.item_id).slice(0,100),item_name:item.name.slice(0,180)}
  return [...(item.quantity-remainder?[{...base,price:unit/100,quantity:item.quantity-remainder}]:[]),...(remainder?[{...base,price:(unit+1)/100,quantity:remainder}]:[])]
 })
 if(cumulative!==subtotal || lines.length>200)throw Error('ANALYTICS_AMOUNT')
 const consent:Record<string,string>={}
 if(job.context.adUserData==='denied')consent.ad_user_data='DENIED'
 if(job.context.adPersonalization==='denied')consent.ad_personalization='DENIED'
 const timestamp=Date.parse(job.occurred_at)*1000;if(!Number.isSafeInteger(timestamp))throw Error('ANALYTICS_DATE')
 return {client_id:job.context.clientId,timestamp_micros:timestamp,...(Object.keys(consent).length?{consent}:{}),events:[{name:'purchase',params:{transaction_id:job.order_id,currency:'BRL',value:(subtotal-discount)/100,shipping:shipping/100,session_id:Number(job.context.sessionId),engagement_time_msec:1,items:lines}}]}
}
export async function drainAnalytics(db:SupabaseClient){
 if(process.env.VERCEL_ENV!=='production' || process.env.SERENITY_GA4_SERVER_ENABLED!=='true')return {skipped:true,sent:0,failed:0}
 const secret=process.env.SERENITY_GA4_API_SECRET?.trim(),measurement=process.env.SERENITY_GA4_MEASUREMENT_ID || GA4_MEASUREMENT_ID
 if(!secret || !/^[A-Za-z0-9_-]{10,200}$/.test(secret) || !/^G-[A-Z0-9]{4,20}$/.test(measurement))throw Error('ANALYTICS_CONFIGURATION')
 const claim=await db.rpc('serenity_analytics_claim_v1',{p_limit:3});if(claim.error || !Array.isArray(claim.data))throw Error('ANALYTICS_DATABASE')
 let sent=0,failed=0
 for(const job of claim.data as AnalyticsJob[]){
  let state='review',code:string|null='ANALYTICS_DELIVERY_UNCERTAIN'
  try{
   if(job.measurement_id!==measurement)throw Error('ANALYTICS_PROPERTY_MISMATCH')
   const body=measurementPayload(job)
   const response=await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurement)}&api_secret=${encodeURIComponent(secret)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(5000),cache:'no-store'})
   if(response.ok){state='sent';code=null;sent++}
   else if(response.status===429 || response.status>=500){state='pending';code='ANALYTICS_HTTP_RETRY';failed++}
   else{state='blocked';code='ANALYTICS_HTTP_REJECTED';failed++}
  }catch(error){
   const message=error && typeof error==='object' && 'message' in error?String(error.message):''
   if(/^ANALYTICS_[A-Z_]+$/.test(message)){state='blocked';code=message}
   failed++
  }
  const result=await db.rpc('serenity_analytics_finish_v1',{p_order:job.order_id,p_lease:job.lease_id,p_state:state,p_error:code});if(result.error || result.data!==true)throw Error('ANALYTICS_DATABASE')
 }
 return {sent,failed}
}
