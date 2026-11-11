import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lunarityCatalogDatabase } from './helpers/lunarity-db.mjs'

const installer=fs.readFileSync(new URL('../database/asaas/03-instalar-base-lunarity.sql',import.meta.url),'utf8')
const root=new URL('../',import.meta.url).pathname

test('generated Lunarity installer exactly matches reviewed production modules',()=>{
 const generated=execFileSync('python3',['-c',"import runpy; print(runpy.run_path('scripts/build-lunarity-installer.py')['build'](),end='')"],{cwd:root,encoding:'utf8'})
 assert.equal(installer,generated)
 assert.doesNotMatch(installer,/tests\/fixtures|wholesale_fixture|fixture@example/)
})

test('fresh Lunarity catalog: atomic install, real quotes, registration, payments, stock and privacy',async t=>{
 const db=await lunarityCatalogDatabase()
 try {
  const product=randomUUID(),campaign=randomUUID(),user=randomUUID(),otherUser=randomUUID()
  await db.query(`insert into products(id,slug,name,status,visibility,product_type,material,categories,tags,regular_price,sale_price,stock_status,stock_quantity)
   values($1,'topo-lunarity','Topo Lunarity','published','visible','simple','Titânio','{Topo}','{anodizavel}',100,90,'instock',100)`,[product])
  await db.query(`insert into serenity_promotion_campaigns values($1,'published',now()-interval '1 day',now()+interval '1 day')`,[campaign])
  await db.query('insert into serenity_promotion_items values($1,null,$2,80)',[product,campaign])
  const snapshot=async()=>({
   products:(await db.query('select to_jsonb(p) value from products p order by id')).rows,
   variants:(await db.query('select to_jsonb(v) value from product_variants v order by id')).rows,
   policy:(await db.query('select to_jsonb(p) value from serenity_commerce_settings_v1 p')).rows,
   collection:(await db.query('select * from serenity_collection_settings')).rows,
   pix:(await db.query('select * from serenity_pix_discount_settings_v4')).rows,
   priceFunction:(await db.query("select pg_get_functiondef('serenity_target_effective_price(uuid,uuid,numeric,numeric,timestamptz,timestamptz)'::regprocedure) definition")).rows,
  })
  const before=await snapshot()
  await t.test('install preserves existing products, campaigns, prices, settings and account independence',async()=>{
   await db.exec(installer)
   assert.deepEqual(await snapshot(),before)
   const row=(await db.query('select serenity_asaas_ready_v1() ready')).rows[0]
   assert.deepEqual(row.ready,{version:1,ready:true})
   for(const table of ['serenity_orders','serenity_customers','serenity_checkout_sessions_v2','serenity_shipping_quotes']) {
    assert.equal(Number((await db.query(`select count(*) n from ${table}`)).rows[0].n),0)
   }
   const shipping=(await db.query('select * from serenity_shipping_settings')).rows[0]
   assert.equal(shipping.enabled,false);assert.equal(shipping.weight_g,null);assert.equal(shipping.height,null)
   assert.equal((await db.query('select enabled from serenity_wholesale_settings')).rows[0].enabled,false)
   const definition=(await db.query("select pg_get_functiondef('serenity_checkout_context_v2(uuid,text)'::regprocedure) definition")).rows[0].definition
   await db.exec(installer)
   assert.equal((await db.query("select pg_get_functiondef('serenity_checkout_context_v2(uuid,text)'::regprocedure) definition")).rows[0].definition,definition)
   assert.deepEqual(await snapshot(),before)
  })
  const contact={name:'Cliente Lunarity',email:'fixture@example.test',phone:'11999999999',document:'52998224725'}
  const address={cep:'18072000',street:'Rua de Teste',number:'1',complement:'',district:'Centro',city:'Sorocaba',state:'SP'}
  const items=[{slug:'topo-lunarity',variant:'',quantity:2,color:'28',stem:'6',sterilized:true}]
  let customerId
  await t.test('CPF/CNPJ validation, confirmed-account registration and versioned profiles use real routines',async()=>{
   assert.equal((await db.query("select serenity_checkout_document_valid('52998224725') ok")).rows[0].ok,true)
   assert.equal((await db.query("select serenity_checkout_document_valid('11222333000181') ok")).rows[0].ok,true)
   for(const document of ['00000000000','52998224724','11222333000180','']) assert.equal((await db.query('select serenity_checkout_document_valid($1) ok',[document])).rows[0].ok,false)
   await db.query('insert into auth.users values($1,$2,now()),($3,$4,now())',[user,contact.email,otherUser,'other@example.test'])
   const registered=await db.query('select serenity_customer_account_register($1,$2,$3,$4,$5,false) result',[user,contact.email,contact.name,contact.phone,contact.document])
   customerId=registered.rows[0].result.customer_id
   assert.ok(customerId)
   await db.query('select serenity_customer_account_register($1,$2,$3,$4,$5,false)',[user,contact.email,contact.name,contact.phone,contact.document])
   assert.equal(Number((await db.query('select count(*) n from serenity_customers')).rows[0].n),1)
   assert.equal((await db.query('select serenity_wholesale_context($1) c',[user])).rows[0].c.active,false)
   await assert.rejects(db.query('select serenity_customer_account_register($1,$2,$3,$4,$5,true)',[otherUser,contact.email,'Wrong','11999999999',contact.document]),/CUSTOMER_ACCOUNT_UNAVAILABLE/)
   const limit=[];for(let i=0;i<4;i++)limit.push((await db.query("select serenity_checkout_limit(repeat('f',64),3) ok")).rows[0].ok)
   assert.deepEqual(limit,[true,true,true,false])
  })
  const quote=async(lines=items,code='')=>(await db.query("select serenity_checkout_coupon_quote_v2($1,$2,repeat('c',64),null) q",[JSON.stringify(lines),code])).rows[0].q
  let q
  await t.test('quotes preserve actual campaign price, zero anodization fee, optional stems, sterilization and progressive rules',async()=>{
   q=await quote()
   assert.equal(q.items[0].unit_price,80)
   assert.equal(q.items[0].fee,0);assert.equal(q.items[0].stem_fee,5);assert.equal(q.items[0].sterilization_fee,10)
   assert.equal(q.subtotal_cents,19000);assert.equal(q.discount_cents,800);assert.equal(q.total_cents,18200)
   const withoutStem=await quote([{...items[0],stem:'',sterilized:false}])
   assert.equal(withoutStem.items[0].stem_fee,0);assert.equal(withoutStem.items[0].sterilization_fee,0)
   assert.equal((await quote([{...items[0],unit_price:0.01,fee:0}])).total_cents,q.total_cents)
   await assert.rejects(quote([{...items[0],stem:'4'}]),/INVALID_STEM/)
   await assert.rejects(quote([{...items[0],color:'999'}]),/INVALID_ANODIZATION/)
   await db.query("insert into serenity_coupons(code,status,scope,discount_type,discount_value) values('HALF50','active','all','percent',50)")
   const coupon=await quote(items,'HALF50')
   assert.equal(coupon.coupon.discount_cents,6000)
   assert.equal(coupon.progressive.discount_cents,500)
   assert.equal(coupon.total_cents,12500)
  })
  const prepare=async({environment='production',manual=false,code=''}={})=>{
   const current=await quote(items,code),id=randomUUID(),shipping=randomUUID(),access=id.replaceAll('-','').repeat(2)
   // Carrier fee is a local fixture, never inserted by the installer or sent remotely.
   await db.query(`insert into serenity_shipping_quotes(id,request_id,cart_hash,destination,subtotal_cents,amount_cents,manual,settings_version,snapshot,expires_at)
    values($1,$2,repeat('b',64),'18072000',$3,1000,$4,1,'{"pricing_mode":"retail"}',now()+interval '15 minutes')`,[shipping,id,current.subtotal_cents,manual])
   const result=await db.query("select serenity_checkout_start_v2($1,repeat('a',64),$2,$3,$4,$5,$6,$7,$8,repeat('b',64),$9,$10,repeat('c',64)) s",[
    id,access,environment,user,JSON.stringify(items),JSON.stringify(contact),JSON.stringify(address),current.total_cents+1000,shipping,code])
   return {id,access,environment,session:result.rows[0].s}
  }
  const choose=async(s,method)=>(await db.query('select serenity_checkout_select_method_v4($1,$2,$3) s',[s.id,s.access,method])).rows[0].s
  const claim=async(s,method)=>{
   const id=randomUUID();const data=(await db.query("select serenity_asaas_claim_v1($1,$2,$3,'123',repeat('d',64),$4) a",[s.id,s.access,id,method])).rows[0].a
   await db.query("select serenity_asaas_customer_v1($1,$2,'cus_lunarity_fixture')",[id,data.lease_id])
   return {...data,id}
  }
  const observe=async(s,a,status='approved')=>(await db.query("select serenity_asaas_observe_v1($1,$2,'webhook') result",[a.id,JSON.stringify({
   provider_payment_id:'pay_'+a.id,merchant_id:'123',external_reference:s.id,attempt_id:a.id,customer_id:'cus_lunarity_fixture',invoice_url:null,
   environment:s.environment,method:a.method,currency:'BRL',amount_cents:a.amount_cents,refunded_cents:status==='refunded'?a.amount_cents:0,
   status,status_detail:status==='approved'?'CONFIRMED':'REFUNDED',updated_at:new Date().toISOString(),expires_at:null,
  })])).rows[0].result
  let paidOrder
  await t.test('manual shipping blocks payment; verified Asaas approval creates one order, preserves service fees and debits once',async()=>{
   const manual=await prepare({manual:true})
   assert.equal(manual.session.shipping_pending,true)
   await assert.rejects(claim(manual,'pix'),/PAYMENT_CHECKOUT_UNAVAILABLE/)
   const s=await prepare({code:'HALF50'})
   const selected=await choose(s,'pix')
   assert.equal(selected.payment_options.card_total_cents,13500)
   assert.equal(selected.payment_options.pix_total_cents,13025)
   const a=await claim(s,'pix')
   assert.equal(a.amount_cents,13025)
   assert.equal((await observe(s,a)).application_state,'applied')
   assert.equal((await observe(s,a)).application_state,'applied')
   paidOrder=s.id
   const order=(await db.query('select * from serenity_orders where id=$1',[s.id])).rows[0]
   assert.equal(order.customer_id,customerId)
   assert.equal(order.status,'paid');assert.equal(Number(order.total),130.25)
   assert.equal(Number(order.subtotal),190)
   assert.equal(order.items[0].stem_fee,5);assert.equal(order.items[0].sterilization_fee,10)
   assert.equal(order.items[0].unit_price,95);assert.equal(order.items[0].anodization_fee,0)
   assert.equal(order.shipping_details.payment.provider,'asaas')
   assert.equal((await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity,98)
   assert.equal(Number((await db.query('select count(*) n from serenity_orders')).rows[0].n),1)
   assert.equal((await db.query('select state from serenity_coupon_redemptions where order_id=$1',[s.id])).rows[0].state,'used')
   assert.equal((await observe(s,a,'refunded')).application_state,'applied')
   assert.equal((await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity,98)
  })
  await t.test('sandbox card approval cannot create a real order or debit catalog stock',async()=>{
   const s=await prepare({environment:'test'});await choose(s,'card');const a=await claim(s,'card')
   assert.equal((await observe(s,a)).application_state,'test_approved')
   assert.equal(Number((await db.query('select count(*) n from serenity_orders')).rows[0].n),1)
   assert.equal((await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity,98)
  })
  await t.test('only the owner can read account/orders, and neither anon nor customer can execute payment RPCs',async()=>{
   for(const role of ['anon','authenticated']){
    for(const signature of ['serenity_asaas_observe_v1(uuid,jsonb,text)','serenity_customer_account_register(uuid,text,text,text,text,boolean)',
     'serenity_admin_wholesale_review(uuid,uuid,bigint,text)','serenity_checkout_quote(jsonb)']){
     assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') ok',[role,signature])).rows[0].ok,false)
    }
   }
   await db.exec('set role authenticated')
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[otherUser])
   assert.equal((await db.query('select * from serenity_orders')).rows.length,0)
   assert.equal((await db.query('select * from serenity_customers')).rows.length,0)
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user])
   assert.equal((await db.query('select id from serenity_orders')).rows[0].id,paidOrder)
   assert.equal((await db.query('select * from serenity_customers')).rows.length,1)
   await assert.rejects(db.query("update serenity_customer_accounts set wholesale_status='approved'"),e=>e.code==='42501')
   await db.exec('reset role;set role anon')
   await assert.rejects(db.query('select * from serenity_orders'),e=>e.code==='42501')
   await db.exec('reset role;set role service_role')
   assert.equal((await db.query('select serenity_asaas_ready_v1() r')).rows[0].r.ready,true)
   assert.equal((await db.query('select serenity_checkout_coupon_quote_v2($1,\'\',repeat(\'c\',64),null) q',[JSON.stringify(items)])).rows[0].q.total_cents,18200)
   await db.exec('reset role')
  })
 }finally{await db.close()}
})

