import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {paymentDatabase} from './helpers/payment-db.mjs'
test('color curation public view exposes only published catalog membership, never admin identity or mutation access',async()=>{
 const db=await paymentDatabase();try{
 const sql=readFileSync(new URL('../database/stone-colors/01-curadoria.sql',import.meta.url),'utf8')
 await db.exec(sql);await db.exec(sql)
 const visible=randomUUID(),hidden=randomUUID(),draft=randomUUID(),actor=randomUUID()
 for(const [id,status,visibility] of [[visible,'published','visible'],[hidden,'published','hidden'],[draft,'draft','visible']]){
  await db.query("insert into products(id,name,status,visibility) values($1,'Fixture',$2,$3)",[id,status,visibility])
  await db.query("insert into serenity_stone_color_overrides_v1(color_id,product_id,included,updated_by) values('verde',$1,false,$2)",[id,actor])
 }
 await assert.rejects(db.query("insert into serenity_stone_color_overrides_v1(color_id,product_id,included,updated_by) values('invalido',$1,true,$2)",[visible,actor]),/check constraint/)
 await db.exec('set role anon')
 const rows=(await db.query('select * from serenity_stone_overrides_public_v1')).rows
 assert.equal(rows.length,1);assert.equal(rows[0].product_id,visible)
 assert.deepEqual(Object.keys(rows[0]).sort(),['color_id','included','product_id'])
 await assert.rejects(db.query('select * from serenity_stone_color_overrides_v1'),/permission denied/)
 await assert.rejects(db.query('delete from serenity_stone_color_overrides_v1'),/permission denied/)
 await db.exec('set role authenticated');await assert.rejects(db.query('update serenity_stone_color_overrides_v1 set included=true'),/permission denied/)
 }finally{await db.close()}
})

test('custom colors preserve curation, accept new pages and expose no write access',async()=>{
 const db=await paymentDatabase();try{
 await db.exec(readFileSync(new URL('../database/stone-colors/01-curadoria.sql',import.meta.url),'utf8'))
 const product=randomUUID(),actor=randomUUID()
 await db.query("insert into products(id,name,status,visibility) values($1,'Fixture','published','visible')",[product])
 await db.query("insert into serenity_stone_color_overrides_v1 values('verde',$1,false,$2,now())",[product,actor])
 const sql=readFileSync(new URL('../database/stone-colors/02-cores-personalizadas.sql',import.meta.url),'utf8')
 await db.exec(sql);await db.exec(sql)
 assert.equal((await db.query('select * from serenity_stone_colors_public_v1')).rows.length,13)
 await db.query("insert into serenity_stone_colors_v1(id,name,color,updated_by) values('opala-branca','Opala branca','#ffffff',$1)",[actor])
 await db.query("insert into serenity_stone_color_overrides_v1 values('opala-branca',$1,true,$2,now())",[product,actor])
 assert.equal((await db.query("select included from serenity_stone_color_overrides_v1 where color_id='verde'")).rows[0].included,false)
 await assert.rejects(db.query("insert into serenity_stone_colors_v1(id,name,color) values('bad','Bad','javascript:bad')"),/check constraint/)
 await db.exec('set role anon')
 const rows=(await db.query('select * from serenity_stone_colors_public_v1')).rows
 assert.ok(rows.some(row=>row.id==='opala-branca'))
 assert.ok(rows.every(row=>!('updated_by' in row)))
 await assert.rejects(db.query("insert into serenity_stone_colors_v1(id,name,color) values('bad','Bad','#ffffff')"),/permission denied/)
 }finally{await db.close()}
})
