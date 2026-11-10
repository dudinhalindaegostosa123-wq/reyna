import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {guestDatabase} from './helpers/guest-db.mjs'
const sql=(folder,name)=>readFileSync(new URL('../database/'+folder+'/'+name,import.meta.url),'utf8')
test('new tiers 5/7/10/15 apply to new retail quotes, preserve paid snapshots, exclude services and permit one inexpensive item',async()=>{
 const db=await guestDatabase();try{
 await db.exec(sql('commerce','05-servicos-esterilizacao-hastes.sql'))
 await db.exec(sql('commerce','06-haste-opcional.sql'))
 const product=randomUUID()
 await db.query(`insert into products(id,slug,name,status,visibility,stock_status,sold_individually,product_type,regular_price,tags,material,categories) values($1,'labret','Topo Estrela','published','visible','instock',false,'simple',100,'{anodizavel}','Titânio','{Topo}')`,[product])
 const items=[{slug:'labret',variant:'',quantity:4,color:'',stem:'6',sterilized:true}]
 const quote=async(lines=items,code=null)=>(await db.query("select serenity_checkout_coupon_quote_v2($1,$2,repeat('c',64),null) q",[JSON.stringify(lines),code])).rows[0].q
 const start=async()=>{
  const id=randomUUID(),attempt=randomUUID(),shipping=randomUUID(),q=await quote()
  await db.query(`insert into serenity_shipping_quotes(id,request_id,cart_hash,destination,subtotal_cents,amount_cents,manual,settings_version,snapshot,expires_at) values($1,$2,repeat('b',64),'18072000',$3,1000,false,1,'{"pricing_mode":"retail"}',now()+interval '15 minutes')`,[shipping,id,q.subtotal_cents])
  await db.query(`select serenity_checkout_start_v2($1,repeat('a',64),(replace($1::uuid::text,'-','')||replace($1::uuid::text,'-','')),'production',null,$2,$3,$4,$5,repeat('b',64),$6,null,repeat('c',64))`,[id,JSON.stringify(items),JSON.stringify({name:'Cliente',email:'guest@example.com',phone:'11999999999',document:'52998224725'}),JSON.stringify({cep:'18072000',street:'Rua',number:'1',complement:'',district:'Centro',city:'Sorocaba',state:'SP'}),q.total_cents+1000,shipping])
  await db.query("select serenity_guest_register_v1($1,(replace($1::uuid::text,'-','')||replace($1::uuid::text,'-','')),$2)",[id,id.replaceAll('-','').repeat(2)])
  const p=(await db.query("select serenity_checkout_select_method_v4($1,(replace($1::uuid::text,'-','')||replace($1::uuid::text,'-','')),'pix') p",[id])).rows[0].p
  await db.query("select serenity_checkout_claim_pix_v2($1,(replace($1::uuid::text,'-','')||replace($1::uuid::text,'-','')),$2,'123',repeat('d',64))",[id,attempt])
  return {id,attempt,total:p.total_cents}
 }
 const old=await start();assert.equal(old.total,37400)
 const signature='public.serenity_checkout_coupon_quote_v2(jsonb,text,text,uuid)'
 const definition=(await db.query('select pg_get_functiondef($1::regprocedure) d',[signature])).rows[0].d
 await db.exec(definition.replace('percent := case when units','percent\n := case\n when units'))
 await db.exec("alter table products add column category_slugs text[] default '{}'")
 const migration=sql('releases','2026-11-04-progressivo-categorias.sql')
 await db.exec(migration);await db.exec(migration)
 for(const [quantity,percent] of [[1,0],[2,5],[3,7],[4,10],[5,15],[6,15]]){
  const q=await quote([{...items[0],quantity,stem:'',sterilized:false}])
  assert.equal(q.progressive.percent,percent);assert.equal(q.total_cents,quantity*10000*(100-percent)/100)
 }
 assert.equal((await quote()).total_cents,42000)
 const coupon=randomUUID();await db.query("insert into serenity_coupons values($1,'TEST10','active',null,null,'all',0,'percent',10,100,100,1)",[coupon])
 const combined=await quote(items,'TEST10');assert.equal(combined.total_cents,38400)
 assert.equal(combined.coupon.discount_cents,4000);assert.equal(combined.progressive.discount_cents,3600)
 const fresh=await start();assert.equal(fresh.total,41200)
 let paymentId=23456
 for(const s of [old,fresh]){
  const facts={provider_payment_id:String(paymentId++),external_reference:s.id,attempt_id:s.attempt,environment:'production',merchant_id:'123',amount_cents:s.total,currency:'BRL',method:'pix',status:'approved',status_detail:'fixture',refunded_cents:0,updated_at:new Date().toISOString()}
  const result=(await db.query("select serenity_checkout_observe_payment_v2($1,$2,'webhook') r",[s.attempt,JSON.stringify(facts)])).rows[0].r
  assert.equal(result.application_state,'applied',JSON.stringify(result))
  const order=(await db.query('select * from serenity_orders where id=$1',[s.id])).rows[0]
  assert.equal(Math.round(Number(order.total)*100),s.total)
 }
 await db.query('update products set regular_price=1 where id=$1',[product])
 const low=await quote([{...items[0],quantity:1,stem:'',sterilized:false}]);assert.equal(low.total_cents,100)
 await db.exec('set role anon');await assert.rejects(quote(),/permission denied/)
 }finally{await db.close()}
})
