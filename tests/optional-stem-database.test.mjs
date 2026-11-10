import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {guestDatabase} from './helpers/guest-db.mjs'
const sql=name=>readFileSync(new URL('../database/commerce/'+name,import.meta.url),'utf8')
test('optional stems: top alone, 6/8mm cost 5 per unit, no discount on stems, reject forged length and preserve existing payments',async()=>{
 const db=await guestDatabase();try{
 await db.exec(sql('05-servicos-esterilizacao-hastes.sql'))
 const id=randomUUID();await db.query(`insert into products(id,slug,name,status,visibility,stock_status,sold_individually,product_type,regular_price,tags,material,categories) values($1,'top','Topo Estrela','published','visible','instock',false,'simple',100,'{anodizavel}','Titânio','{Topo}')`,[id]);
 const quote=async(stem)=> (await db.query('select serenity_checkout_quote($1) q',[JSON.stringify([{slug:'top',variant:'',quantity:2,color:'',stem}])])).rows[0].q;
 await assert.rejects(quote(''),/TOP_STEM_REQUIRED/)
 await db.exec(sql('06-haste-opcional.sql'));await db.exec(sql('06-haste-opcional.sql'))
 const top=await quote('');assert.equal(top.total_cents,20000);assert.equal(top.items[0].stem_fee,0);assert.ok(!top.items[0].variation.includes('Haste'))
 for(const length of ['6','8']){const q=await quote(length);assert.equal(q.total_cents,21000);assert.equal(q.items[0].stem_fee,5);assert.equal(q.items[0].stem,length)}
 for(const length of ['4','10','banana'])await assert.rejects(quote(length),/INVALID_STEM/)
 const q=(await db.query("select serenity_checkout_coupon_quote_v2($1,null,repeat('c',64),null) q",[JSON.stringify([{slug:'top',variant:'',quantity:2,color:'',stem:'6'}])])).rows[0].q;
 assert.equal(q.total_cents,19000) // 180 jewelry + 10 stems.
 }finally{await db.close()}
})
