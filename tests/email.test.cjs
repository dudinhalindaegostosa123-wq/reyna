const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const templates = load('src/lib/email-template.ts',{'@/lib/stem-description':load('src/lib/stem-description.ts'),'./order-item-options':load('src/lib/order-item-options.ts')})
const job = { id:'job',order_id:'order',kind:'paid',recipient:'customer@example.com',lease_id:'lease',payload:{number:13,name:'<script>bad</script>',total:220.3,items:[{name:'Joia & pedra',quantity:1,unit_price:220.3}]}}

test('receipt escapes untrusted content, has no public order capability and uses actual paid total',()=>{
 const email=templates.orderEmail(job)
 assert.ok(!email.html.includes('<script>'))
 assert.ok(email.html.includes('&lt;script&gt;'))
 assert.ok(email.text.includes('220,30'))
 assert.ok(email.html.includes('https://reyna-three.vercel.app/minha-conta#pedidos'))
 assert.ok(!email.html.includes('/pagamento/'))
})
function worker(send,env={}) {
 return load('src/lib/order-email-server.ts',{'nodemailer':{default:{createTransport:()=>({sendMail:send})}},'./email-template':templates},{VERCEL_ENV:'production',SERENITY_EMAIL_ENABLED:'true',SMTP_FROM_EMAIL:'store@example.test',SMTP_USER:'store@example.test',SMTP_PASSWORD:'test',...env})
}
test('SMTP enabled only in production, claimed once and accepted delivery recorded with matching lease',async()=>{
 let calls=[],sends=[]
 const db={rpc:async(name,args)=>{calls.push([name,args]);return name.includes('claim')?{data:[job]}:{data:true}}}
 let service=worker(async msg=>sends.push(msg),{VERCEL_ENV:'preview'})
 assert.equal((await service.drainOrderEmails(db)).skipped,true);assert.equal(calls.length,0)
 service=worker(async msg=>sends.push(msg))
 assert.equal((await service.drainOrderEmails(db)).sent,1)
 assert.equal(sends[0].to,job.recipient)
 assert.equal(calls[1][1].p_result,'sent');assert.equal(calls[1][1].p_lease,'lease')
})
test('SMTP uncertain DATA delivery goes to review; known rejected authentication permits retry',async()=>{
 let finish
 const db={rpc:async(name,args)=>name.includes('claim')?{data:[job]}:(finish=args,{data:true})}
 let service=worker(async()=>{throw {code:'ESOCKET',command:'DATA'}})
 await service.drainOrderEmails(db);assert.equal(finish.p_result,'review')
 service=worker(async()=>{throw {code:'EAUTH'}})
 await service.drainOrderEmails(db);assert.equal(finish.p_result,'retry')
})
test('password recovery does not expose missing accounts and password update needs verified recovery session',async()=>{
 let resetCalls=0,updateCalls=0,marker='other'
 const auth={auth:{resetPasswordForEmail:async()=>{resetCalls++;return {error:null}},getUser:async()=>({data:{user:{id:'user'}},error:null}),updateUser:async()=>{updateCalls++;return {error:null}},signOut:async()=>({error:null})}}
 const actions=load('src/app/minha-conta/recuperar/actions.ts',{'next/headers':{cookies:()=>({get:()=>({value:marker}),set(){}})},'next/navigation':{redirect:path=>{throw Error(`redirect:${path}`)}},'@/lib/customer-auth':{customerAuth:()=>auth}})
 let form=new FormData();form.set('email','someone@example.com')
 assert.equal((await actions.requestPasswordReset({},form)).success,true);assert.equal(resetCalls,1)
 form=new FormData();form.set('password','securepassword123');form.set('confirmation','securepassword123')
 assert.ok((await actions.changeRecoveredPassword({},form)).error);assert.equal(updateCalls,0)
 marker='user'
 await assert.rejects(actions.changeRecoveredPassword({},form),/senha-alterada/);assert.equal(updateCalls,1)
})

test('customer congratulations and owner sale alert include saved jewelry choices and distinct private destinations',()=>{
 const receipt={...job,payload:{...job.payload,items:[{name:'Topo fixture',quantity:2,unit_price:40,variation:'Pedra: 3 mm',stem_length_mm:'6',sterilized:true,anodization:'Azul',voltage:'25'}]}}
 const customer=templates.orderEmail(receipt),owner=templates.orderEmail({...receipt,kind:'owner_paid'})
 assert.ok(customer.subject.includes('Parabéns pela compra'))
 assert.ok(owner.subject.includes('UHUL, MAIS UMA COMPRA'))
 for(const mail of [customer,owner])for(const value of ['6 mm','Sim (solicitada)','Azul','25 V','Pedra: 3 mm'])assert.ok(mail.text.includes(value))
 assert.ok(owner.html.includes('/admin/pedidos/order'));assert.ok(!customer.html.includes('/admin/'))
 assert.ok(!templates.orderEmail({...job,kind:'shipped'}).subject.includes('compra'))
})

