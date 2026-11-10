export interface AnalyticsContext {
  measurementId:string;clientId:string;sessionId:string;capturedAt:number;
  gclid?:string;gbraid?:string;wbraid?:string;
  adUserData?:'granted'|'denied';adPersonalization?:'granted'|'denied';
}
export function analyticsContext(value:unknown,now=Date.now()):AnalyticsContext|null {
  if(!value || typeof value!=='object' || Array.isArray(value))return null
  const v=value as Record<string,unknown>
  if(typeof v.measurementId!=='string' || !/^G-[A-Z0-9]{4,20}$/.test(v.measurementId) || typeof v.clientId!=='string' || !/^\d{1,20}\.\d{1,20}$/.test(v.clientId) || typeof v.sessionId!=='string' || !/^\d{1,20}$/.test(v.sessionId) || typeof v.capturedAt!=='number' || !Number.isSafeInteger(v.capturedAt) || v.capturedAt>now+60000 || v.capturedAt<now-24*60*60*1000)return null
  const out:AnalyticsContext={measurementId:v.measurementId,clientId:v.clientId,sessionId:v.sessionId,capturedAt:v.capturedAt}
  for(const key of ['gclid','gbraid','wbraid'] as const)if(typeof v[key]==='string' && /^[A-Za-z0-9_-]{1,256}$/.test(v[key]))out[key]=v[key]
  for(const key of ['adUserData','adPersonalization'] as const)if(v[key]==='granted' || v[key]==='denied')out[key]=v[key]
  return out
}
export type AnalyticsCartItem={productId:string;variationId?:string;name:string;price:number;quantity:number;variantKey?:string;variants?:Record<string,string>}
export function analyticsItems(items:AnalyticsCartItem[]) {
  return items.filter(item=>item && /^[A-Za-z0-9_-]{1,100}$/.test(item.variationId || item.productId) && Number.isFinite(item.price) && item.price>=0 && Number.isSafeInteger(item.quantity) && item.quantity>0).slice(0,100).map(item=>({item_id:item.variationId || item.productId,item_name:item.name.slice(0,180),price:Math.round(item.price*100)/100,quantity:item.quantity}))
}
export function addedCartItems(before:AnalyticsCartItem[],after:AnalyticsCartItem[]) {
  const totals=(items:AnalyticsCartItem[])=>{const map=new Map<string,number>();for(const item of items){const key=item.productId+':'+(item.variationId || '');map.set(key,(map.get(key) || 0)+item.quantity)}return map}
  const previous=totals(before),next=totals(after),added:AnalyticsCartItem[]=[]
  for(const [key,total] of Array.from(next.entries())){const delta=total-(previous.get(key) || 0);if(delta<=0)continue;const item=after.find(item=>item.productId+':'+(item.variationId || '')===key)!;added.push({...item,quantity:delta})}
  return added
}
export function safeAnalyticsLocation(input:string) {
  const url=new URL(input)
  const path=url.pathname.replace(/^\/pagamento\/[^/]+/,'/pagamento')
  const allowed=new URLSearchParams()
  for(const key of ['gclid','gbraid','wbraid','utm_source','utm_medium','utm_campaign','utm_content','utm_term']){
    const value=url.searchParams.get(key)
    if(value && /^[A-Za-z0-9_. -]{1,256}$/.test(value))allowed.set(key,value)
  }
  return url.origin+path+(allowed.size?'?'+allowed.toString():'')
}
