import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {guestDatabase} from './helpers/guest-db.mjs'
const sql=readFileSync(new URL('../database/commerce/05-servicos-esterilizacao-hastes.sql',import.meta.url),'utf8')
test('new services charge per unit outside discounts, complete paid guest orders once and preserve old saved fees',async()=>{
 const db=await guestDatabase()
 try{
 const product=randomUUID()
 await db.query(`insert into products(id,slug,name,status,visibility,stock_status,sold_individually,product_type,regular_price,tags,material,categories) values($1,'labret','Topo Estrela','published','visible','instock',false,'simple',100,'{anodizavel}','Titânio','{Topo}')`,[product])
 const items=[{slug:'labret',variant:'',quantity:2,color:'',stem:'6',sterilized:true}]
 const quote=async()=> (await db.query("select serenity_checkout_coupon_quote_v2($1,null,repeat('c',64),null) q",[JSON.stringify(items)])).rows[0].q
 const start=async()=>{
  const id=randomUUID(),attempt=randomUUID(),shipping=randomUUID(),q=await quote()
  await db.query(`insert into serenity_shipping_quotes(id,request_id,cart_hash,destination,subtotal_cents,amount_cents,manual,settings_version,snapshot,expires_at) values($1,$2,repeat('b',64),'18072000',$3,1000,false,1,'{"pricing_mode":"retail"}',now()+interval '15 minutes')`,[shipping,id,q.subtotal_cents])
  await db.query(`select serenity_checkout_start_v2($1,repeat('a',64),(replace($1::uuid::text,'-','')||replace($1::uuid::text,'-','')),'production',null,$2,$3,$4,$5,repeat('b',64),$6,null,repeat('c',64))`,[id,JSON.stringify(items),JSON.stringify({name:'Cliente',email:'guest@example.com',phone:'11999999999',document:'52998224725'}),JSON.stringify({cep:'18072000',street:'Rua',number:'1',complement:'',district:'Centro',city:'Sorocaba',state:'SP'}),q.total_cents+1000,shipping])
  await db.query("select serenity_guest_register_v1($1,(replace($1::uuid::text,'-','')||replace($1::uuid::text,'-','')),$2)",[id,id.replaceAll('-','').repeat(2)])
  const p=(await db.query("select serenity_checkout_select_method_v4($1,(replace($1::uuid::text,'-','')||replace($1::uuid::text,'-','')),'pix') p",[id])).rows[0].p
  await db.query("select serenity_checkout_claim_pix_v2($1,(replace($1::uuid::text,'-','')||replace($1::uuid::text,'-','')),$2,'123',repeat('d',64))",[id,attempt])
  return {id,attempt,total:p.total_cents}
 }
 const old=await start()
 await db.exec(sql);await db.exec(sql)
 await db.exec(readFileSync(new URL('../database/commerce/06-haste-opcional.sql',import.meta.url),'utf8'))
 const q=await quote()
 assert.equal(q.items[0].unit_price,100);assert.equal(q.items[0].sterilization_fee,10);assert.equal(q.items[0].stem_fee,5)
 assert.equal(q.subtotal_cents,23000);assert.equal(q.total_cents,21000) // 10% off jewelry only.
 const anodized=(await db.query('select serenity_checkout_quote($1) q',[JSON.stringify(items.map(item=>({...item,color:'28'})))])).rows[0].q
 assert.equal(anodized.items[0].fee,0)
 const fresh=await start();assert.equal(fresh.total,21100) // 180 - 9 Pix + 30 services + 10 shipping.
 items[0].stem=''
 const topOnly=await start();assert.equal(topOnly.total,20100)
 let paymentId=12345
 for(const s of [old,fresh,topOnly]){
  const facts={provider_payment_id:String(paymentId++),external_reference:s.id,attempt_id:s.attempt,environment:'production',merchant_id:'123',amount_cents:s.total,currency:'BRL',method:'pix',status:'approved',status_detail:'fixture',refunded_cents:0,updated_at:new Date().toISOString()}
  const observe=async()=> (await db.query("select serenity_checkout_observe_payment_v2($1,$2,'webhook') r",[s.attempt,JSON.stringify(facts)])).rows[0].r
  const result=await observe();assert.equal(result.application_state,'applied',JSON.stringify(result));await observe()
  const order=(await db.query('select * from serenity_orders where id=$1',[s.id])).rows[0]
  assert.equal(Math.round(Number(order.total)*100),s.total)
  assert.equal(order.items[0].sterilization_fee,s===old?5:10)
  assert.equal(order.items[0].stem_fee || 0,s===old || s===topOnly?0:5)
  const receipt=(await db.query("select payload from serenity_email_outbox_v1 where checkout_id=$1 and kind='received'",[s.id])).rows[0]
  assert.equal(receipt.payload.items[0].unit_price,s===old?105:s===topOnly?110:115)
 }
 await db.exec('set role anon');await assert.rejects(db.query('select serenity_checkout_quote($1)',[JSON.stringify(items)]),/permission denied/)
 }finally{await db.close()}
})
