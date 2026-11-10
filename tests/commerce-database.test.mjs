import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {randomUUID} from 'node:crypto'
import {paymentDatabase} from './helpers/payment-db.mjs'
const migration=fs.readFileSync(new URL('../database/commerce/01-precos-hastes-anodizacao.sql',import.meta.url),'utf8')
for (const preparationEnabled of [false,true]) test(`commercial pipeline (${preparationEnabled?'with preparation options':'baseline'}): once-only prices, stock, saved options and pre-existing payments`,async()=>{
 const db=await paymentDatabase()
 try{
 await db.exec(fs.readFileSync(new URL('./fixtures/payments/installed-complete-order-v2.sql',import.meta.url),'utf8'))
 await db.exec(fs.readFileSync(new URL('./fixtures/payments/installed-manual-create-order.sql',import.meta.url),'utf8'))
 await db.exec(fs.readFileSync(new URL('../database/collection/01-progressivo.sql',import.meta.url),'utf8'))
 await db.exec(fs.readFileSync(new URL('../database/pix-discount/01-pix-five.sql',import.meta.url),'utf8'))
 const top=randomUUID(),gold=randomUUID(),care=randomUUID(),variable=randomUUID(),variant=randomUUID()
 await db.query(`insert into products(id,slug,name,material,categories,status,visibility,stock_status,stock_quantity,sold_individually,product_type,regular_price,tags) values
 ($1,'top','Topo Titânio','Titânio','{Topo}','published','visible','instock',100,false,'simple',100,'{anodizavel}'),
 ($2,'gold','Argola Ouro 18K','Ouro 18K','{Argolas}','published','visible','instock',100,false,'simple',1000,'{}'),
 ($3,'care','Aftercare limpeza','Cuidados','{Aftercare}','published','visible','instock',100,false,'simple',50,'{}'),
 ($4,'variable','Topo variável','Titânio','{Topo}','published','visible','instock',100,false,'variable',null,'{anodizavel}')`,[top,gold,care,variable])
 await db.query(`insert into product_variants(id,product_id,woo_id,enabled,stock_status,stock_quantity,regular_price,name) values($1,$2,23,true,'instock',100,150,'Pedra azul')`,[variant,variable])
 const quote=async lines=>(await db.query('select serenity_checkout_coupon_quote_v2($1,null,null,null) r',[JSON.stringify(lines)])).rows[0].r
 const oldItems=[{slug:'top',variant:'',quantity:1,color:'28'}],legacyQuote=await quote(oldItems)
 assert.equal(legacyQuote.items[0].fee,15)
 async function start(lines,q,coupon=null){
   const id=randomUUID(),shipping=randomUUID(),access=id.replaceAll('-','').repeat(2)
   await db.query(`insert into serenity_shipping_quotes(id,request_id,cart_hash,destination,subtotal_cents,amount_cents,manual,settings_version,snapshot,expires_at) values($1,$2,repeat('b',64),'18072000',$3,1000,false,1,'{"pricing_mode":"retail"}',now()+interval '15 minutes')`,[shipping,id,q.subtotal_cents])
   await db.query(`select serenity_checkout_start_v2($1,repeat('a',64),$2,'production',null,$3,$4,$5,$6,repeat('b',64),$7,$8,repeat('c',64))`,[id,access,JSON.stringify(lines),JSON.stringify({name:'Teste',email:'test@example.com',phone:'11999999999',document:'52998224725'}),JSON.stringify({cep:'18072000',street:'Rua',number:'1',complement:'',district:'Bairro',city:'Sorocaba',state:'SP'}),q.total_cents+1000,shipping,coupon])
   const chosen=(await db.query("select serenity_checkout_select_method_v4($1,$2,'pix') r",[id,access])).rows[0].r
   const attempt=randomUUID();await db.query(`select serenity_checkout_claim_pix_v2($1,$2,$3,'123',repeat('d',64))`,[id,access,attempt])
   return {id,access,attempt,total:chosen.total_cents}
 }
 const old=await start(oldItems,legacyQuote)
 await db.exec(migration);await db.exec(migration)
 if(preparationEnabled) {
 const preparation=fs.readFileSync(new URL('../database/commerce/02-esterilizacao-microdermal.sql',import.meta.url),'utf8')
 await db.exec(preparation);await db.exec(preparation)
 }
 const p=(await db.query('select slug,regular_price from products')).rows
 assert.equal(Number(p.find(x=>x.slug==='top').regular_price),82);assert.equal(Number(p.find(x=>x.slug==='gold').regular_price),820);assert.equal(Number(p.find(x=>x.slug==='care').regular_price),50)
 assert.equal(Number((await db.query('select regular_price from product_variants where id=$1',[variant])).rows[0].regular_price),123)
 await assert.rejects(quote([{slug:'top',variant:'',quantity:1,color:''}]),/TOP_STEM_REQUIRED/)
 await assert.rejects(quote([{slug:'top',variant:'',quantity:1,color:'28',stem:'12'}]),/TOP_STEM_REQUIRED/)
 await assert.rejects(quote([{slug:'gold',variant:'',quantity:1,color:'28'}]),/INVALID_ANODIZATION/)
 const currentItems=[{slug:'top',variant:'',quantity:1,color:'28',stem:'6',...(preparationEnabled?{sterilized:true}:{})}];let q=await quote(currentItems)
 assert.equal(q.items[0].fee,0);assert.equal(q.items[0].unit_price,82);assert.equal(q.items[0].stem,'6');assert.match(q.items[0].variation,/Haste incluída: 6 mm/)
 const combo=await quote([{slug:'variable',variant:'23',quantity:1,color:'28',stem:'4'},{slug:'variable',variant:'23',quantity:1,color:'28',stem:'8'}])
 assert.equal(combo.items[0].cart_variant,'23');assert.notEqual(combo.items[0].variation,combo.items[1].variation)
 await db.query(`update product_variants set attributes='{"Comprimento da Haste":"10mm"}' where id=$1`,[variant])
 const existingLength=await quote([{slug:'variable',variant:'23',quantity:1,color:''}])
 assert.equal(existingLength.items[0].stem,'10');assert.equal(existingLength.items[0].stem_locked,true)
 await assert.rejects(quote([{slug:'variable',variant:'23',quantity:1,color:'',stem:'4'}]),/INVALID_STEM/)
 if(preparationEnabled) {
 const micro=randomUUID();await db.query(`insert into products(id,slug,name,material,categories,status,visibility,stock_status,stock_quantity,sold_individually,product_type,regular_price,tags) values($1,'micro','TN1072 Topo Microdermal 1.6mm','Titânio','{Topo,Microdermal}','published','visible','instock',10,false,'simple',100,'{}')`,[micro])
 const microQuote=await quote([{slug:'micro',variant:'',quantity:1,color:'',sterilized:true}]);assert.equal(microQuote.items[0].stem,'');assert.equal(microQuote.items[0].sterilized,true)
 await assert.rejects(quote([{slug:'micro',variant:'',quantity:1,color:'',stem:'6'}]),/INVALID_STEM/)
 await assert.rejects(quote([{slug:'care',variant:'',quantity:1,color:'',sterilized:true}]),/INVALID_STERILIZATION/)
 await assert.rejects(quote([{slug:'micro',variant:'',quantity:1,color:'',sterilized:'yes'}]),/INVALID_STERILIZATION/)
 const notSterile=await quote([{slug:'micro',variant:'',quantity:1,color:'',sterilized:false}]);assert.equal(microQuote.total_cents,notSterile.total_cents)
 const paidPreparation=fs.readFileSync(new URL('../database/commerce/03-esterilizacao-5-reais.sql',import.meta.url),'utf8')
 await db.exec(paidPreparation);await db.exec(paidPreparation)
 const withService=await quote([{slug:'micro',variant:'',quantity:3,color:'',sterilized:true}])
 const withoutService=await quote([{slug:'micro',variant:'',quantity:3,color:'',sterilized:false}])
 assert.equal(withService.total_cents-withoutService.total_cents,1500)
 assert.equal(withService.items[0].sterilization_fee,5)
 const forged=await quote([{slug:'micro',variant:'',quantity:1,color:'',sterilized:true,sterilization_fee:0}])
 assert.equal(forged.items[0].sterilization_fee,5)
 const careService=await quote([{slug:'care',variant:'',quantity:2,color:'',sterilized:true}])
 const careBase=await quote([{slug:'care',variant:'',quantity:2,color:'',sterilized:false}])
 assert.equal(careService.total_cents-careBase.total_cents,1000)
 assert.match(careService.items[0].variation,/R\$ 5,00 por peça/)
 await assert.rejects(quote([{slug:'care',variant:'',quantity:1,color:'',sterilized:'yes'}]),/INVALID_STERILIZATION/)

 }
 const ten=await quote([{slug:'top',variant:'',quantity:1,color:'',stem:'10'}]);assert.equal(ten.items[0].stem,'10')
 const shaft=randomUUID(),shaftVariant=randomUUID()
 await db.query(`insert into products(id,slug,name,material,categories,status,visibility,stock_status,stock_quantity,sold_individually,product_type,tags) values($1,'shaft','Haste Labret','Titânio','{Hastes}','published','visible','instock',100,false,'variable','{anodizavel}')`,[shaft])
 await db.query(`insert into product_variants(id,product_id,woo_id,enabled,stock_status,stock_quantity,regular_price,name,attributes) values($1,$2,99,true,'instock',100,20,'6mm','{"Comprimento da Haste":"6mm"}')`,[shaftVariant,shaft])
 const onlyShaft=await quote([{slug:'shaft',variant:'99',quantity:1,color:''}]);assert.equal(onlyShaft.items[0].stem_locked,false);assert.equal(onlyShaft.items[0].stem,'')


 const user=randomUUID();await db.query('insert into wholesale_fixture values($1,$2)',[user,JSON.stringify({active:true,discount_percent:50,minimum_products_cents:1000,settings_version:1,account_version:1})])
 const wholesale=(await db.query('select serenity_wholesale_stock_review_v2($1,$2,null) r',[user,JSON.stringify([{slug:'gold',variant:'',quantity:1,color:''}])])).rows[0].r
 assert.equal(wholesale.items[0].unit_price,410)
 if(preparationEnabled){
 const wholesaleService=(await db.query('select serenity_wholesale_stock_review_v2($1,$2,null) r',[user,JSON.stringify([{slug:'gold',variant:'',quantity:1,color:'',sterilized:true}])])).rows[0].r
 assert.equal(wholesaleService.total_cents-wholesale.total_cents,500)
 }
 // Uma cotação grátis não pode ser reaproveitada com um cupom que derruba o total abaixo de R$450.
 const bigCoupon=randomUUID();await db.query("insert into serenity_coupons values($1,'HALF','active',null,null,'all',0,'percent',50,100,100,1)",[bigCoupon])
 if(preparationEnabled){
 const couponService=(await db.query("select serenity_checkout_coupon_quote_v2($1,'HALF',repeat('e',64),null) r",[JSON.stringify([{slug:'top',variant:'',quantity:2,color:'',stem:'6',sterilized:true}])])).rows[0].r
 const couponBase=(await db.query("select serenity_checkout_coupon_quote_v2($1,'HALF',repeat('e',64),null) r",[JSON.stringify([{slug:'top',variant:'',quantity:2,color:'',stem:'6',sterilized:false}])])).rows[0].r
 assert.equal(couponService.total_cents-couponBase.total_cents,1000)
 }
 const freeId=randomUUID(),freeShipping=randomUUID(),freeAccess=freeId.replaceAll('-','').repeat(2)
 await db.query(`insert into serenity_shipping_quotes(id,request_id,cart_hash,destination,subtotal_cents,amount_cents,manual,settings_version,snapshot,expires_at) values($1,$2,repeat('b',64),'18072000',82000,0,false,1,'{"pricing_mode":"retail","free_shipping":{"minimum_cents":45000}}',now()+interval '15 minutes')`,[freeShipping,freeId])
 await assert.rejects(db.query(`select serenity_checkout_start_v2($1,repeat('a',64),$2,'production',null,$3,$4,$5,41000,repeat('b',64),$6,'HALF',repeat('c',64))`,[freeId,freeAccess,JSON.stringify([{slug:'gold',variant:'',quantity:1,color:''}]),JSON.stringify({name:'Teste',email:'test@example.com',phone:'11999999999',document:'52998224725'}),JSON.stringify({cep:'18072000',street:'Rua',number:'1',complement:'',district:'Bairro',city:'Sorocaba',state:'SP'}),freeShipping]),/SHIPPING_QUOTE_EXPIRED/)
 q=await quote(currentItems)
 const current=await start(currentItems,q)
 if(preparationEnabled) assert.equal(current.total,9290)
 for(const [index,session] of [old,current].entries()){
  const facts={provider_payment_id:String(9000+index),external_reference:session.id,attempt_id:session.attempt,environment:'production',merchant_id:'123',amount_cents:session.total,currency:'BRL',method:'pix',status:'approved',status_detail:'accredited',refunded_cents:0,updated_at:new Date().toISOString(),expires_at:null}
  const result=(await db.query(`select serenity_checkout_observe_payment_v2($1,$2,'webhook') r`,[session.attempt,JSON.stringify(facts)])).rows[0].r
  assert.equal(result.application_state,'applied')
 }
 const order=(await db.query('select items from serenity_orders where id=$1',[current.id])).rows[0]
 if(preparationEnabled) { assert.equal(order.items[0].sterilization_fee,5);assert.equal(order.items[0].unit_price,87);assert.equal(order.items[0].sterilized,true);assert.match(order.items[0].variation,/Esterilização solicitada: Sim/); }
 assert.equal(order.items[0].stem_length_mm,'6');assert.equal(order.items[0].anodization_fee,0);assert.match(order.items[0].variation,/6 mm/)
 assert.equal((await db.query('select items from serenity_orders where id=$1',[old.id])).rows[0].items[0].anodization_fee,15)
 const customer=randomUUID(),admin=randomUUID(),manualId=randomUUID()
 await db.query("insert into serenity_customers(id,name,email,phone) values($1,'Cliente','test@example.com','11999999999')",[customer])
 await db.query('select serenity_admin_create_order($1,$2,$3,$4)',[manualId,admin,customer,JSON.stringify({status:'pending',discount:0,shipping:0,expenses:0,notes:'',items:[{product_id:top,variant_id:'',quantity:'1',unit_price:82,color:'28',stem:'4'}]})])
 const manual=(await db.query('select items,total from serenity_orders where id=$1',[manualId])).rows[0]
 assert.equal(manual.items[0].anodization_fee,0);assert.equal(manual.items[0].stem_length_mm,'4');assert.equal(Number(manual.total),82)
 if(!preparationEnabled){
 await db.exec(fs.readFileSync(new URL('../database/commerce/03-esterilizacao-5-reais.sql',import.meta.url),'utf8'))
 const firstInstall=await quote([{slug:'top',variant:'',quantity:1,color:'',stem:'6',sterilized:true}])
 assert.equal(firstInstall.items[0].sterilization_fee,5);assert.equal(firstInstall.total_cents,8700)
 assert.equal(Number((await db.query('select regular_price from products where id=$1',[top])).rows[0].regular_price),82)
 }


 // Encomendas não dependem de saldo; pagamentos aprovados após a reserva
 // expirar preservam o valor original e são convertidos uma única vez.
 const unlimitedSql=fs.readFileSync(new URL('../database/commerce/04-venda-sob-encomenda.sql',import.meta.url),'utf8')
 const lateItems=[{slug:'top',variant:'',quantity:1,color:'',stem:'6',sterilized:false}]
 const lateQuote=await quote(lateItems),late=await start(lateItems,lateQuote)
 await db.query("update serenity_checkout_sessions_v2 set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour',access_expires_at=now()+interval '20 hours' where id=$1",[late.id])
 await db.query("update serenity_checkout_stock_v2 set expires_at=now()-interval '1 hour' where checkout_id=$1",[late.id])
 await db.query("update products set stock_quantity=0,stock_status='outofstock' where id=$1",[top])
 await db.exec(unlimitedSql);await db.exec(unlimitedSql)
 assert.equal((await db.query('select stock_quantity from products where id=$1',[top])).rows[0].stock_quantity,null)
 const unlimited=await quote([{slug:'top',variant:'',quantity:200,color:'',stem:'6',sterilized:false}])
 assert.equal(unlimited.items[0].quantity,200)
 const facts={provider_payment_id:'987654',external_reference:late.id,attempt_id:late.attempt,environment:'production',merchant_id:'123',amount_cents:late.total,currency:'BRL',method:'pix',status:'approved',status_detail:'accredited',refunded_cents:0,updated_at:new Date().toISOString(),expires_at:null}
 const recovered=(await db.query(`select serenity_checkout_observe_payment_v2($1,$2,'admin') r`,[late.attempt,JSON.stringify(facts)])).rows[0].r
 assert.equal(recovered.application_state,'applied')
 assert.equal(Number((await db.query('select total from serenity_orders where id=$1',[late.id])).rows[0].total)*100,late.total)
 await db.query(`select serenity_checkout_observe_payment_v2($1,$2,'admin')`,[late.attempt,JSON.stringify(facts)])
 assert.equal((await db.query('select count(*) n from serenity_orders where id=$1',[late.id])).rows[0].n,1)
 assert.equal((await db.query('select stock_quantity from products where id=$1',[top])).rows[0].stock_quantity,null)
 assert.equal((await db.query("select stock_quantity from serenity_unlimited_stock_backup_v1 where entity='products' and id=$1",[top])).rows[0].stock_quantity,0)
 const lateCouponItems=[{slug:'top',variant:'',quantity:2,color:'',stem:'6',sterilized:true}]
 const lateCouponQuote=(await db.query("select serenity_checkout_coupon_quote_v2($1,'HALF',repeat('c',64),null) r",[JSON.stringify(lateCouponItems)])).rows[0].r
 const couponLate=await start(lateCouponItems,lateCouponQuote,'HALF')
 await db.query("update serenity_checkout_sessions_v2 set state='expired',created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour',access_expires_at=now()+interval '20 hours' where id=$1",[couponLate.id])
 await db.query("update serenity_checkout_stock_v2 set state='released' where checkout_id=$1",[couponLate.id])
 await db.query("update serenity_checkout_coupon_v2 set state='released' where checkout_id=$1",[couponLate.id])
 await assert.rejects(db.query('select serenity_checkout_complete_order_v2($1)',[couponLate.attempt]),/PAYMENT_APPROVAL_REQUIRED/)
 const couponFacts={...facts,provider_payment_id:'987655',external_reference:couponLate.id,attempt_id:couponLate.attempt,amount_cents:couponLate.total}
 const couponRecovered=(await db.query("select serenity_checkout_observe_payment_v2($1,$2,'admin') r",[couponLate.attempt,JSON.stringify(couponFacts)])).rows[0].r
 assert.equal(couponRecovered.application_state,'applied')
 assert.equal(Number((await db.query('select total from serenity_orders where id=$1',[couponLate.id])).rows[0].total)*100,couponLate.total)
 assert.equal((await db.query('select count(*) n from serenity_coupon_redemptions where order_id=$1',[couponLate.id])).rows[0].n,1)
 await db.query('update product_variants set enabled=false where id=$1',[variant])
 await assert.rejects(quote([{slug:'variable',variant:'23',quantity:1,color:'',stem:'4'}]),/VARIANT_UNAVAILABLE/)
 const accountFix=fs.readFileSync(new URL('../database/payments/04-cliente-pedido-aprovado.sql',import.meta.url),'utf8')
 await db.exec(accountFix);await db.exec(accountFix)
 for (const withAccountRow of [false,true]) {
  const userId=randomUUID();await db.query('insert into auth.users values($1,now())',[userId])
  if(withAccountRow) await db.query('insert into serenity_customer_accounts values($1,null)',[userId])
  const accountQuote=await quote(lateItems),accountSession=await start(lateItems,accountQuote)
  await db.query('update serenity_checkout_sessions_v2 set account_user_id=$1 where id=$2',[userId,accountSession.id])
  await assert.rejects(db.query('select serenity_checkout_customer_for_order_v1($1)',[accountSession.id]),/PAYMENT_APPROVAL_REQUIRED/)
  const accountFacts={...facts,provider_payment_id:withAccountRow?'987657':'987656',external_reference:accountSession.id,attempt_id:accountSession.attempt,amount_cents:accountSession.total}
  const accountRecovered=(await db.query("select serenity_checkout_observe_payment_v2($1,$2,'admin') r",[accountSession.attempt,JSON.stringify(accountFacts)])).rows[0].r
  assert.equal(accountRecovered.application_state,'applied')
  const saved=(await db.query('select customer_id,account_user_id,total from serenity_orders where id=$1',[accountSession.id])).rows[0]
  assert.equal(saved.account_user_id,userId);assert.equal(saved.customer_id,accountSession.id)
  assert.equal(Number(saved.total)*100,accountSession.total)
  if(withAccountRow) assert.equal((await db.query('select customer_id from serenity_customer_accounts where user_id=$1',[userId])).rows[0].customer_id,accountSession.id)
  await db.query("select serenity_checkout_observe_payment_v2($1,$2,'admin')",[accountSession.attempt,JSON.stringify(accountFacts)])
  assert.equal((await db.query('select count(*) n from serenity_customers where id=$1',[accountSession.id])).rows[0].n,1)
 }
 // Uma definição diferente de diagnóstico não pode impedir a correção principal.
 await db.exec(`create or replace function serenity_checkout_observe_payment_v2(p_attempt uuid,p_observation jsonb,p_source text) returns jsonb language sql as $$select '{}'::jsonb;$$`)
 const alternate=(await db.query("select pg_get_functiondef('serenity_checkout_observe_payment_v2(uuid,jsonb,text)'::regprocedure) d")).rows[0].d
 await db.exec(accountFix)
 assert.equal((await db.query("select pg_get_functiondef('serenity_checkout_observe_payment_v2(uuid,jsonb,text)'::regprocedure) d")).rows[0].d,alternate)
 await db.exec('set role anon')
 await assert.rejects(db.query('select serenity_checkout_customer_for_order_v1($1)',[late.id]),/permission denied/)
 await db.exec('reset role')
 await db.query("update products set status='draft' where id=$1",[top])
 await assert.rejects(quote(lateItems),/PRODUCT_UNAVAILABLE/)


 }finally{await db.close()}
})
