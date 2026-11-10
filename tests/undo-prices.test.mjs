import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {guestDatabase} from './helpers/guest-db.mjs'
for(const kind of ['material','category'])test(`${kind}: undo restores exact regular/promotional prices, rejects later edits atomically and is idempotent`,async()=>{
 const db=await guestDatabase()
 try{
  for(const file of ['02-precos-por-material.sql','03-precos-por-categoria.sql','06-desfazer-reajuste.sql','06-desfazer-reajuste.sql'])await db.exec(readFileSync(new URL('../database/admin/'+file,import.meta.url),'utf8'))
  const product=randomUUID(),parent=randomUUID(),variant=randomUUID(),actor=randomUUID(),batch=randomUUID()
  await db.query("insert into products(id,name,material,status,visibility,product_type,regular_price,sale_price,categories) values($1,'Argola','Titânio','published','visible','simple',99.99,null,'{Argolas}'),($2,'Argola variável','Titânio','published','visible','variable',null,null,'{Argolas}')",[product,parent])
  await db.query("insert into product_variants(id,product_id,enabled,regular_price,sale_price,name) values($1,$2,true,123.45,98.76,'Azul')",[variant,parent])
  const apply=async(k,b,percent)=>{
   const target=k==='material'?'Titânio':'argolas'
   const preview=(await db.query(`select serenity_${k}_prices_v1($1,$2) r`,[target,percent])).rows[0].r
   await db.query(`select serenity_${k}_prices_v1($1,$2,$3,$4,$5)`,[target,percent,actor,b,preview.fingerprint])
  }
  const undo=async(k=kind,b=batch)=>db.query('select serenity_undo_prices_v1($1,$2,$3)',[k,b,actor])
  await apply(kind,batch,-13.37)
  const newer=randomUUID(),other=kind==='material'?'category':'material'
  await apply(other,newer,20)
  await assert.rejects(undo(),/PRICE_UNDO_CHANGED/)
  await undo(other,newer)
  await db.query('update product_variants set sale_price=1 where id=$1',[variant])
  await assert.rejects(undo(),/PRICE_UNDO_CHANGED/)
  assert.equal(Number((await db.query('select regular_price from products where id=$1',[product])).rows[0].regular_price),86.62)
  assert.equal((await db.query('select count(*) n from serenity_price_undos_v1 where batch=$1',[batch])).rows[0].n,0)
  await db.query('update product_variants set sale_price=85.56 where id=$1',[variant])
  await undo()
  const restored=(await db.query('select regular_price,sale_price from product_variants where id=$1',[variant])).rows[0]
  assert.equal(Number(restored.regular_price),123.45);assert.equal(Number(restored.sale_price),98.76)
  const p=(await db.query('select regular_price,sale_price from products where id=$1',[product])).rows[0]
  assert.equal(Number(p.regular_price),99.99);assert.equal(p.sale_price,null)
  // Retrying an already completed undo must not overwrite subsequent manual edits.
  await db.query('update products set regular_price=150 where id=$1',[product]);await undo()
  assert.equal(Number((await db.query('select regular_price from products where id=$1',[product])).rows[0].regular_price),150)
  assert.equal((await db.query('select count(*) n from serenity_price_undos_v1 where batch=$1',[batch])).rows[0].n,1)
  await assert.rejects(undo('other'),/PRICE_UNDO_INPUT/)
  await assert.rejects(undo(kind,randomUUID()),/PRICE_UNDO_NOT_FOUND/)
  await db.exec('set role anon');await assert.rejects(undo(),/permission denied/)
  await db.exec('set role authenticated');await assert.rejects(undo(),/permission denied/)
 }finally{await db.close()}
})
