import { initializeGoogleAds } from './google-ads'
import { analyticsContext,analyticsItems,type AnalyticsContext,type AnalyticsCartItem,safeAnalyticsLocation } from './analytics-model'
type Target=Window & {gtag?:(...args:unknown[])=>void;dataLayer?:unknown[]}
let measurementId:string|null=null
const configured=new Set<string>()
export function configureGoogleAnalytics(value:string|null,enabled:boolean){
  measurementId=enabled && value && /^G-[A-Z0-9]{4,20}$/.test(value)?value:null
  if(!measurementId || typeof window==='undefined')return
  initializeGoogleAds()
  if(!configured.has(measurementId)){
    ;(window as Target).gtag!('config',measurementId,{send_page_view:false})
    configured.add(measurementId)
  }
}
export function trackAnalyticsPage(){
  if(!measurementId || typeof window==='undefined')return
  try{(window as Target).gtag?.('event','page_view',{send_to:measurementId,page_location:safeAnalyticsLocation(window.location.href)})}catch{}
}
export function trackCartEvent(event:'add_to_cart'|'view_cart'|'begin_checkout',items:AnalyticsCartItem[]){
  if(!measurementId || typeof window==='undefined')return false
  const lines=analyticsItems(items);if(!lines.length)return false
  try{(window as Target).gtag?.('event',event,{send_to:measurementId,currency:'BRL',value:Math.round(lines.reduce((sum,item)=>sum+Math.round(item.price*100)*item.quantity,0))/100,items:lines});return true}catch{return false}
}
function consent(){
 const state:Record<string,string>={}
 for(const entry of (window as Target).dataLayer || []){
  if(!entry || typeof entry!=='object')continue
  const args=Array.from(entry as ArrayLike<unknown>)
  if(args[0]!=='consent' || !['default','update'].includes(String(args[1])) || !args[2] || typeof args[2]!=='object')continue
  for(const [key,value] of Object.entries(args[2]))if(value==='granted' || value==='denied')state[key]=value
 }
 return state
}
export async function checkoutAnalyticsContext():Promise<AnalyticsContext|null>{
 if(!measurementId || typeof window==='undefined' || !(window as Target).gtag)return null
 const state=consent();if(state.analytics_storage==='denied')return null
 const id=measurementId
 const get=(field:string)=>new Promise<string|null>(resolve=>{let done=false;const timer=setTimeout(()=>{if(!done){done=true;resolve(null)}},500);try{(window as Target).gtag!('get',id,field,(value:unknown)=>{if(done)return;done=true;clearTimeout(timer);resolve(typeof value==='string' || typeof value==='number'?String(value):null)})}catch{clearTimeout(timer);resolve(null)}})
 const [clientId,sessionId]=await Promise.all([get('client_id'),get('session_id')])
 if(consent().analytics_storage==='denied')return null
 const captured:Record<string,unknown>={measurementId:id,clientId,sessionId,capturedAt:Date.now(),adUserData:state.ad_user_data,adPersonalization:state.ad_personalization}
 try{
  const query=new URL(window.location.href).searchParams
  for(const key of ['gclid','gbraid','wbraid']){
   const incoming=query.get(key)
   if(incoming && /^[A-Za-z0-9_-]{1,256}$/.test(incoming))window.sessionStorage.setItem('serenity:'+key,incoming)
   const stored=window.sessionStorage.getItem('serenity:'+key);if(stored)captured[key]=stored
  }
 }catch{}
 return analyticsContext(captured)
}
export function rememberAdClick(){
 if(!measurementId || typeof window==='undefined' || consent().analytics_storage==='denied')return
 try{const query=new URL(window.location.href).searchParams;for(const key of ['gclid','gbraid','wbraid']){const value=query.get(key);if(value && /^[A-Za-z0-9_-]{1,256}$/.test(value))window.sessionStorage.setItem('serenity:'+key,value)}}catch{}
}
