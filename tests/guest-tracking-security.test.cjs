const {test}=require('node:test')
const assert=require('node:assert/strict')
const crypto=require('node:crypto')
const {load}=require('./helpers/load.cjs')
const id='11111111-1111-4111-8111-111111111111'
const secret='random-fixture-secret-only-used-in-tests-0123456789'
function fixture(){
 const written=[]
 const api=load('src/lib/guest-tracking-server.ts',{
  'node:crypto':crypto,'next/headers':{cookies:()=>({get:()=>written.length?{value:written.at(-1)[1]}:undefined,set:(...args)=>written.push(args)})},
  './mercado-pago-server':{mercadoPagoConfig:()=>({environment:'production'})},
 },{SERENITY_GUEST_TRACKING_SECRET:secret,NODE_ENV:'production'})
 return {api,written}
}
test('tracking capability is secret-derived, purpose-separated, hashed in DB, scoped HttpOnly and not tied to an email lookup',async()=>{
 const {api,written}=fixture(),token=api.guestToken(id)
 assert.match(token,/^[a-f0-9]{64}$/)
 assert.notEqual(token,id.replaceAll('-','').repeat(2))
 const calls=[]
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:77,error:null}}}
 await api.registerGuestCheckout(db,id,'a'.repeat(64))
 assert.equal(calls[0].name,'serenity_guest_register_v1')
 assert.equal(calls[0].args.p_token_hash,crypto.createHash('sha256').update(token).digest('hex'))
 assert.notEqual(calls[0].args.p_token_hash,token)
 assert.equal(written[0][2].httpOnly,true);assert.equal(written[0][2].secure,true)
 assert.equal(written[0][2].path,'/acompanhar')
 assert.equal(JSON.stringify(calls).includes(secret),false)
 const missing=load('src/lib/guest-tracking-server.ts',{'node:crypto':crypto,'next/headers':{},'./mercado-pago-server':{}})
 assert.throws(()=>missing.guestToken(id),/GUEST_TRACKING_CONFIGURATION/)
})
test('tracking output is allowlisted and invalid tokens do not touch the database',async()=>{
 const {api}=fixture();let calls=0
 const db={rpc:async()=>{calls++;return {data:{number:77,status:'paid',total:133.89,created_at:new Date().toISOString(),environment:'production',carrier:'posted',tracking_code:'ABC',document:'PRIVATE',email:'private@example.com',provider_payment_id:'PRIVATE'}}}}
 assert.equal(await api.readGuestTracking(db,'bad'),null);assert.equal(calls,0)
 const result=await api.readGuestTracking(db,api.guestToken(id))
 assert.equal(result.number,77);assert.equal(result.trackingCode,'ABC')
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|example.com/)
})
test('mail links use a private fragment and refuse revoked, expired or mismatched capabilities',async()=>{
 const {api}=fixture();const token=api.guestToken(id)
 let row={token_hash:api.guestTokenHash(token),expires_at:new Date(Date.now()+86400000).toISOString(),revoked:false}
 const db={from:()=>{const q={select(){return q},eq(){return q},single:async()=>({data:row,error:null})};return q}}
 const link=await api.guestEmailLink(db,id)
 assert.equal(new URL(link).search,'');assert.equal(new URL(link).hash,'#'+token)
 row={...row,revoked:true};await assert.rejects(api.guestEmailLink(db,id),/GUEST_EMAIL_LINK_UNAVAILABLE/)
 row={...row,revoked:false,token_hash:'0'.repeat(64)};await assert.rejects(api.guestEmailLink(db,id),/GUEST_EMAIL_LINK_UNAVAILABLE/)
 row={...row,expires_at:new Date(0).toISOString()};await assert.rejects(api.guestEmailLink(db,id),/GUEST_EMAIL_LINK_UNAVAILABLE/)
})
test('guest ownership fallback never grants wholesale rights or bypasses a signed-in checkout owner',async()=>{
 let state='unconfirmed'
 const access=load('src/lib/guest-checkout.ts',{'./wholesale-server':{readWholesaleAccess:async()=>{if(state==='unconfirmed')throw new Error('WHOLESALE_EMAIL');if(state==='configuration')throw new Error('WHOLESALE_CONFIGURATION');return {userId:'owner',rules:{active:true}}}}},{SERENITY_GUEST_CHECKOUT_ENABLED:'true'})
 assert.equal((await access.optionalCheckoutAccess()).userId,null)
 assert.equal((await access.optionalCheckoutAccess()).rules,null)
 await access.assertPaymentOwner(null,{})
 await assert.rejects(access.assertPaymentOwner('owner',{}),/WHOLESALE_EMAIL/)
 state='configuration';await assert.rejects(access.optionalCheckoutAccess(),/WHOLESALE_CONFIGURATION/)
 state='valid';assert.equal((await access.optionalCheckoutAccess()).rules.active,true)
 await assert.rejects(access.assertPaymentOwner('other',{}),/CHECKOUT_ACCOUNT_MISMATCH/)
 await access.assertPaymentOwner('owner',{})
 await assert.rejects(access.assertPaymentOwner(undefined,{}),/CHECKOUT_ACCOUNT_MISMATCH/)
})
