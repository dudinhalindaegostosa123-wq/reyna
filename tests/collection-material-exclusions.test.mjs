import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {guestDatabase} from './helpers/guest-db.mjs'
test('progressive excludes gold and bioflex from quantity and discount; eligible titanium still combines with coupons',async()=>{
 const db=await guestDatabase()
 try{
  for(const file of ['05-servicos-esterilizacao-hastes.sql','06-haste-opcional.sql'])await db.exec(readFileSync(new URL('../database/commerce/'+file,import.meta.url),'utf8'))
  const migration=readFileSync(new URL('../database/collection/03-excluir-ouro-bioflex.sql',import.meta.url),'utf8')
  await db.exec(migration);await db.exec(migration)
  const fixtures=[['titanio','Topo Titânio','Titânio'],['ouro','Argola Ouro 18K','Ouro 18K'],['bioflex','Labret Bioflex','Bioflex'],['ouro750','Argola Ouro 750','Ouro 750'],['dourado','Topo Titânio revestido de ouro 18K','Titânio Revestido de Ouro 18K'],['fallback','Argola Ouro 18 K',''],['variable','Labret Bioflex','Bioflex']]
  let parent
  for(const [slug,name,material] of fixtures){
   const id=randomUUID();if(slug==='variable')parent=id
   await db.query("insert into products(id,slug,name,material,categories,status,visibility,stock_status,sold_individually,product_type,regular_price) values($1,$2,$3,$4,'{Topo}','published','visible','instock',false,$5,100)",[id,slug,name,material,slug==='variable'?'variable':'simple'])
  }
  const variant=randomUUID()
  await db.query("insert into product_variants(id,product_id,woo_id,enabled,regular_price,stock_status,name,attributes) values($1,$2,42,true,100,'instock','Transparente','{}')",[variant,parent])
  const line=(slug,quantity)=>({slug,quantity,variant:slug==='variable'?'42':'',color:''})
  const quote=async(lines,code=null)=>(await db.query("select serenity_checkout_coupon_quote_v2($1,$2,repeat('a',64),null) q",[JSON.stringify(lines),code])).rows[0].q
  for(const slug of ['ouro','bioflex','ouro750','fallback','variable']){
   const q=await quote([line(slug,5)])
   assert.equal(q.progressive.quantity,0,slug);assert.equal(q.progressive.discount_cents,0,slug);assert.equal(q.total_cents,50000,slug)
  }
  const mix=await quote([line('titanio',2),line('ouro',4),line('bioflex',4)])
  assert.equal(mix.progressive.quantity,2);assert.equal(mix.progressive.eligible_cents,20000);assert.equal(mix.progressive.discount_cents,2000)
  const coupon=randomUUID();await db.query("insert into serenity_coupons values($1,'TEST10','active',null,null,'all',0,'percent',10,100,100,1)",[coupon])
  const combined=await quote([line('titanio',2),line('ouro',4),line('bioflex',4)],'TEST10')
  assert.equal(combined.coupon.discount_cents,10000);assert.equal(combined.progressive.quantity,2);assert.equal(combined.progressive.discount_cents,1800)
  const coated=await quote([line('dourado',2)]);assert.equal(coated.progressive.quantity,2)
  await db.exec('set role anon');await assert.rejects(db.query('select serenity_collection_is_jewel_v1($1)',[parent]),/permission denied/)
 }finally{await db.close()}
})
