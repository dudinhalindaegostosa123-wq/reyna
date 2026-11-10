import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {guestDatabase} from './helpers/guest-db.mjs'
test('compatibility repair replaces installed category queries without a category_slugs column',async()=>{
 const db=await guestDatabase();try{
 const source=readFileSync(new URL('../database/admin/03-precos-por-categoria.sql',import.meta.url),'utf8')
 await db.exec(source.replaceAll('public.serenity_price_category_matches_v1(p.id,p_category)',"p_category=any(coalesce(p.category_slugs,'{}'::text[]))"))
 const repair=readFileSync(new URL('../database/admin/05-compatibilidade-categorias.sql',import.meta.url),'utf8')
 await db.exec(repair);await db.exec(repair)
 const id=randomUUID()
 await db.query("insert into products(id,name,categories,material,status,visibility,product_type,regular_price) values($1,'Fixture','{Joias para Orelha}','Titânio','published','visible','simple',100)",[id])
 const result=(await db.query("select serenity_category_prices_v1('joias-para-orelha',-10,null,null,null) r")).rows[0].r
 assert.equal(result.count,1)
 }finally{await db.close()}
})
