const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const api=load('src/lib/checkout-contact.ts')
const contact={id:'11111111-1111-4111-8111-111111111111',token:'22222222-2222-4222-8222-222222222222',name:' Cliente Teste ',email:' TESTE@example.com ',items:[{name:'Argola',slug:'argola',quantity:2}],estimatedCents:20000}
test('contact normalization rejects incomplete, oversized or invalid input and drops unrelated personal fields',()=>{
 const value=api.checkoutContact({...contact,document:'123',phone:'123',address:{street:'Rua'}})
 assert.equal(value.name,'Cliente Teste');assert.equal(value.email,'teste@example.com')
 assert.ok(api.checkoutContact({...contact,name:'A'.repeat(180)}))
 assert.equal(api.checkoutContact({...contact,name:'A'.repeat(181)}),null)
 assert.deepEqual(Object.keys(value).sort(),['email','estimatedCents','id','items','name','token'].sort())
 for(const change of [{id:'bad'},{token:''},{name:'a'},{email:'invalid'},{email:'a'.repeat(255)+'@x.co'},{items:[]},{items:Array(101).fill(contact.items[0])},{items:[{...contact.items[0],quantity:0}]},{estimatedCents:1.5},{estimatedCents:-1}])assert.equal(api.checkoutContact({...contact,...change}),null)
})
test('possible abandonment never overrides a payment session, approved payment, review or confirmed order',()=>{
 const now=Date.parse('2026-11-09T20:00:00Z'),lastActivity='2026-11-09T18:00:00Z',status=input=>api.checkoutContactStatus({lastActivity,...input},now)
 assert.match(status({}),/Possível abandono/)
 assert.equal(status({lastActivity:'2026-11-09T19:50:00Z'}),'Preenchendo dados')
 assert.equal(status({state:'payment_pending'}),'Aguardando pagamento')
 assert.equal(status({state:'expired'}),'Prazo do checkout encerrado')
 assert.equal(status({state:'pending',expiresAt:'2026-11-09T19:00:00Z'}),'Prazo do checkout encerrado')
 assert.equal(status({state:'converted',orderId:contact.id}),'Compra concluída')
 assert.equal(status({paymentState:'approved',expiresAt:'2026-11-09T19:00:00Z'}),'Pagamento aprovado — conferir pedido')
 assert.equal(status({paymentState:'uncertain',state:'expired'}),'Pagamento em conferência')
 assert.equal(status({needsReview:true,state:'expired'}),'Em conferência')
 assert.equal(status({paymentState:'rejected'}),'Pagamento recusado')
})
test('contact endpoint checks origin/validation and sends only a token hash to its private RPC',async()=>{
 const calls=[]
 const route=load('src/app/api/checkout/contato/route.ts',{
  'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status || 200})}},
  '@/lib/checkout-contact':api,'@/lib/checkout-server':{checkoutHash:input=>'hashed:'+input,checkoutDatabase:async()=>({rpc:async(...args)=>{calls.push(args);return {error:null}}})}
 },{MERCADO_PAGO_ENVIRONMENT:'production'})
 const request=(body,origin='https://serenity.example')=>new Request('https://serenity.example/api/checkout/contato',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})
 assert.equal((await route.POST(request(contact,'https://elsewhere.example'))).status,403)
 assert.equal((await route.POST(request({...contact,email:''}))).status,400);assert.equal(calls.length,0)
 assert.equal((await route.POST(request(contact))).status,200)
 assert.equal(calls[0][0],'serenity_checkout_contact_save_v1');assert.equal(calls[0][1].p_token_hash,'hashed:checkout-contact:'+contact.token)
 assert.equal(calls[0][1].p_email,'teste@example.com');assert.equal(calls[0][1].p_environment,'production')
 const local=new Request('https://localhost/api/checkout/contato',{method:'POST',headers:{host:'serenity.example',origin:'https://serenity.example'},body:JSON.stringify(contact)})
 assert.equal((await route.POST(local)).status,200)
 const oversized=new Request('https://serenity.example/api/checkout/contato',{method:'POST',headers:{origin:'https://serenity.example'},body:'x'.repeat(32001)})
 assert.equal((await route.POST(oversized)).status,413)
})
test('admin checkout report joins reserved numbers, captures and payments without mislabeling paid orders',async()=>{
 const {nodes}=require('./helpers/render.cjs'),now=new Date().toISOString(),paid=contact.id,lead='33333333-3333-4333-8333-333333333333'
 const data={
  serenity_checkout_contacts_v1:[{id:lead,name:'Contato interno',email:'lead@example.com',phone:'5511988888888',items:contact.items,estimated_cents:20000,updated_at:'2026-01-01T00:00:00Z',environment:'production',token_hash:'do-not-render'}],
  serenity_checkout_sessions_v2:[{id:paid,state:'converted',environment:'production',customer_snapshot:{name:'Compra paga',email:'paid@example.com',phone:'(11) 99999-9999'},cart_items:contact.items,order_items:contact.items,total_cents:20000,created_at:now,updated_at:now,expires_at:now,order_id:paid}],
  serenity_guest_access_v1:[{checkout_id:paid,number:83}],serenity_checkout_payments_v2:[{checkout_id:paid,state:'approved',application_state:'applied',created_at:now}],
 }
 const db={from(table){let rows=[...(data[table] || [])];const q={select(){return q},eq(key,value){rows=rows.filter(r=>key==='number'?String(r[key])===String(value):r[key]===value);return q},order(){return q},gte(key,value){rows=rows.filter(r=>r[key]>=value);return q},lte(key,value){rows=rows.filter(r=>r[key]<=value);return q},range(from,to){return Promise.resolve({data:rows.slice(from,to+1),error:null})},limit(){return q},in(key,ids){rows=rows.filter(r=>ids.includes(key==='customer_snapshot->>email'?r.customer_snapshot?.email:r[key]));return q},maybeSingle(){return Promise.resolve({data:rows[0] || null,error:null})},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve)}};return q}}
 const element=(type,props)=>({type,props:props || {}})
 const page=load('src/app/admin/checkouts/page.tsx',{'next/link':{default:'Link'},'@/components/admin/CheckoutAutoRefresh':{default:'AutoRefresh'},'@/lib/admin-auth':{adminDatabase:async()=>({db})},'@/lib/checkout-contact':api,'@/lib/checkout-related-orders':load('src/lib/checkout-related-orders.ts'),'@/lib/checkout-report':load('src/lib/checkout-report.ts',{'@/lib/checkout-related-orders':load('src/lib/checkout-related-orders.ts'),'@/lib/checkout-contact':api}),'@/lib/admin-sales':{saleDate:value=>value,saleMoney:value=>String(value)},'react/jsx-runtime':{jsx:element,jsxs:element}})
 const tree=await page.default({searchParams:{concluidos:'1'}}),text=JSON.stringify(tree)
 assert.match(text,/Compra concluída/);assert.match(text,/Possível abandono/);assert.match(text,/#83/);assert.doesNotMatch(text,/do-not-render/)
 assert.equal(nodes(tree,n=>n.type==='article').length,2)
 assert.ok(nodes(tree,n=>n.type==='a' && n.props.href==='https://wa.me/5511999999999').length)
 assert.ok(nodes(tree,n=>n.type==='Link' && String(n.props.href).includes('tentativa=')).length)
 const detail=await page.default({searchParams:{tentativa:paid,concluidos:'1'}})
 assert.equal(nodes(detail,n=>n.type==='article').length,1)
 assert.match(JSON.stringify(detail),/Detalhes do checkout/)
 assert.ok(nodes(detail,n=>n.type==='Link' && n.props.href==='/admin/pedidos/'+paid).length)
 const open=await page.default({});assert.equal(nodes(open,n=>n.type==='article').length,1)
 const byNumber=await page.default({searchParams:{numero:'83'}})
 assert.equal(nodes(byNumber,n=>n.type==='article').length,1)
 assert.match(JSON.stringify(byNumber),/Compra concluída/)
 // A previous contact from the same browser/cart becomes a related-record notice.
 const hash='a'.repeat(64),previous=new Date(Date.now()-10*60000).toISOString(),later=new Date(Date.now()-5*60000).toISOString()
 Object.assign(data.serenity_checkout_contacts_v1[0],{token_hash:hash,email:'paid@example.com',created_at:previous,updated_at:previous})
 data.serenity_checkout_contacts_v1.push({id:paid,token_hash:hash,email:'paid@example.com',created_at:later,updated_at:later,environment:'production',items:contact.items})
 data.serenity_orders=[{id:paid,number:83,status:'paid'}]
 const linked=await page.default({}),linkedText=JSON.stringify(linked)
 assert.match(linkedText,/Possível tentativa anterior — compra concluída/)
 assert.match(linkedText,/Ver compra relacionada #/)
 assert.doesNotMatch(linkedText,/Preenchendo dados/);assert.doesNotMatch(linkedText,new RegExp(hash))
 // A same-email purchase stays visible as a qualified warning when the strict match fails.
 data.serenity_checkout_contacts_v1[1].token_hash='b'.repeat(64)
 const byEmail=JSON.stringify(await page.default({}))
 assert.match(byEmail,/Compra paga encontrada para este e-mail/)
 assert.doesNotMatch(byEmail,/Possível abandono — sem pagamento iniciado/)
 // An independent payment session must keep its own state, even with the same cart/email.
 data.serenity_checkout_sessions_v2.push({id:lead,state:'payment_pending',environment:'production',customer_snapshot:{name:'Contato interno',email:'paid@example.com'},order_items:contact.items,total_cents:20000,created_at:previous,updated_at:now,expires_at:new Date(Date.now()+60000).toISOString(),order_id:null})
 const independent=JSON.stringify(await page.default({}))
 assert.match(independent,/Aguardando pagamento/);assert.doesNotMatch(independent,/Possível tentativa anterior/)

})
test('contact hook debounces valid contact data, sends on leaving, and removes timers/listeners on cleanup',async()=>{
 let effect,interval
 const sent=[],events=new Map(),values=new Map()
 const {useCheckoutContact}=load('src/components/checkout/useCheckoutContact.ts',{'react':{useEffect:fn=>{effect=fn}},'@/lib/checkout-contact':api},{},{
  sessionStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},crypto:{randomUUID:()=>contact.token},
  fetch:(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return Promise.resolve()},
  setInterval:fn=>{interval=fn;return 2},clearInterval(){interval=null},
  window:{addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)},
  document:{visibilityState:'visible',addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)},
 })
 const props={id:contact.id,name:contact.name,email:contact.email,items:[{name:'Argola',slug:'argola',quantity:2,price:100}],enabled:true}
 useCheckoutContact(props);const cleanup=effect()
 assert.equal(sent.length,0);await new Promise(resolve=>setTimeout(resolve,1700));assert.equal(sent.length,1)
 assert.equal(sent[0].body.email,'teste@example.com');assert.equal(values.size,1);assert.equal(Array.from(values.values())[0],contact.token)
 events.get('pagehide')();assert.equal(sent.length,2)
 cleanup();assert.equal(events.size,0);assert.equal(interval,null)
 useCheckoutContact({...props,email:''});assert.equal(effect(),undefined)
})
test('WhatsApp accepts Brazilian DDD and country code, while incomplete phone input never blocks contact capture',()=>{
 for(const phone of ['(11) 99999-9999','11999999999','+55 (11) 99999-9999','5511999999999']){
  assert.equal(api.checkoutPhone(phone),'5511999999999')
  assert.equal(api.checkoutContact({...contact,phone}).phone,'5511999999999')
 }
 assert.equal(api.checkoutPhone('(11) 3333-4444'),'551133334444')
 for(const phone of ['',null,'11','0'.repeat(11),'x'.repeat(41)]){
  assert.equal(api.checkoutPhone(phone),'')
  assert.ok(api.checkoutContact({...contact,phone}))
 }
})
test('admin refresh runs only on visible, idle pages and cleans up its timer',()=>{
 let effect,tick,cleanupListener,refreshes=0
 const document={visibilityState:'visible',activeElement:{tagName:'BODY'},addEventListener:(name,fn)=>{cleanupListener=fn},removeEventListener:()=>{cleanupListener=null}}
 const component=load('src/components/admin/CheckoutAutoRefresh.tsx',{'react':{useEffect:fn=>{effect=fn}},'next/navigation':{useRouter:()=>({refresh:()=>{refreshes++}})}},{},{document,setInterval:fn=>{tick=fn;return 1},clearInterval:()=>{tick=null}}).default
 component();const cleanup=effect();tick();assert.equal(refreshes,1)
 document.activeElement.tagName='INPUT';tick();assert.equal(refreshes,1)
 document.activeElement.tagName='BODY';document.visibilityState='hidden';tick();assert.equal(refreshes,1)
 document.visibilityState='visible';cleanupListener();assert.equal(refreshes,2)
 cleanup();assert.equal(tick,null);assert.equal(cleanupListener,null)
})
