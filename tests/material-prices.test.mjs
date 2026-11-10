import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {guestDatabase} from './helpers/guest-db.mjs'
test('material adjustment previews exact products and variants, blocks stale edits, applies once and audits old prices',async()=>{
 const db=await guestDatabase()
 try{
 const sql=readFileSync(new URL('../database/admin/02-precos-por-material.sql',import.meta.url),'utf8')
 await db.exec(sql);await db.exec(sql)
 const one=randomUUID(),variable=randomUUID(),variant=randomUUID(),other=randomUUID(),hidden=randomUUID(),tool=randomUUID(),actor=randomUUID(),batch=randomUUID()
 for(const [id,name,material,status,type,price] of [[one,'Argola','Titânio','published','simple',100],[variable,'Argola Azul','Titânio','published','variable',null],[other,'Argola','Ouro','published','simple',500],[hidden,'Argola oculta','Titânio','draft','simple',300],[tool,'Pinça','Titânio','published','simple',50]]){
  await db.query("insert into products(id,slug,name,material,status,visibility,product_type,regular_price,sale_price,categories,tags,stock_status,sold_individually) values($1,$1::uuid::text,$2,$3,$4,'visible',$5,$6,null,'{Argolas}','{}','instock',false)",[id,name,material,status,type,price])
 }
 await db.query("insert into product_variants(id,product_id,enabled,regular_price,sale_price,name) values($1,$2,true,200,150,'Azul')",[variant,variable])
 const call=async(percent=-10,b=null,hash=null)=>(await db.query('select serenity_material_prices_v1($1,$2,$3,$4,$5) r',['Titânio',percent,b?actor:null,b,hash])).rows[0].r
 const preview=await call();assert.equal(preview.count,2)
 assert.equal(Number((await db.query('select regular_price from products where id=$1',[one])).rows[0].regular_price),100)
 await db.query('update product_variants set regular_price=220 where id=$1',[variant])
 await assert.rejects(call(-10,batch,preview.fingerprint),/MATERIAL_PRICE_STALE/)
 const fresh=await call();await call(-10,batch,fresh.fingerprint);await call(-10,batch,fresh.fingerprint)
 assert.equal(Number((await db.query('select regular_price from products where id=$1',[one])).rows[0].regular_price),90)
 const v=(await db.query('select regular_price,sale_price from product_variants where id=$1',[variant])).rows[0]
 assert.equal(Number(v.regular_price),198);assert.equal(Number(v.sale_price),135)
 for(const [id,expected] of [[other,500],[hidden,300],[tool,50]])assert.equal(Number((await db.query('select regular_price from products where id=$1',[id])).rows[0].regular_price),expected)
 assert.equal((await db.query('select count(*) n from serenity_material_price_batches_v1')).rows[0].n,1)
 const audit=(await db.query('select backup from serenity_material_price_batches_v1')).rows[0].backup
 assert.equal(audit.length,2)
 await assert.rejects(call(-100),/MATERIAL_PRICE_INPUT/)
 await db.exec('set role anon');await assert.rejects(call(),/permission denied/)
 }finally{await db.close()}
})
