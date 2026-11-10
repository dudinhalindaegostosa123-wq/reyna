import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {guestDatabase} from './helpers/guest-db.mjs'

test('guest SQL purchase: received email, Pix/card states, exact number and totals, private current shipment tracking and idempotence',async()=>{
 const db=await guestDatabase()
 try{
 await db.exec(readFileSync(new URL('../database/guest-checkout/01-visitante-acompanhamento.sql',import.meta.url),'utf8'))
 assert.equal((await db.query('select serenity_checkout_card_ready_v3() r')).rows[0].r.ready,true)
 const product=randomUUID(),variable=randomUUID(),variant=randomUUID()
 await db.query(`insert into products(id,slug,name,status,visibility,stock_status,stock_quantity,sold_individually,product_type,regular_price,tags,material,categories) values
 ($1,'guest-ring','Argola','published','visible','outofstock',0,false,'simple',100,'{}','Titânio','{Argolas}'),
 ($2,'guest-var','Argola com pedra','published','visible','outofstock',0,false,'variable',null,'{}','Titânio','{Argolas}')`,[product,variable])
 await db.query(`insert into product_variants(id,product_id,woo_id,enabled,stock_status,stock_quantity,regular_price,name,attributes) values($1,$2,22,true,'outofstock',0,150,'8mm','{"Diâmetro":"8mm"}')`,[variant,variable])
 const customer={name:'Compradora Visitante',email:'guest@example.com',phone:'11999999999',document:'52998224725'}
 const address={cep:'18072000',street:'Endereço privado',number:'123',district:'Privado',complement:'',city:'Sorocaba',state:'SP'}
 const lines=[{slug:'guest-ring',variant:'',quantity:1,color:'',sterilized:true},{slug:'guest-var',variant:'22',quantity:1,color:'',sterilized:true}]
 let nextPayment=12345
 async function start(method='pix',user=null,environment='production',coupon=null){
  const id=randomUUID(),access=id.replaceAll('-','').repeat(2),shipping=randomUUID(),attempt=randomUUID(),tokenHash=createHash('sha256').update('fixture:'+id).digest('hex')
  const quote=(await db.query('select serenity_checkout_coupon_quote_v2($1,$2,repeat(\'c\',64),null) q',[JSON.stringify(lines),coupon])).rows[0].q
  await db.query(`insert into serenity_shipping_quotes(id,request_id,cart_hash,destination,subtotal_cents,amount_cents,manual,settings_version,snapshot,expires_at) values($1,$2,repeat('b',64),'18072000',$3,1000,false,1,'{"pricing_mode":"retail"}',now()+interval '15 minutes')`,[shipping,id,quote.subtotal_cents])
  await db.query(`select serenity_checkout_start_v2($1,repeat('a',64),$2,$3,$4,$5,$6,$7,$8,repeat('b',64),$9,$10,repeat('c',64))`,[id,access,environment,user,JSON.stringify(lines),JSON.stringify(customer),JSON.stringify(address),quote.total_cents+1000,shipping,coupon])
  let number=null
  {
   number=(await db.query('select serenity_guest_register_v1($1,$2,$3) n',[id,access,tokenHash])).rows[0].n
   assert.equal((await db.query('select serenity_guest_register_v1($1,$2,$3) n',[id,access,tokenHash])).rows[0].n,number)
   await assert.rejects(db.query('select serenity_guest_register_v1($1,repeat(\'0\',64),$2)',[id,tokenHash]),/CHECKOUT_ACCESS_INVALID/)
  }
  const prices=(await db.query('select serenity_checkout_select_method_v4($1,$2,$3) p',[id,access,method])).rows[0].p
  await db.query(method==='pix'?`select serenity_checkout_claim_pix_v2($1,$2,$3,'123',repeat('d',64))`:`select serenity_checkout_claim_card_v3($1,$2,$3,'123',repeat('d',64))`,[id,access,attempt])
  const context=(await db.query('select serenity_checkout_context_v2($1,$2) c',[id,access])).rows[0].c
  assert.equal(context.guest_checkout,user===null)
  return {id,attempt,method,environment,tokenHash,number,paymentId:String(nextPayment++),total:prices.total_cents}
 }
 const read=async(s)=>(await db.query('select serenity_guest_tracking_read_v1($1,$2) r',[s.tokenHash,s.environment])).rows[0].r
 async function observe(s,status){
  const facts={provider_payment_id:s.paymentId,external_reference:s.id,attempt_id:s.attempt,environment:s.environment,merchant_id:'123',amount_cents:s.total,currency:'BRL',method:s.method,status,status_detail:'fixture',refunded_cents:0,updated_at:new Date().toISOString(),expires_at:status==='pending'?new Date(Date.now()+20*60000).toISOString():null}
  return (await db.query(`select ${s.method==='pix'?'serenity_checkout_observe_payment_v2':'serenity_checkout_observe_payment_v3'}($1,$2,'webhook') r`,[s.attempt,JSON.stringify(facts)])).rows[0].r
 }
 const guest=await start()
 assert.equal((await read(guest)).status,'pending')
 assert.equal((await db.query('select count(*) n from serenity_orders')).rows[0].n,0)
 assert.equal((await db.query("select count(*) n from serenity_email_outbox_v1 where kind='received'")).rows[0].n,1)
 assert.equal((await db.query("select count(*) n from serenity_email_outbox_v1 where kind='paid'")).rows[0].n,0)
 const pending=await observe(guest,'pending');assert.notEqual(pending.application_state,'applied')
 assert.equal((await read(guest)).status,'pending')
 const approved=await observe(guest,'approved');assert.equal(approved.application_state,'applied')
 const order=(await db.query('select * from serenity_orders where id=$1',[guest.id])).rows[0]
 assert.equal(order.number,guest.number);assert.equal(order.account_user_id,null)
 assert.equal(Math.round(Number(order.total)*100),guest.total)
 assert.equal(order.items[1].variant_id,variant);assert.equal(order.items[0].sterilization_fee,5)
 await observe(guest,'approved')
 assert.equal((await db.query('select count(*) n from serenity_orders')).rows[0].n,1)
 const emails=(await db.query('select * from serenity_email_outbox_v1 order by created_at')).rows
 assert.deepEqual(emails.map(e=>e.kind).sort(),['owner_paid','paid','received'])
 assert.equal(emails.find(e=>e.kind==='paid').payload.guest_checkout,true)
 assert.ok(!JSON.stringify(emails).includes('52998224725'))
 assert.ok(!JSON.stringify(emails).includes('Endereço privado'))
 assert.equal((await read(guest)).status,'paid')
 assert.equal((await db.query("select serenity_guest_tracking_read_v1(repeat('0',64)) r")).rows[0].r,null)
 const remote=randomUUID(),op=randomUUID()
 await db.query("insert into serenity_label_jobs values($1,$2,$3,'prepared')",[guest.id,remote,op])
 await db.query("insert into serenity_label_purchases values($1,$2,$3,'ready','generated')",[guest.id,remote,op])
 await db.query("insert into serenity_shipment_tracking values($1,$2,'generated','CODE123')",[guest.id,remote])
 assert.equal((await read(guest)).tracking_code,null)
 await db.query("update serenity_shipment_tracking set carrier_status='posted' where order_id=$1",[guest.id])
 let tracking=await read(guest)
 assert.equal(tracking.carrier,'posted');assert.equal(tracking.tracking_code,'CODE123')
 assert.ok(!JSON.stringify(tracking).includes(guest.id));assert.ok(!JSON.stringify(tracking).includes('guest@example.com'))
 await db.query("update serenity_shipment_tracking set carrier_status='delivered' where order_id=$1",[guest.id])
 assert.equal((await read(guest)).carrier,'delivered')
 assert.equal((await db.query("select count(*) n from serenity_email_outbox_v1 where kind='delivered'")).rows[0].n,1)
 await db.query('update serenity_label_purchases set remote_id=$1 where order_id=$2',[randomUUID(),guest.id])
 assert.equal((await read(guest)).tracking_code,null)
 await db.query('update serenity_guest_access_v1 set revoked=true where checkout_id=$1',[guest.id]);assert.equal(await read(guest),null)
 await db.query("update serenity_guest_access_v1 set revoked=false,expires_at=now()-interval '1 day' where checkout_id=$1",[guest.id]);assert.equal(await read(guest),null)
 const card=await start('card')
 const rejected=await observe(card,'rejected');assert.equal(rejected.state,'rejected')
 assert.equal((await read(card)).status,'failed')
 assert.equal((await db.query("select count(*) n from serenity_email_outbox_v1 where order_id=$1 and kind='paid'",[card.id])).rows[0].n,0)
 const retryId=randomUUID()
 await db.query("select serenity_checkout_claim_card_v3($1,$2,$3,'123',repeat('e',64))",[card.id,card.id.replaceAll('-','').repeat(2),retryId])
 assert.equal((await read(card)).status,'pending')
 const retried={...card,attempt:retryId,paymentId:String(nextPayment++)}
 assert.equal((await observe(retried,'approved')).application_state,'applied')
 assert.equal((await read(card)).status,'paid')
 const approvedCard=await start('card')
 assert.equal((await observe(approvedCard,'approved')).application_state,'applied')
 assert.equal((await read(approvedCard)).status,'paid')
 const user=randomUUID(),customerId=randomUUID();await db.query('insert into auth.users values($1,now(),\'guest@example.com\')',[user])
 await db.query("insert into serenity_customers(id,name,email) values($1,'Cliente','guest@example.com')",[customerId]);await db.query('insert into serenity_customer_accounts(user_id,customer_id) values($1,$2)',[user,customerId])
 const logged=await start('card',user)
 assert.equal((await observe(logged,'approved')).application_state,'applied')
 const owned=(await db.query('select account_user_id,customer_id from serenity_orders where id=$1',[logged.id])).rows[0]
 assert.equal(owned.account_user_id,user);assert.equal(owned.customer_id,customerId)
 assert.equal((await db.query('select count(*) n from serenity_guest_access_v1 where checkout_id=$1',[logged.id])).rows[0].n,1)
 const couponId=randomUUID()
 await db.query("insert into serenity_coupons values($1,'HALF','active',null,null,'all',0,'percent',50,10,1,1)",[couponId])
 const couponGuest=await start('pix',null,'production','HALF')
 assert.ok(couponGuest.total<guest.total)
 assert.equal((await observe(couponGuest,'approved')).application_state,'applied')
 assert.equal(Math.round(Number((await db.query('select total from serenity_orders where id=$1',[couponGuest.id])).rows[0].total)*100),couponGuest.total)
 await assert.rejects(start('pix',null,'production','HALF'),/COUPON_CUSTOMER_LIMIT/)
 await db.exec('set role anon')
 await assert.rejects(db.query('select * from serenity_guest_access_v1'),/permission denied/)
 await assert.rejects(db.query('select serenity_guest_tracking_read_v1($1)',[card.tokenHash]),/permission denied/)
 await assert.rejects(db.query('select serenity_guest_register_v1($1,$2,$3)',[card.id,'x','x']),/permission denied/)
 await db.exec('reset role')
 }finally{await db.close()}
})