test('wholesale request and approval have separate audiences, escaped content, and no invented commercial conditions',()=>{
 const request=templates.orderEmail({...job,order_id:null,kind:'wholesale_requested',payload:{name:'<b>Cliente</b>',email:'verified@example.com'}})
 const approval=templates.orderEmail({...job,order_id:null,kind:'wholesale_approved',payload:{name:'<b>Cliente</b>'}})
 assert.ok(request.subject.includes('solicitação de atacado'));assert.ok(request.text.includes('verified@example.com'))
 assert.ok(request.html.includes('/admin/atacado'));assert.ok(!request.html.includes('<b>Cliente</b>'))
 assert.ok(approval.subject.includes('foi aprovado'));assert.ok(approval.html.includes('/minha-conta'));assert.ok(!approval.html.includes('/admin/'))
 for(const email of [request,approval]){assert.ok(!email.text.includes('Pedido #'));assert.ok(!email.text.includes('undefined'));assert.ok(!email.text.includes('50%'))}
})

test('legacy shipment emails reference the original order and account history, without a new purchase receipt',()=>{
 for(const kind of ['legacy_shipped','legacy_delivered']){
  const email=templates.orderEmail({...job,order_id:null,kind,payload:{number:24420,name:'Cliente fixture',tracking:'BR123'}})
  assert.ok(email.subject.includes('Pedido antigo #24420'));assert.ok(email.html.includes('#historico-antigo'));assert.ok(email.text.includes('BR123'));assert.ok(!email.text.includes('Total pago'));assert.ok(!email.subject.includes('compra'))
 }
})


test('carrier problem updates describe the actual situation and link to the correct order history',()=>{
 for(const [suffix,word] of [['undelivered','concluir a entrega'],['paused','pausado'],['suspended','suspenso']])for(const prefix of ['shipping','legacy']){
  const email=templates.orderEmail({...job,kind:`${prefix}_${suffix}`,payload:{number:24420,name:'<script>fixture</script>',tracking:'BR123'}})
  assert.ok(email.subject.includes(word));assert.ok(!email.html.includes('<script>'));assert.ok(email.text.includes('BR123'));assert.ok(email.html.includes(prefix==='legacy'?'#historico-antigo':'#pedidos'))
 }
})

test('guest receipt and status emails use the same secure tracking link, correct event wording and no forced login',()=>{
 const link='https://reyna-three.vercel.app/acompanhar#'+'a'.repeat(64)
 const guest={...job,payload:{...job.payload,guest_checkout:true}}
 for(const kind of ['received','paid','shipped','delivered']){
  const email=templates.orderEmail({...guest,kind},link)
  assert.ok(email.text.includes(link));assert.ok(email.html.includes(link))
  assert.ok(!email.html.includes('/minha-conta'));assert.ok(!email.html.includes('/pagamento/'))
  assert.ok(!email.html.includes('<script>bad'))
 }
 const receipt=templates.orderEmail({...guest,kind:'received'},link)
 assert.match(receipt.text,/confirmação de pagamento será enviada separadamente/)
 assert.ok(!receipt.text.includes('Total pago:'))
 assert.throws(()=>templates.orderEmail(guest),/GUEST_EMAIL_LINK_UNAVAILABLE/)
 assert.throws(()=>templates.orderEmail(guest,'https://evil.example/acompanhar#'+'a'.repeat(64)),/GUEST_EMAIL_LINK_UNAVAILABLE/)
})

test('existing SMTP worker sends guest links using a server-only capability, then records the existing lease once',async()=>{
 const key='fixture-only-private-key-012345678901234567890123456789'
 const id='11111111-1111-4111-8111-111111111111'
 const api=load('src/lib/guest-tracking-server.ts',{
  'node:crypto':require('node:crypto'),'next/headers':{},'./mercado-pago-server':{},
 },{SERENITY_GUEST_TRACKING_SECRET:key})
 const token=api.guestToken(id)
 const queue=[{...job,order_id:null,checkout_id:id,kind:'received',payload:{...job.payload,guest_checkout:true}}]
 const sent=[],finished=[]
 const db={
  from:()=>{const q={select(){return q},eq(_key,value){assert.equal(value,id);return q},single:async()=>({data:{token_hash:api.guestTokenHash(token),expires_at:new Date(Date.now()+86400000).toISOString(),revoked:false},error:null})};return q},
  rpc:async(name,args)=>name==='serenity_email_claim_v1'?{data:queue.length?[queue.shift()]:[]}:(finished.push(args),{data:true}),
 }
 const service=load('src/lib/order-email-server.ts',{
  nodemailer:{default:{createTransport:()=>({sendMail:async message=>sent.push(message)})}},'./email-template':templates,'./guest-tracking-server':api,
 },{VERCEL_ENV:'production',SERENITY_EMAIL_ENABLED:'true',SMTP_FROM_EMAIL:'store@example.test',SMTP_USER:'store@example.test',SMTP_PASSWORD:'test'})
 assert.equal((await service.drainOrderEmails(db)).sent,1)
 assert.equal(sent[0].to,job.recipient);assert.ok(sent[0].html.includes('/acompanhar#'+token))
 assert.ok(!JSON.stringify(sent).includes(key));assert.equal(finished[0].p_result,'sent')
 assert.equal((await service.drainOrderEmails(db)).sent,0)
 assert.equal(service.emailFailure(new Error('GUEST_EMAIL_LINK_UNAVAILABLE')).result,'retry')
})
