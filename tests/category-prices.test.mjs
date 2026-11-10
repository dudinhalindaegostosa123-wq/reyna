import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {guestDatabase} from './helpers/guest-db.mjs'
test('category prices preview exact membership, block stale edits, apply once across overlapping categories and preserve other products',async()=>{
 const db=await guestDatabase();try{

 const sql=readFileSync(new URL('../database/admin/03-precos-por-categoria.sql',import.meta.url),'utf8')
 await db.exec(sql);await db.exec(sql)
 const one=randomUUID(),variable=randomUUID(),variant=randomUUID(),other=randomUUID(),hidden=randomUUID(),accessory=randomUUID(),disabled=randomUUID(),actor=randomUUID(),batch=randomUUID()
 for(const [id,name,status,type,price,slugs] of [[one,'Argola','published','simple',100,['argolas','titanio']],[variable,'Argola Azul','published','variable',null,['argolas']],[other,'Argola fora da categoria','published','simple',500,['outros']],[hidden,'Argola oculta','draft','simple',300,['argolas']],[accessory,'Acessório','published','simple',50,['argolas']]]){
 await db.query("insert into products(id,slug,name,material,status,visibility,product_type,regular_price,sale_price,categories,tags,stock_status,sold_individually) values($1,$1::uuid::text,$2,'Titânio',$3,'visible',$4,$5,null,$6,'{}','instock',false)",[id,name,status,type,price,slugs])
 }
 await db.query("insert into product_variants(id,product_id,enabled,regular_price,sale_price,name) values($1,$2,true,200,150,'Azul'),($3,$2,false,300,null,'Desativada')",[variant,variable,disabled])
 const call=async(percent=-10,b=null,hash=null,category='argolas')=>(await db.query('select serenity_category_prices_v1($1,$2,$3,$4,$5) r',[category,percent,b?actor:null,b,hash])).rows[0].r
 const preview=await call();assert.equal(preview.count,3)
 assert.equal(Number((await db.query('select regular_price from products where id=$1',[one])).rows[0].regular_price),100)
 await db.query('update product_variants set regular_price=220 where id=$1',[variant])
 await assert.rejects(call(-10,batch,preview.fingerprint),/CATEGORY_PRICE_STALE/)
 const fresh=await call();await call(-10,batch,fresh.fingerprint);await call(-10,batch,fresh.fingerprint)
 assert.equal(Number((await db.query('select regular_price from products where id=$1',[one])).rows[0].regular_price),90)
 assert.equal(Number((await db.query('select regular_price from products where id=$1',[accessory])).rows[0].regular_price),45)
 const v=(await db.query('select regular_price,sale_price from product_variants where id=$1',[variant])).rows[0]
 assert.equal(Number(v.regular_price),198);assert.equal(Number(v.sale_price),135)
 assert.equal(Number((await db.query('select regular_price from product_variants where id=$1',[disabled])).rows[0].regular_price),300)
 for(const [id,expected] of [[other,500],[hidden,300]])assert.equal(Number((await db.query('select regular_price from products where id=$1',[id])).rows[0].regular_price),expected)
 const audit=(await db.query('select backup from serenity_category_price_batches_v1')).rows
 assert.equal(audit.length,1);assert.equal(audit[0].backup.length,3)
 await assert.rejects(call(-100),/CATEGORY_PRICE_INPUT/)
 await assert.rejects(call(-10,null,null,''),/CATEGORY_PRICE_INPUT/)
 await assert.rejects(call(-10,batch,fresh.fingerprint,'outros'),/CATEGORY_PRICE_BATCH/)
 await db.exec('set role anon');await assert.rejects(call(),/permission denied/)
 await db.exec('set role authenticated');await assert.rejects(call(),/permission denied/)
 }finally{await db.close()}
})
