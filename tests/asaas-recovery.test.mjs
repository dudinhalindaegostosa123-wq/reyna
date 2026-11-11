import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {randomUUID} from 'node:crypto'
import {lunarityCatalogDatabase} from './helpers/lunarity-db.mjs'
const sql=fs.readFileSync(new URL('../database/asaas/05-liberar-pix-recusado.sql',import.meta.url),'utf8')
test('explicit Pix recovery only releases a recorded charge rejection, preserving reservations and history safely',async()=>{
 const db=await lunarityCatalogDatabase()
 try{
  await db.exec(fs.readFileSync(new URL('../database/asaas/03-instalar-base-lunarity.sql',import.meta.url),'utf8'))
  await db.exec(sql);await db.exec(sql)
  const actor=randomUUID(),product=randomUUID()
  await db.query("insert into auth.users values($1,'admin@example.test',now())",[actor])
  await db.query(`insert into products(id,slug,name,status,visibility,product_type,regular_price,stock_status,stock_quantity)
   values($1,'recovery-item','Argola Teste','published','visible','simple',50,'instock',100)`,[product])
  const prepare=async({method='pix',code='ASAAS_HTTP_400',bind=true}={})=>{
   const id=randomUUID(),shipping=randomUUID(),attempt=randomUUID(),access=id.replaceAll('-','').repeat(2)
   await db.query(`insert into serenity_shipping_quotes(id,request_id,cart_hash,destination,subtotal_cents,amount_cents,manual,settings_version,snapshot,expires_at)
    values($1,$2,repeat('b',64),'18053351',5000,1000,false,1,'{"pricing_mode":"retail"}',now()+interval '15 minutes')`,[shipping,id])
   await db.query(`select serenity_checkout_start_v2($1,repeat('a',64),$2,'production',null,$3,$4,$5,6000,repeat('b',64),$6,'',repeat('c',64))`,[
    id,access,JSON.stringify([{slug:'recovery-item',variant:'',quantity:1,color:''}]),
    JSON.stringify({name:'Teste',email:'fixture@example.test',phone:'11999999999',document:'52998224725'}),
    JSON.stringify({cep:'18053351',street:'Rua',number:'1',complement:'',district:'Centro',city:'Sorocaba',state:'SP'}),shipping])
   await db.query('select serenity_checkout_select_method_v4($1,$2,$3)',[id,access,method])
   const claim=(await db.query("select serenity_asaas_claim_v1($1,$2,$3,'123',repeat('d',64),$4) a",[id,access,attempt,method])).rows[0].a
   if(bind)await db.query("select serenity_asaas_customer_v1($1,$2,'cus_fixture')",[attempt,claim.lease_id])
   await db.query("select serenity_asaas_uncertain_v1($1,$2,repeat('d',64),$3)",[attempt,claim.lease_id,code])
   const stamp=(await db.query('select updated_at::text stamp from serenity_checkout_payments_v2 where id=$1',[attempt])).rows[0].stamp
   return {id,attempt,access,stamp}
  }
  const release=async(s,who=actor,stamp=s.stamp)=>(await db.query('select serenity_asaas_release_rejected_pix_v1($1,$2,$3) r',[s.attempt,stamp,who])).rows[0].r
  const s=await prepare()
  assert.equal((await release(s)).retry_available,true)
  assert.equal((await release(s)).released,true)
  const row=(await db.query('select * from serenity_checkout_payments_v2 where id=$1',[s.attempt])).rows[0]
  assert.equal(row.state,'rejected');assert.equal(row.blocks_new_attempt,false)
  assert.equal(row.last_error_code,'ASAAS_REJECTED_NO_CHARGE')
  assert.equal((await db.query("select count(*)::integer n from serenity_checkout_payment_events_v2 where attempt_id=$1 and source='admin'",[s.attempt])).rows[0].n,1)
  assert.equal((await db.query('select count(*)::integer n from serenity_orders')).rows[0].n,0)
  assert.equal((await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity,100)
  const next=randomUUID()
  assert.equal((await db.query("select serenity_asaas_claim_v1($1,$2,$3,'123',repeat('e',64),'pix') a",[s.id,s.access,next])).rows[0].a.submit,true)
  // Repeated admin action must not reset a newer attempt or the checkout state.
  await release(s)
  assert.equal((await db.query('select state from serenity_checkout_sessions_v2 where id=$1',[s.id])).rows[0].state,'payment_pending')
  for(const options of [{method:'card'},{code:'ASAAS_SUBMISSION_UNCERTAIN'},{code:'ASAAS_HTTP_500'},{bind:false}]){
   const blocked=await prepare(options)
   await assert.rejects(release(blocked),/PAYMENT_RECOVERY_UNAVAILABLE/)
   assert.equal((await db.query('select state from serenity_checkout_payments_v2 where id=$1',[blocked.attempt])).rows[0].state,'uncertain')
  }
  const mapped=await prepare()
  await db.query("update serenity_checkout_payments_v2 set provider_payment_id='pay_existing' where id=$1",[mapped.attempt])
  await assert.rejects(release(mapped),/PAYMENT_RECOVERY_UNAVAILABLE/)
  const stale=await prepare()
  await assert.rejects(release(stale,actor,'2000-01-01T00:00:00Z'),/PAYMENT_RECOVERY_UNAVAILABLE/)
  await assert.rejects(release(stale,randomUUID()),/PAYMENT_ADMIN_REQUIRED/)
  const expired=await prepare()
  await db.query("update serenity_checkout_sessions_v2 set created_at=now()-interval '40 minutes',expires_at=now()-interval '1 minute',access_expires_at=now()+interval '22 hours' where id=$1",[expired.id])
  assert.equal((await release(expired)).retry_available,false)
  assert.equal((await db.query('select state from serenity_checkout_sessions_v2 where id=$1',[expired.id])).rows[0].state,'expired')
  assert.equal((await db.query("select count(*)::integer n from serenity_checkout_stock_v2 where checkout_id=$1 and state='active'",[expired.id])).rows[0].n,0)
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'serenity_asaas_release_rejected_pix_v1(uuid,timestamptz,uuid)','execute') ok",[role])).rows[0].ok,false)
 }finally{await db.close()}
})
