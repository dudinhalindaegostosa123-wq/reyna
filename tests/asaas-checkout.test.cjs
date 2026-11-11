const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const crypto = require('node:crypto')
const id='11111111-1111-4111-8111-111111111111', attempt='22222222-2222-4222-8222-222222222222', lease='33333333-3333-4333-8333-333333333333'
const card={holderName:'Fixture',number:'4111111111111111',expiryMonth:'12',expiryYear:'2035',ccv:'123',holderDocument:'52998224725'}
function fixture({method='pix',paused=false,claimAgain=false,uncertain=false,wrongOwner=false}={}) {
 const calls=[], session={id,state:'pending',environment:'test',totalCents:10000,shippingPending:false,needsReview:false,
  reservedUntil:new Date(Date.now()+10*60*1000).toISOString(),attempts:[],paymentOptions:{selectedMethod:method}}
 const customer={name:'Fixture',email:'fixture@example.test',document:'52998224725',phone:'11999999999'}
 const db={from:()=>({select:()=>({eq:()=>({single:async()=>({data:{customer_snapshot:customer,account_user_id:null,delivery_address:{cep:'18072000',number:'1'}}})})})}),
  rpc:async(name,args)=>{calls.push({name,args});
   if(name==='serenity_asaas_claim_v1')return {data:claimAgain?{submit:false}:{submit:true,lease_id:lease,checkout_id:id,attempt_id:attempt,
    merchant_id:'123',environment:'test',amount_cents:10000,method,currency:'BRL',customer}}
   return {data:{}}
  }}
 const api=load('src/app/pagamento/[id]/actions-asaas.ts',{
  '@/lib/checkout-server':{checkoutDatabase:async()=>db,checkoutHash:s=>{calls.push({name:'hash',input:s});return 'a'.repeat(64)}},
  '@/lib/guest-checkout':{assertPaymentOwner:async()=>{if(wrongOwner)throw Error('CHECKOUT_ACCOUNT_MISMATCH')}},
  '@/lib/checkout-document':{normalizeCheckoutDocument:s=>s},
  '@/lib/checkout-session-server-v2':{readCheckoutSessionV2:async()=>({session,accessHash:'b'.repeat(64)}),checkoutSessionErrorV2:e=>e.message},
  '@/lib/asaas-server':{asaasConfig:()=>{if(paused)throw Error('ASAAS_PAYMENTS_DISABLED');return {environment:'sandbox'}},
   asaasDatabaseEnvironment:()=> 'test',asaasMerchant:async()=> '123',
   createAsaasCustomer:async()=>{calls.push({name:'customerPost'});return 'cus_fixture'},
   createAsaasPayment:async(expected,date,raw)=>{calls.push({name:'chargePost',expected,date,raw});if(uncertain)throw Error('ASAAS_SUBMISSION_UNCERTAIN');return {id:'pay_fixture',state:method==='card'?'approved':'pending'}},
   readAsaasPix:async()=>({payload:'pix-fixture',encodedImage:'dGVzdA==',expirationDate:'2035-01-01 00:00:00'})},
  '@/lib/asaas-checkout-server':{assertAsaasReady:async()=>{},asaasPaymentFacts:(payment,expected)=>({provider:'asaas',method:expected.method}),reconcileAsaasAttempt:async()=>({found:true,review:false})},
  '@/lib/payment-processing-server':{observeCheckoutPayment:async()=>{calls.push({name:'observe'});return {}},paymentFailureCode:e=>e.message},
  'next/headers':{headers:()=>new Headers({'x-forwarded-for':'203.0.113.1'})},'node:net':require('node:net'),
  '@/lib/asaas-card':load('src/lib/asaas-card.ts'),
 },{VERCEL:'1'})
 return {api,calls,session}
}

