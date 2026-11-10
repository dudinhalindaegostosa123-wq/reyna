const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const id='a31b63bd-5bb9-4556-bbf9-8197ee11de31'
function fixture(replies){
 const calls=[]
 const api=load('src/lib/label-purchase-server.ts',{'@/lib/legacy-label-binding':{},'@/lib/admin-sales':{saleUuid:v=>/^[a-f0-9-]{36}$/.test(v)},'@/lib/label-cart-server':{remoteCart:v=>v,remotePrice:v=>v.price,verifyRemote:(v,expected,operation)=>{assert.equal(v.id,expected);assert.ok(v.tags.includes(operation));return v}}},{MELHOR_ENVIO_TOKEN:'fixture-token'},{fetch:async(url,options)=>{calls.push({url,options});const reply=replies.shift();return new Response(JSON.stringify(reply.body || {}),{status:reply.status})}})
 return {api,calls}
}
test('unpaid preparation is read in the cart before purchase; no checkout POST is issued',async()=>{
 const {api,calls}=fixture([{status:200,body:{id,status:'pending'}}])
 assert.equal((await api.labelShipmentRequest('info',id,'admin@example.com',true)).status,'pending')
 assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/cart/'+id));assert.equal(calls[0].options.method,'GET')
})
test('an externally paid label that left the cart is found in orders and cannot be mistaken for a missing preparation',async()=>{
 const {api,calls}=fixture([{status:404},{status:200,body:[]},{status:200,body:{id,status:'generated'}}])
 assert.equal((await api.labelShipmentRequest('info',id,'admin@example.com',true)).status,'generated')
 assert.equal(calls.length,3);assert.ok(calls[2].url.endsWith('/orders/'+id));assert.ok(calls.every(call=>call.options.method==='GET'))
})
test('cart lookup only falls back on 404 and preserves authorization or provider errors',async()=>{
 const {api}=fixture([{status:404},{status:200,body:[]},{status:404},{status:200,body:[]}]);await assert.rejects(api.labelShipmentRequest('info',id,'admin@example.com',true),/PURCHASE_PROVIDER_404/)
 for(const status of [401,403,429,500]){
  const {api,calls}=fixture([{status}]);await assert.rejects(api.labelShipmentRequest('info',id,'admin@example.com',true),new RegExp('PURCHASE_PROVIDER_'+status));assert.equal(calls.length,1)
 }
})
test('purchased label reads stay in orders and failed purchase/print calls are never automatically repeated',async()=>{
 for(const command of ['buy','print']){
  const {api,calls}=fixture([{status:404}]);await assert.rejects(api.labelShipmentRequest(command,id,'admin@example.com'),/PURCHASE_PROVIDER_404/);assert.equal(calls.length,1)
  assert.equal(calls[0].options.method,command==='info'?'GET':'POST')
 }
})

test('purchase observation routes unpaid preparations through cart while paid or uncertain purchases stay in orders',async()=>{
 for(const phase of [null,'review','paid','uncertain']){
  const status=phase==='paid'?'generated':'pending'
  const shipment={id,status,price:12,service_id:1,tags:['operation']}
  const {api,calls}=fixture(phase===null?[{status:404},{status:200,body:{data:[shipment],last_page:1}}]:[{status:200,body:shipment}])
  const saved=[]
  const values={serenity_orders:{id,status:'paid',shipping_pending:false},serenity_label_jobs:{state:'prepared',remote_id:id,operation:'operation',context:{},selected:{provider:{id:1}}},serenity_label_purchases:phase?{phase}:null}
  const db={from(table){const q={select:()=>q,eq:()=>q,single:async()=>({data:values[table],error:null}),maybeSingle:async()=>({data:values[table],error:null})};return q},rpc:async(name,args)=>{saved.push({name,args});return {error:null}}}
  const result=await api.observeShipment(db,id,'actor','admin@example.com')
  assert.ok(calls[0].url.endsWith((phase===null || phase==='review'?'/cart/':'/orders/')+id))
  assert.equal(saved[0].args.p_paid,phase==='paid');assert.equal(result.remote.paid,phase==='paid')
 }
})

test('404 on individual cart item recovers only the exact UUID from a paginated cart list',async()=>{
 const {api,calls}=fixture([{status:404},{status:200,body:{data:[{id:'other'}],current_page:1,last_page:2}},{status:200,body:{data:[{id,status:'pending',price:12}],current_page:2,last_page:2}}])
 const found=await api.labelShipmentRequest('info',id,'admin@example.com',true)
 assert.equal(found.id,id);assert.equal(calls.length,3);assert.ok(calls[2].url.includes('page=2'))
 assert.ok(calls.every(call=>call.options.method==='GET'))
})
test('purchased label missing on direct GET can be recovered from orders list without issuing any print or buy command',async()=>{
 const {api,calls}=fixture([{status:404},{status:200,body:{data:[{id,status:'generated'}],last_page:1}}])
 assert.equal((await api.labelShipmentRequest('info',id,'admin@example.com')).status,'generated')
 assert.equal(calls.length,2);assert.ok(calls[1].url.includes('/orders?'))
})
test('ambiguous, malformed or incomplete lists cannot be interpreted as a missing shipment',async()=>{
 for(const body of [{data:[{id},{id}]},{unexpected:true}]){
  const {api}=fixture([{status:404},{status:200,body}]);await assert.rejects(api.labelShipmentRequest('info',id,'admin@example.com',true),/PURCHASE_LOOKUP_INVALID/)
 }
 const {api}=fixture([{status:404},...Array.from({length:5},()=>({status:200,body:{data:[],last_page:10}}))]);await assert.rejects(api.labelShipmentRequest('info',id,'admin@example.com',true),/PURCHASE_LOOKUP_INCOMPLETE/)
})
