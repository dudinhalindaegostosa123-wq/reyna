const {test}=require('node:test')
const assert=require('node:assert/strict')
const crypto=require('node:crypto')
const {load}=require('./helpers/load.cjs')
const expected={checkoutId:'11111111-1111-4111-8111-111111111111',attemptId:'22222222-2222-4222-8222-222222222222',customerId:'cus_fixture',amountCents:12345,method:'pix',environment:'sandbox'}
const env={ASAAS_ENVIRONMENT:'sandbox',ASAAS_API_KEY:'$aact_hmlg_format_fixture_not_a_credential',ASAAS_PAYMENTS_ENABLED:'true',ASAAS_WEBHOOK_TOKEN:'local-webhook-test-fixture-32-characters'}
const payment=(changes={})=>({id:'pay_fixture',customer:expected.customerId,value:123.45,billingType:'PIX',externalReference:expected.checkoutId+':'+expected.attemptId,status:'PENDING',invoiceUrl:'https://sandbox.asaas.com/i/fixture',...changes})
function client(fetch=async()=>{throw Error('Unexpected request')},changes={}){return load('src/lib/asaas-server.ts',{'node:crypto':crypto},{...env,...changes},{fetch})}
const response=(body,status=200)=>new Response(JSON.stringify(body),{status})

test('configuration separates environments and production is disabled without deployment/webhook setup',()=>{
 assert.equal(client().asaasConfig().baseUrl,'https://api-sandbox.asaas.com/v3')
 assert.throws(()=>client(undefined,{ASAAS_ENVIRONMENT:'production'}).asaasConfig(),/ENVIRONMENT_MISMATCH/)
 assert.throws(()=>client(undefined,{ASAAS_ENVIRONMENT:'production',ASAAS_API_KEY:'$aact_prod_format_fixture'}).asaasConfig(),/PRODUCTION_CONFIGURATION/)
 assert.throws(()=>client(undefined,{ASAAS_PAYMENTS_ENABLED:'false'}).asaasConfig(true),/PAYMENTS_DISABLED/)
 assert.equal(client(undefined,{ASAAS_PAYMENTS_ENABLED:'false'}).asaasConfig(false).environment,'sandbox')
})

test('webhook comparison rejects missing, wrong and oversized tokens',()=>{
 const c=client()
 assert.equal(c.verifyAsaasWebhookToken(null),false)
 assert.equal(c.verifyAsaasWebhookToken('wrong'),false)
 assert.equal(c.verifyAsaasWebhookToken('x'.repeat(1025)),false)
 assert.equal(c.verifyAsaasWebhookToken(env.ASAAS_WEBHOOK_TOKEN),true)
 assert.equal(client(undefined,{ASAAS_WEBHOOK_TOKEN:'short'}).verifyAsaasWebhookToken('short'),false)
})

test('payment validation checks amount, customer, method and both checkout/attempt references',()=>{
 const c=client()
 assert.equal(c.normalizeAsaasPayment(payment(),expected).state,'pending')
 for(const changes of [{value:123.46},{customer:'cus_other'},{billingType:'CREDIT_CARD'},{externalReference:expected.checkoutId},{id:'1234'},{value:'123.451'}]){
  assert.throws(()=>c.normalizeAsaasPayment(payment(changes),expected),/ASAAS_(PAYMENT_MISMATCH|AMOUNT_INVALID)/)
 }
 assert.throws(()=>c.normalizeAsaasPayment(payment(),{...expected,environment:'production'}),/ENVIRONMENT_MISMATCH/)
})

test('only authenticated API facts for confirmed/received payments qualify as approved',()=>{
 const c=client()
 for(const status of ['CONFIRMED','RECEIVED'])assert.equal(c.normalizeAsaasPayment(payment({status}),expected).state,'approved')
 for(const status of ['RECEIVED_IN_CASH','REFUND_REQUESTED','CHARGEBACK_DISPUTE','unknown'])assert.equal(c.normalizeAsaasPayment(payment({status}),expected).state,'review')
 assert.equal(c.normalizeAsaasPayment(payment({status:'RECEIVED',refunds:[{value:1}]}),expected).state,'review')
 assert.equal(c.normalizeAsaasPayment(payment({status:'RECEIVED',deleted:true}),expected).state,'review')
 assert.equal(c.normalizeAsaasPayment(payment({status:'REFUNDED'}),expected).state,'refunded')
})