test('Asaas Pix acquires durable claim and binds customer before creating one charge',async()=>{
 const f=fixture(),r=await f.api.startAsaasCheckoutPayment(id,attempt,'pix',10000)
 assert.equal(r.error,'')
 assert.deepEqual(f.calls.map(c=>c.name),['hash','serenity_asaas_claim_v1','customerPost','serenity_asaas_customer_v1','chargePost','observe','observe'])
 assert.equal(f.calls.filter(c=>c.name==='chargePost').length,1)
})
test('transparent card data is sent once and never enters hash, RPC arguments or session',async()=>{
 const f=fixture({method:'card'}),r=await f.api.startAsaasCheckoutPayment(id,attempt,'card',10000,card)
 assert.equal(r.error,'')
 const remote=f.calls.find(c=>c.name==='chargePost')
 assert.equal(remote.raw.input.number,card.number)
 assert.equal(remote.raw.remoteIp,'203.0.113.1')
 assert.equal(f.calls.filter(c=>c.name==='chargePost').length,1)
 const persisted=f.calls.filter(c=>c.name!=='chargePost')
 assert.equal(JSON.stringify(persisted).includes(card.number),false)
 assert.equal(JSON.stringify(r).includes(card.number),false)
 assert.equal(JSON.stringify(persisted).includes('"ccv"'),false)
})
test('paused configuration, mismatched owner and repeated claims create no remote charge',async()=>{
 for(const options of [{paused:true},{claimAgain:true},{wrongOwner:true}]){
  const f=fixture(options);await f.api.startAsaasCheckoutPayment(id,attempt,'pix',10000)
  assert.equal(f.calls.some(c=>['customerPost','chargePost'].includes(c.name)),false)
 }
})
test('wrong amount/method and invalid card input are rejected before claim',async()=>{
 const f=fixture({method:'card'})
 await f.api.startAsaasCheckoutPayment(id,attempt,'card',1,card)
 await f.api.startAsaasCheckoutPayment(id,attempt,'pix',10000)
 await f.api.startAsaasCheckoutPayment(id,attempt,'card',10000,{...card,ccv:'1'})
 assert.equal(f.calls.some(c=>c.name==='serenity_asaas_claim_v1'),false)
})
test('uncertain provider response marks the lease for review and never retries the POST',async()=>{
 const f=fixture({uncertain:true});const r=await f.api.startAsaasCheckoutPayment(id,attempt,'pix',10000)
 assert.match(r.error,/conferência/)
 assert.equal(f.calls.filter(c=>c.name==='chargePost').length,1)
 assert.equal(f.calls.at(-1).name,'serenity_asaas_uncertain_v1')
 assert.equal(f.calls.at(-1).args.p_lease,lease)
})

function webhook({error=false}={}){
 let calls=0
 const api=load('src/app/api/webhooks/asaas/route.ts',{
  '@/lib/asaas-server':load('src/lib/asaas-server.ts',{'node:crypto':crypto},{ASAAS_WEBHOOK_TOKEN:'fixture-webhook-token-long-enough-32-chars'}),
  '@/lib/mercado-pago-webhook':load('src/lib/mercado-pago-webhook.ts',{'node:crypto':crypto}),
  '@/lib/payment-processing-server':{paymentDatabase:()=>({}),paymentFailureCode:()=> 'PAYMENT_ORDER_REVIEW'},
  '@/lib/asaas-checkout-server':{processAsaasNotification:async(_db,id)=>{calls++;assert.equal(id,'pay_fixture');if(error)throw Error();return {ignored:false}}},
 })
 return {api,calls:()=>calls}
}
const notification=(token,body={event:'PAYMENT_RECEIVED',payment:{id:'pay_fixture',status:'RECEIVED'}})=>new Request('https://store.test/api/webhooks/asaas',{
 method:'POST',headers:{'asaas-access-token':token,'content-type':'application/json'},body:JSON.stringify(body)})