test('existing installation, missing prerequisites and a mid-installation error roll back safely',async()=>{
 for(const cause of ['existing','missing','mid-installation']){
  const db=await lunarityCatalogDatabase()
  try{
   if(cause==='existing')await db.exec('create table serenity_orders(id uuid primary key)')
   else if(cause==='missing') await db.exec('drop function serenity_target_effective_price(uuid,uuid,numeric,numeric,timestamptz,timestamptz)')
   else await db.exec('alter table serenity_collection_settings alter column singleton type integer using case when singleton then 1 else 0 end')
   await assert.rejects(db.exec(installer),cause==='mid-installation' ? /column "singleton" is of type integer/ : /LUNARITY_(EXISTING_INSTALLATION|CATALOG_REQUIRED)/)
   await db.exec('rollback')
   assert.equal((await db.query("select to_regclass('public.serenity_customers') t")).rows[0].t,null)
   assert.equal((await db.query("select to_regclass('public.serenity_lunarity_installation_v1') t")).rows[0].t,null)
   if(cause==='existing')assert.equal(Number((await db.query('select count(*) n from serenity_orders')).rows[0].n),0)
  }finally{await db.close()}
 }
})

test('initial install respects previously disabled progressive and Pix campaigns',async()=>{
 const db=await lunarityCatalogDatabase()
 try{
  await db.exec('update serenity_collection_settings set enabled=false;update serenity_pix_discount_settings_v4 set enabled=false')
  await db.exec(installer)
  assert.equal((await db.query('select enabled from serenity_collection_settings')).rows[0].enabled,false)
  assert.equal((await db.query('select enabled from serenity_pix_discount_settings_v4')).rows[0].enabled,false)
 }finally{await db.close()}
})
