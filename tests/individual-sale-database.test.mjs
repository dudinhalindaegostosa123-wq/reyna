import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {guestDatabase} from './helpers/guest-db.mjs'
const sql=name=>readFileSync(new URL('../database/commerce/'+name,import.meta.url),'utf8')
test('individual sale preserves unit and former pair prices, supports quantity two, rejects new pairs and preserves already issued payments',async()=>{
 const db=await guestDatabase();try{
 await db.exec(sql('05-servicos-esterilizacao-hastes.sql'))
 await db.exec(sql('06-haste-opcional.sql'))
 await db.exec(readFileSync(new URL('../database/collection/02-faixas-5-7-10-15.sql',import.meta.url),'utf8'))
 const p=randomUUID(),onlyPair=randomUUID(),unrelated=randomUUID(),pair=randomUUID(),unit=randomUUID(),solo=randomUUID(),actor=randomUUID()
 for(const [id,name,cat] of [[p,'Par de Piercing de Mamilo','Mamilo'],[onlyPair,'Topo Push Pin','Push Pin'],[unrelated,'Par de brincos','Brincos']])await db.query("insert into products(id,slug,name,material,status,visibility,product_type,regular_price,categories,tags,stock_status,stock_quantity,sold_individually) values($1,$1::uuid::text,$2,'Titânio','published','visible','variable',null,array[$3]::text[],'{}','instock',null,true)",[id,name,cat])
 for(const [id,parent,price,pack,woo] of [[pair,p,150,'Par',11],[unit,p,80,'Unidade',12],[solo,onlyPair,120,'Par',13]])await db.query("insert into product_variants(id,product_id,woo_id,enabled,stock_status,stock_quantity,regular_price,sale_price,attributes,name) values($1,$2,$5,true,'instock',null,$3::numeric,$3::numeric-10,jsonb_build_object('Escolha a Quantidade',$4::text),$4)",[id,parent,price,pack,woo])
 const items=[{slug:p,variant:'11',quantity:1,color:'',sterilized:false}]
 const quote=async(lines=items)=>(await db.query("select serenity_checkout_coupon_quote_v2($1,null,repeat('c',64),null) q",[JSON.stringify(lines)])).rows[0].q
 const oldQuote=await quote(),id=randomUUID(),attempt=randomUUID(),shipping=randomUUID()
 await db.query(`insert into serenity_shipping_quotes(id,request_id,cart_hash,destination,subtotal_cents,amount_cents,manual,settings_version,snapshot,expires_at) values($1,$2,repeat('b',64),'18072000',$3,1000,false,1,'{"pricing_mode":"retail"}',now()+interval '15 minutes')`,[shipping,id,oldQuote.subtotal_cents])
 await db.query(`select serenity_checkout_start_v2($1,repeat('a',64),(replace($1::uuid::text,'-','')||replace($1::uuid::text,'-','')),'production',null,$2,$3,$4,$5,repeat('b',64),$6,null,repeat('c',64))`,[id,JSON.stringify(items),JSON.stringify({name:'Cliente',email:'guest@example.com',phone:'11999999999',document:'52998224725'}),JSON.stringify({cep:'18072000',street:'Rua',number:'1',complement:'',district:'Centro',city:'Sorocaba',state:'SP'}),oldQuote.total_cents+1000,shipping])
 await db.query("select serenity_guest_register_v1($1,(replace($1::uuid::text,'-','')||replace($1::uuid::text,'-','')),$2)",[id,id.replaceAll('-','').repeat(2)])
 const payment=(await db.query("select serenity_checkout_select_method_v4($1,(replace($1::uuid::text,'-','')||replace($1::uuid::text,'-','')),'pix') p",[id])).rows[0].p
 await db.query("select serenity_checkout_claim_pix_v2($1,(replace($1::uuid::text,'-','')||replace($1::uuid::text,'-','')),$2,'123',repeat('d',64))",[id,attempt])
 const migration=sql('07-venda-individual-push-pin-mamilo.sql');await db.exec(migration);await db.exec(migration)
 const oldPair=(await db.query('select enabled,regular_price,sale_price from product_variants where id=$1',[pair])).rows[0]
 assert.equal(oldPair.enabled,false);assert.equal(Number(oldPair.regular_price),150);assert.equal(Number(oldPair.sale_price),140)
 const existingUnit=(await db.query('select regular_price from product_variants where id=$1',[unit])).rows[0]
 assert.equal(Number(existingUnit.regular_price),80)
 const converted=(await db.query('select attributes,regular_price,sale_price from product_variants where id=$1',[solo])).rows[0]
 assert.equal(Number(converted.regular_price),120);assert.equal(Number(converted.sale_price),110);assert.equal(converted.attributes['Escolha a Quantidade'],'Unidade')
 assert.equal((await db.query('select sold_individually from products where id=$1',[unrelated])).rows[0].sold_individually,true)
 const two=await quote([{...items[0],variant:'12',quantity:2}]);assert.equal(two.items[0].quantity,2);assert.equal(two.items[0].unit_price,70);assert.equal(two.total_cents,13300);assert.equal(two.items[0].name,'Piercing de Mamilo');assert.match(two.items[0].variation,/Venda por unidade/)
 await db.query('update product_variants set enabled=true where id=$1',[pair])
 await assert.rejects(quote(),/UNIT_SALE_REQUIRED/)
 const facts={provider_payment_id:'9876543',external_reference:id,attempt_id:attempt,environment:'production',merchant_id:'123',amount_cents:payment.total_cents,currency:'BRL',method:'pix',status:'approved',status_detail:'fixture',refunded_cents:0,updated_at:new Date().toISOString()}
 const applied=(await db.query("select serenity_checkout_observe_payment_v2($1,$2,'webhook') r",[attempt,JSON.stringify(facts)])).rows[0].r
 assert.equal(applied.application_state,'applied',JSON.stringify(applied))
 const order=(await db.query('select total,items from serenity_orders where id=$1',[id])).rows[0]
 assert.equal(Math.round(Number(order.total)*100),payment.total_cents);assert.equal(order.items[0].name,'Par de Piercing de Mamilo');assert.match(order.items[0].variation,/Par/)
 assert.equal((await db.query('select count(*)::int n from serenity_individual_sale_backup_v1')).rows[0].n,4)
 const duplicate=randomUUID()
 await db.query("insert into product_variants(id,product_id,woo_id,enabled,stock_status,stock_quantity,regular_price,attributes,name) values($1,$2,14,true,'instock',null,80,jsonb_build_object('Escolha a Quantidade','Unidade'),'Unidade duplicada')",[duplicate,p])
 await assert.rejects(db.exec(migration),/Variações de venda duplicadas/)
 await db.exec('rollback')
 assert.equal((await db.query('select enabled from product_variants where id=$1',[pair])).rows[0].enabled,true)
 await db.exec('set role anon');await assert.rejects(quote(),/permission denied/)
 }finally{await db.close()}
})
