import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {guestDatabase} from './helpers/guest-db.mjs'
test('approved payment queues one server purchase with captured GA4 context, without browser presence or personal data',async()=>{
 const db=await guestDatabase()
 try{
 const sql=readFileSync(new URL('../database/analytics/01-eventos-compra.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql)
 const product=randomUUID()
 await db.query("insert into products(id,slug,name,status,visibility,stock_status,sold_individually,product_type,regular_price,tags,material,categories) values($1,'analytics-ring','Argola','published','visible','instock',false,'simple',100,'{}','Titânio','{Argolas}')",[product])
 const lines=[{slug:'analytics-ring',variant:'',quantity:2,color:''}],customer={name:'Cliente privado',email:'private@example.com',phone:'11999999999',document:'52998224725'},address={cep:'18072000',street:'Rua privada',number:'1',complement:'',district:'Centro',city:'Sorocaba',state:'SP'}
 let nextPayment=12345
 async function start(capture=true){
  const id=randomUUID(),shipping=randomUUID(),attempt=randomUUID(),access=id.replaceAll('-','').repeat(2)
  const q=(await db.query("select serenity_checkout_coupon_quote_v2($1,null,repeat('c',64),null) q",[JSON.stringify(lines)])).rows[0].q
  await db.query(`insert into serenity_shipping_quotes(id,request_id,cart_hash,destination,subtotal_cents,amount_cents,manual,settings_version,snapshot,expires_at) values($1,$2,repeat('b',64),'18072000',$3,1000,false,1,'{"pricing_mode":"retail"}',now()+interval '15 minutes')`,[shipping,id,q.subtotal_cents])
  await db.query("select serenity_checkout_start_v2($1,repeat('a',64),$2,'production',null,$3,$4,$5,$6,repeat('b',64),$7,null,repeat('c',64))",[id,access,JSON.stringify(lines),JSON.stringify(customer),JSON.stringify(address),q.total_cents+1000,shipping])
  const context={measurementId:'G-ZR73XP32BW',clientId:'123456.123456',sessionId:'1762180000',capturedAt:Date.now(),email:'should-not-be-saved@example.com',gclid:'click-test'}
  if(capture){
   assert.equal((await db.query("select serenity_analytics_capture_v1($1,repeat('0',64),$2) r",[id,JSON.stringify(context)])).rows[0].r,false)
   assert.equal((await db.query('select serenity_analytics_capture_v1($1,$2,$3) r',[id,access,JSON.stringify(context)])).rows[0].r,true)
  }
  const prices=(await db.query("select serenity_checkout_select_method_v4($1,$2,'pix') p",[id,access])).rows[0].p
  await db.query("select serenity_checkout_claim_pix_v2($1,$2,$3,'123',repeat('d',64))",[id,access,attempt])
  const facts={provider_payment_id:String(nextPayment++),external_reference:id,attempt_id:attempt,environment:'production',merchant_id:'123',amount_cents:prices.total_cents,currency:'BRL',method:'pix',status:'approved',status_detail:'fixture',refunded_cents:0,updated_at:new Date().toISOString()}
  return {id,attempt,facts}
 }
 const s=await start()
 assert.equal((await db.query('select count(*) n from serenity_analytics_outbox_v1')).rows[0].n,0)
 const observe=async(payment)=>(await db.query("select serenity_checkout_observe_payment_v2($1,$2,'webhook') r",[payment.attempt,JSON.stringify(payment.facts)])).rows[0].r
 assert.equal((await observe(s)).application_state,'applied');await observe(s)
 const jobs=(await db.query('select * from serenity_analytics_outbox_v1')).rows
 assert.equal(jobs.length,1);assert.equal(jobs[0].state,'pending');assert.equal(jobs[0].context.clientId,'123456.123456')
 assert.ok(!JSON.stringify(jobs).includes('private@example.com'));assert.ok(!JSON.stringify(jobs).includes('should-not-be-saved'));assert.ok(!JSON.stringify(jobs).includes('52998224725'))
 const claim=(await db.query('select * from serenity_analytics_claim_v1(3)')).rows
 assert.equal(claim.length,1);assert.equal((await db.query('select * from serenity_analytics_claim_v1(3)')).rows.length,0)
 assert.equal((await db.query("select serenity_analytics_finish_v1($1,$2,'sent',null) r",[s.id,randomUUID()])).rows[0].r,false)
 assert.equal((await db.query("select serenity_analytics_finish_v1($1,$2,'sent',null) r",[s.id,claim[0].lease_id])).rows[0].r,true)
 const noCapture=await start(false);assert.equal((await observe(noCapture)).application_state,'applied');assert.equal((await db.query('select count(*) n from serenity_analytics_outbox_v1')).rows[0].n,1)
 // Telemetry failures must not roll back a valid financial order.
 await db.exec(`create function fail_analytics() returns trigger language plpgsql as $$begin raise exception 'fixture';end$$;create trigger fail_analytics before insert on serenity_analytics_outbox_v1 for each row execute function fail_analytics();`)
 const isolated=await start();assert.equal((await observe(isolated)).application_state,'applied')
 await db.exec('drop trigger fail_analytics on serenity_analytics_outbox_v1')
 const recovered=(await db.query('select * from serenity_analytics_claim_v1(3)')).rows
 assert.equal(recovered.length,1);assert.equal(recovered[0].order_id,isolated.id)
 await db.query("update serenity_analytics_outbox_v1 set leased_at=now()-interval '6 minutes' where order_id=$1",[isolated.id])
 assert.equal((await db.query('select * from serenity_analytics_claim_v1(3)')).rows.length,0)
 assert.equal((await db.query('select state from serenity_analytics_outbox_v1 where order_id=$1',[isolated.id])).rows[0].state,'review')
 await db.exec('set role anon');await assert.rejects(db.query('select * from serenity_analytics_outbox_v1'),/permission denied/)
 }finally{await db.close()}
})