test('hosted card page must belong to the correct Asaas environment',()=>{
 const c=client()
 const card={...expected,method:'card'}
 assert.equal(c.normalizeAsaasPayment(payment({billingType:'CREDIT_CARD'}),card).method,'card')
 assert.equal(c.normalizeAsaasPayment(payment({billingType:'CREDIT_CARD',invoiceUrl:null,status:'CONFIRMED'}),card).state,'approved')
 for(const invoiceUrl of ['https://attacker.example/i/fixture','https://sandbox.asaas.com.attacker.example/i/a','http://sandbox.asaas.com/i/a','https://user:pass@sandbox.asaas.com/i/a','https://www.asaas.com/i/fixture','https://sandbox.asaas.com:444/i/a']){
  assert.throws(()=>c.normalizeAsaasPayment(payment({invoiceUrl}),expected),/INVOICE_URL_INVALID/)
 }
})

test('creates one charge with server-supplied cents and references; never transmits card fields',async()=>{
 const calls=[]
 const c=client(async(url,init)=>{calls.push({url,init});return response(payment())})
 const result=await c.createAsaasPayment(expected,'2030-01-20')
 assert.equal(result.id,'pay_fixture')
 assert.equal(calls.length,1)
 assert.equal(calls[0].url,'https://api-sandbox.asaas.com/v3/payments')
 assert.equal(calls[0].init.redirect,'error')
 const body=JSON.parse(calls[0].init.body)
 assert.equal(body.value,123.45)
 assert.equal(body.externalReference,expected.checkoutId+':'+expected.attemptId)
 assert.equal(body.billingType,'PIX')
 assert.equal(body.creditCard,undefined)
 assert.equal(calls[0].init.headers.access_token,env.ASAAS_API_KEY)
})

test('network uncertainty and malformed successful responses never retry charge creation',async()=>{
 for(const fetch of [async()=>{throw Error('network')},async()=>response({unexpected:'body'}),async()=>new Response('invalid json')]){
  let count=0
  const c=client(async(...args)=>{count++;return fetch(...args)})
  await assert.rejects(c.createAsaasPayment(expected,'2030-01-20'),/ASAAS_SUBMISSION_UNCERTAIN/)
  assert.equal(count,1)
 }
})

test('HTTP errors do not expose credentials or buyer data and do not retry',async()=>{
 let count=0
 const c=client(async()=>{count++;return response({sensitive:'buyer details '+env.ASAAS_API_KEY},403)})
 await assert.rejects(c.createAsaasPayment(expected,'2030-01-20'),error=>error.message==='ASAAS_HTTP_403')
 assert.equal(count,1)
})

test('invalid due date and disabled creation make no requests',async()=>{
 await assert.rejects(client().createAsaasPayment(expected,'2030-02-31'),/DUE_DATE_INVALID/)
 await assert.rejects(client(undefined,{ASAAS_PAYMENTS_ENABLED:'false'}).createAsaasPayment(expected,'2030-01-20'),/PAYMENTS_DISABLED/)
})

test('read rejects provider ID changes and validates expected environment before the request',async()=>{
 await assert.rejects(client(async()=>response(payment({id:'pay_other'}))).readAsaasPayment('pay_fixture',expected),/PAYMENT_MISMATCH/)
 await assert.rejects(client().readAsaasPayment('pay_fixture',{...expected,environment:'production'}),/ENVIRONMENT_MISMATCH/)
})

test('reconciliation searches the attempt reference and never creates a replacement payment',async()=>{
 const calls=[]
 const c=client(async(url,init)=>{calls.push({url,init});return response({data:[],hasMore:false,totalCount:0})})
 assert.equal(await c.findAsaasPayment(expected),null)
 assert.equal(calls.length,1)
 assert.equal(calls[0].init.method,'GET')
 assert.equal(new URL(calls[0].url).searchParams.get('externalReference'),expected.checkoutId+':'+expected.attemptId)
 assert.equal((await client(async()=>response({data:[payment()],hasMore:false,totalCount:1})).findAsaasPayment(expected)).id,'pay_fixture')
 for(const result of [{data:[payment(),payment()],totalCount:2},{data:[payment()],hasMore:true},{data:[payment()],totalCount:3}]){
  await assert.rejects(client(async()=>response(result)).findAsaasPayment(expected),/RECONCILE_CONFLICT/)
 }
})

