export interface CheckoutContactItem { name:string; slug:string; quantity:number }
export interface CheckoutContact {
 id:string; token:string; name:string; email:string; items:CheckoutContactItem[]; estimatedCents:number; phone?:string
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function checkoutPhone(value:unknown):string {
 if(typeof value!=='string' || value.length>40)return ''
 const digits=value.replace(/\D/g,'')
 if(/^[1-9]\d{9,10}$/.test(digits))return '55'+digits
 return /^55[1-9]\d{9,10}$/.test(digits)?digits:''
}
export function checkoutContact(input:unknown):CheckoutContact|null {
 if(!input || typeof input!=='object')return null
 const value=input as Record<string,unknown>
 if(typeof value.id!=='string' || !uuid.test(value.id) || typeof value.token!=='string' || !uuid.test(value.token))return null
 if(typeof value.name!=='string' || typeof value.email!=='string')return null
 const name=value.name.trim().replace(/\s+/g,' '),email=value.email.trim().toLowerCase()
 if(name.length<2 || name.length>180 || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return null
 if(!Array.isArray(value.items) || !value.items.length || value.items.length>100 || !Number.isSafeInteger(value.estimatedCents) || Number(value.estimatedCents)<0 || Number(value.estimatedCents)>10000000000)return null
 const items:CheckoutContactItem[]=[]
 for(const item of value.items){
  if(!item || typeof item.name!=='string' || item.name.length>180 || !item.name.trim() || typeof item.slug!=='string' || item.slug.length>250 || !Number.isSafeInteger(item.quantity) || item.quantity<1 || item.quantity>9999)return null
  items.push({name:item.name.trim(),slug:item.slug,quantity:item.quantity})
 }
 const phone=checkoutPhone(value.phone)
 return {id:value.id,token:value.token,name,email,items,estimatedCents:Number(value.estimatedCents),...(phone?{phone}:{})}
}
export function checkoutContactStatus(row:{lastActivity:string;state?:string|null;orderId?:string|null;needsReview?:boolean;paymentState?:string|null;expiresAt?:string|null;testApproved?:boolean},now=Date.now()) {
 if(row.testApproved)return 'Aprovado em teste'
 if(row.needsReview || row.state==='review')return 'Em conferência'
 if(row.state==='converted' && row.orderId)return 'Compra concluída'
 if(row.paymentState==='approved')return 'Pagamento aprovado — conferir pedido'
 if(row.paymentState==='uncertain' || row.paymentState==='submitting')return 'Pagamento em conferência'
 if(row.paymentState==='refunded' || row.paymentState==='charged_back')return 'Pagamento estornado ou contestado'
 if(row.paymentState==='rejected')return 'Pagamento recusado'
 if(row.state==='cancelled')return 'Checkout cancelado'
 if(row.state==='expired' || (row.expiresAt && Date.parse(row.expiresAt)<=now))return 'Prazo do checkout encerrado'
 if(row.state==='payment_pending')return 'Aguardando pagamento'
 if(row.state)return 'Checkout iniciado — sem compra confirmada'
 return now-Date.parse(row.lastActivity)>=30*60*1000?'Possível abandono — sem pagamento iniciado':'Preenchendo dados'
}