test('webhook authenticates before reading body and never trusts posted approval status',async()=>{
 const f=webhook()
 assert.equal((await f.api.POST(notification('wrong'))).status,401)
 assert.equal(f.calls(),0)
 assert.equal((await f.api.POST(notification('fixture-webhook-token-long-enough-32-chars'))).status,200)
 assert.equal(f.calls(),1)
 assert.equal((await f.api.POST(notification('fixture-webhook-token-long-enough-32-chars',{event:'PAYMENT_RECEIVED',payment:{id:'invalid'}}))).status,400)
})
test('webhook requests redelivery on provider/database/conversion failure and bounds input size',async()=>{
 const token='fixture-webhook-token-long-enough-32-chars',f=webhook({error:true})
 assert.equal((await f.api.POST(notification(token))).status,503)
 assert.equal((await f.api.POST(notification(token,{event:'PAYMENT_RECEIVED',padding:'a'.repeat(20000)}))).status,400)
})

function processing({status='PENDING',amount=100,customer='cus_fixture',mapped=true,missing=false}={}){
 const requests=[],observations=[]
 const row={id:attempt,checkout_id:id,provider:'asaas',environment:'test',merchant_id:'123',method:'pix',amount_cents:10000,
  provider_payment_id:mapped?'pay_fixture':null,asaas_customer_id:'cus_fixture'}
 const remote={id:'pay_fixture',externalReference:id+':'+attempt,customer,value:amount,billingType:'PIX',status,invoiceUrl:'https://sandbox.asaas.com/i/fixture'}
 const server=load('src/lib/asaas-server.ts',{'node:crypto':crypto},{ASAAS_ENVIRONMENT:'sandbox',ASAAS_API_KEY:'$aact_hmlg_fixture',ASAAS_PAYMENTS_ENABLED:'false'},
  {fetch:async(url,init)=>{
   requests.push(init.method)
   if(url.endsWith('/myAccount/accountNumber'))return new Response(JSON.stringify({account:'123'}))
   if(url.endsWith('/pixQrCode'))return new Response(JSON.stringify({payload:'pix-fixture',encodedImage:'dGVzdA==',expirationDate:'2035-01-01 23:59:59'}))
   if(url.includes('/payments?'))return new Response(JSON.stringify({data:missing?[]:[remote],hasMore:false,totalCount:missing?0:1}))
   return new Response(JSON.stringify(remote))
  }})
 const db={from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:row}),maybeSingle:async()=>({data:row})};return q}}
 const api=load('src/lib/asaas-checkout-server.ts',{
  './asaas-server':server,'./payment-processing-server':{observeCheckoutPayment:async(_db,_id,facts)=>{observations.push(facts);return {state:facts.status,application_state:'pending'}}},
 })
 return {api,db,requests,observations}
}
test('authenticated API status wins over a webhook approval claim; pausing does not stop confirmations',async()=>{
 const f=processing()
 await f.api.processAsaasNotification(f.db,'pay_fixture')
 assert.equal(f.observations[0].status,'pending')
 assert.ok(f.observations.every(facts=>facts.customer_id==='cus_fixture'&&facts.provider==='asaas'))
 assert.ok(f.requests.every(method=>method==='GET'))
 const paid=processing({status:'CONFIRMED'})
 await paid.api.processAsaasNotification(paid.db,'pay_fixture')
 assert.equal(paid.observations[0].status,'approved')
})
test('reconciliation rejects foreign customer or amount and missing search results never authorize a POST',async()=>{
 for(const options of [{customer:'cus_other'},{amount:1}]){
  const f=processing(options)
  await assert.rejects(f.api.processAsaasNotification(f.db,'pay_fixture'),/ASAAS_PAYMENT_MISMATCH/)
  assert.equal(f.observations.length,0)
 }
 const f=processing({mapped:false,missing:true})
 const result=await f.api.reconcileAsaasAttempt(f.db,attempt,'admin')
 assert.equal(result.found,false);assert.equal(result.review,true)
 assert.ok(f.requests.every(method=>method==='GET'))
})