test('Pix QR request follows payment identity validation and validates returned QR data',async()=>{
 const urls=[]
 const c=client(async url=>{urls.push(url);return response(url.endsWith('/pixQrCode')?{payload:'pix-fixture',encodedImage:'aGVsbG8=',expirationDate:'2030-01-20 23:59:59'}:payment())})
 const result=await c.readAsaasPix('pay_fixture',expected)
 assert.equal(urls.length,2)
 assert.equal(result.payload,'pix-fixture')
 let calls=0
 const wrong=client(async()=>{calls++;return response(payment({value:1}))})
 await assert.rejects(wrong.readAsaasPix('pay_fixture',expected),/PAYMENT_MISMATCH/)
 assert.equal(calls,1)
})

test('customer creation stores only expected fields and disables automatic provider messages',async()=>{
 let payload
 const c=client(async(url,init)=>{assert.ok(url.endsWith('/customers'));payload=JSON.parse(init.body);return response({id:'cus_fixture'})})
 assert.equal(await c.createAsaasCustomer({name:'Fixture customer',document:'52998224725',email:'fixture@example.test',reference:expected.checkoutId}),'cus_fixture')
 assert.equal(payload.notificationDisabled,true)
 assert.equal(payload.externalReference,expected.checkoutId)
})

test('transparent card payment sends data only to Asaas and strips card data from the result',async()=>{
 let sent
 const c=client(async(url,init)=>{sent={url,init};return response(payment({billingType:'CREDIT_CARD',status:'CONFIRMED',creditCard:{creditCardToken:'must-not-persist'}}))})
 const card={input:{holderName:'Fixture',number:'4111111111111111',expiryMonth:'12',expiryYear:'2035',ccv:'123',holderDocument:'52998224725'},
  remoteIp:'203.0.113.10',email:'fixture@example.test',postalCode:'18072000',addressNumber:'1',phone:'11999999999'}
 const normalized=await c.createAsaasPayment({...expected,method:'card'},'2030-01-20',card)
 const body=JSON.parse(sent.init.body)
 assert.equal(body.creditCard.number,card.input.number)
 assert.equal(body.creditCard.ccv,'123')
 assert.equal(body.creditCardHolderInfo.cpfCnpj,'52998224725')
 assert.equal(body.remoteIp,'203.0.113.10')
 assert.equal(body.billingType,'CREDIT_CARD')
 assert.equal(body.value,123.45)
 assert.equal(normalized.state,'approved')
 for(const secret of [card.input.number,'must-not-persist'])assert.equal(JSON.stringify(normalized).includes(secret),false)
 assert.equal(normalized.creditCard,undefined)
 await assert.rejects(c.createAsaasPayment({...expected,method:'card'},'2030-01-20'),/ASAAS_CARD_INPUT_INVALID/)
 await assert.rejects(c.createAsaasPayment(expected,'2030-01-20',card),/ASAAS_CARD_INPUT_INVALID/)
})

test('card validator rejects malformed, expired, unknown fields and invalid check digits',()=>{
 const {validateAsaasCardInput}=load('src/lib/asaas-card.ts')
 const card={holderName:'Fixture',number:'4111 1111 1111 1111',expiryMonth:'12',expiryYear:'2035',ccv:'123',holderDocument:'529.982.247-25'}
 assert.equal(validateAsaasCardInput(card).number,'4111111111111111')
 assert.equal(validateAsaasCardInput(card).holderDocument,'52998224725')
 for(const changes of [{number:'4111111111111112'},{ccv:'12'},{expiryYear:'2020'},{expiryMonth:'13'},{holderName:''},{token:'unexpected'},{holderDocument:'123'}]){
  assert.throws(()=>validateAsaasCardInput({...card,...changes}),/ASAAS_CARD_INPUT_INVALID/)
 }
})

test('merchant identity is queried without writes and validates account format',async()=>{
 const c=client(async(url,init)=>{assert.ok(url.endsWith('/myAccount/accountNumber'));assert.equal(init.method,'GET');return response({account:'12345'})})
 assert.equal(await c.asaasMerchant(),'12345')
 await assert.rejects(client(async()=>response({account:'not-account'})).asaasMerchant(),/ASAAS_ACCOUNT_INVALID/)
})

test('empty payment search needs explicit consistent pagination metadata before proving absence',async()=>{
 for(const body of [{data:[]},{data:[],hasMore:false,totalCount:1},{data:[],totalCount:0}]){
  await assert.rejects(client(async()=>response(body)).findAsaasPayment(expected),/ASAAS_RECONCILE_CONFLICT/)
 }
})
