import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {randomUUID} from 'node:crypto'
import {lunarityCatalogDatabase} from './helpers/lunarity-db.mjs'
const base=fs.readFileSync(new URL('../database/asaas/03-instalar-base-lunarity.sql',import.meta.url),'utf8')
const migration=fs.readFileSync(new URL('../database/asaas/04-compra-sem-cadastro.sql',import.meta.url),'utf8')

test('Lunarity guest checkout uses the installed Asaas flow without email or shipping-label tables',async()=>{
 const db=await lunarityCatalogDatabase()
 try{
  await db.exec(base);await db.exec(migration);await db.exec(migration)
  assert.deepEqual((await db.query('select serenity_guest_checkout_ready_v1() ready')).rows[0].ready,{version:1,ready:true})
  const product=randomUUID()
  await db.query(`insert into products(id,slug,name,status,visibility,product_type,material,categories,regular_price,stock_status,stock_quantity)
   values($1,'guest-item','Argola Lunarity','published','visible','simple','Titânio','{Argolas}',50,'instock',10)`,[product])
  const id=randomUUID(),shipping=randomUUID(),access='a'.repeat(64),tokenHash='b'.repeat(64)
  const items=JSON.stringify([{slug:'guest-item',variant:'',quantity:1,color:''}])
  await db.query(`insert into serenity_shipping_quotes(id,request_id,cart_hash,destination,subtotal_cents,amount_cents,manual,settings_version,snapshot,expires_at)
   values($1,$2,repeat('c',64),'18053351',5000,1000,false,1,'{"pricing_mode":"retail"}',now()+interval '15 minutes')`,[shipping,id])
  await db.query(`select serenity_checkout_start_v2($1,repeat('d',64),$2,'production',null,$3,$4,$5,6000,repeat('c',64),$6,'',repeat('e',64))`,[
   id,access,items,JSON.stringify({name:'Visitante',email:'fixture@example.test',phone:'11999999999',document:'52998224725'}),
   JSON.stringify({cep:'18053351',street:'Rua',number:'1',complement:'',district:'Centro',city:'Sorocaba',state:'SP'}),shipping])
  await assert.rejects(db.query('select serenity_guest_register_v1($1,$2,$3)',[id,'f'.repeat(64),tokenHash]),/CHECKOUT_ACCESS_INVALID/)
  const registered=(await db.query('select serenity_guest_register_v1($1,$2,$3) n',[id,access,tokenHash])).rows[0].n
  assert.equal(Number(registered),1)
  assert.equal((await db.query('select serenity_guest_register_v1($1,$2,$3) n',[id,access,tokenHash])).rows[0].n,registered)
  await assert.rejects(db.query('select serenity_guest_register_v1($1,$2,$3)',[id,access,'f'.repeat(64)]),/GUEST_LINK_UNAVAILABLE/)
  const before=(await db.query('select serenity_checkout_context_v2($1,$2) c',[id,access])).rows[0].c
  assert.equal(before.guest_checkout,true);assert.ok(before.payment_options)
  assert.equal((await db.query('select serenity_guest_tracking_read_v1($1,\'production\') t',[tokenHash])).rows[0].t.status,'pending')
  assert.equal((await db.query('select serenity_guest_tracking_read_v1($1,\'test\') t',[tokenHash])).rows[0].t,null)
  const selected=(await db.query("select serenity_checkout_select_method_v4($1,$2,'pix') c",[id,access])).rows[0].c
  const attempt=randomUUID()
  const claim=(await db.query("select serenity_asaas_claim_v1($1,$2,$3,'123',repeat('f',64),'pix') a",[id,access,attempt])).rows[0].a
  assert.equal(claim.amount_cents,selected.total_cents)
  await db.query("select serenity_asaas_customer_v1($1,$2,'cus_fixture')",[attempt,claim.lease_id])
  const facts={provider_payment_id:'pay_guest',merchant_id:'123',customer_id:'cus_fixture',external_reference:id,attempt_id:attempt,
   environment:'production',method:'pix',currency:'BRL',amount_cents:claim.amount_cents,refunded_cents:0,status:'approved',status_detail:'CONFIRMED',
   updated_at:new Date().toISOString(),expires_at:null,invoice_url:null}
  const observe=()=>db.query("select serenity_asaas_observe_v1($1,$2,'webhook') r",[attempt,JSON.stringify(facts)])
  assert.equal((await observe()).rows[0].r.application_state,'applied');await observe()
  const order=(await db.query('select * from serenity_orders where id=$1',[id])).rows[0]
  assert.equal(order.account_user_id,null);assert.equal(order.customer_id,id);assert.equal(order.number,registered)
  assert.equal((await db.query('select count(*)::integer n from serenity_customer_accounts')).rows[0].n,0)
  assert.equal((await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity,9)
  const tracking=(await db.query("select serenity_guest_tracking_read_v1($1,'production') t",[tokenHash])).rows[0].t
  assert.equal(tracking.status,'paid');assert.equal(tracking.number,registered);assert.equal(tracking.carrier,null)
  assert.doesNotMatch(JSON.stringify(tracking),/fixture@example|529982|Visitante|pay_guest|cus_fixture/)
  const context=(await db.query('select serenity_checkout_context_v2($1,$2) c',[id,access])).rows[0].c
  assert.equal(context.guest_checkout,true);assert.equal(context.attempts[0].provider,'asaas')
  await db.exec(migration)
  assert.equal((await db.query('select count(*)::integer n from serenity_orders')).rows[0].n,1)
  await db.query('update serenity_guest_access_v1 set revoked=true where checkout_id=$1',[id])
  assert.equal((await db.query("select serenity_guest_tracking_read_v1($1,'production') t",[tokenHash])).rows[0].t,null)
  for(const role of ['anon','authenticated']){
   assert.equal((await db.query("select has_function_privilege($1,'serenity_guest_register_v1(uuid,text,text)','execute') ok",[role])).rows[0].ok,false)
   assert.equal((await db.query("select has_function_privilege($1,'serenity_guest_tracking_read_v1(text,text)','execute') ok",[role])).rows[0].ok,false)
  }
 }finally{await db.close()}
})
