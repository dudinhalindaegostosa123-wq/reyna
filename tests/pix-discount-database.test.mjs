import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { paymentDatabase } from './helpers/payment-db.mjs'
import loader from './helpers/load.cjs'
const { normalizeCheckoutSessionV2 } = loader.load('src/lib/checkout-session-server-v2.ts', {
 'node:crypto':{}, 'next/headers':{}, '@/lib/checkout-server':{}, '@/lib/wholesale-server':{},
})

test('Pix 5%: authoritative method prices, coupon/progressive stacking, switching, old payments and paid orders', async () => {
  const db = await paymentDatabase()
  try {
    await db.exec(fs.readFileSync(new URL('./fixtures/payments/installed-complete-order-v2.sql',import.meta.url),'utf8'))
    await db.exec(fs.readFileSync(new URL('../database/collection/01-progressivo.sql',import.meta.url),'utf8'))
    const product = randomUUID(), coupon = randomUUID()
    await db.query(`insert into products(id,slug,name,material,categories,status,visibility,stock_status,stock_quantity,sold_individually,product_type,regular_price,tags)
      values($1,'joia','Topo Titânio','Titânio','{Conch}','published','visible','instock',500,false,'simple',100,'{anodizavel}')`,[product])
    await db.query("insert into serenity_coupons values($1,'FIRST10','active',null,null,'all',0,'percent',10,100,100,1)",[coupon])
    const quote = async (items,code='',user=null) => (await db.query(user
      ? 'select serenity_wholesale_stock_review_v2($2,$1,null) r'
      : 'select serenity_checkout_coupon_quote_v2($1,$2,repeat(\'c\',64),null) r',
      user ? [JSON.stringify(items),user] : [JSON.stringify(items),code])).rows[0].r
    const prepare = async ({ quantity=4, code='FIRST10', color='', user=null, rules=null }={}) => {
      const lines = [{slug:'joia',variant:'',quantity,color}]
      const q = await quote(lines,code,user)
      const id=randomUUID(), shipping=randomUUID(), access=id.replaceAll('-','').repeat(2)
      const snapshot=user ? {pricing_mode:'wholesale',wholesale:{...rules,user_id:user}} : {pricing_mode:'retail'}
      await db.query("insert into serenity_shipping_quotes(id,request_id,cart_hash,destination,subtotal_cents,amount_cents,manual,settings_version,snapshot,expires_at) values($1,$2,repeat('b',64),'18072000',$3,1000,false,1,$4,now()+interval '15 minutes')",[shipping,id,q.subtotal_cents,JSON.stringify(snapshot)])
      await db.query("select serenity_checkout_start_v2($1,repeat('a',64),$2,'production',$3,$4,$5,$6,$7,repeat('b',64),$8,$9,repeat('c',64))",[
        id,access,user,JSON.stringify(lines),JSON.stringify({name:'Teste',email:'test@example.com',phone:'11999999999',document:'52998224725'}),
        JSON.stringify({cep:'18072000',street:'Rua',number:'1',complement:'',district:'Bairro',city:'Sorocaba',state:'SP'}),q.total_cents+1000,shipping,code])
      return {id,access,q}
    }
    const context = async s => {
      const value = (await db.query('select serenity_checkout_context_v2($1,$2) r',[s.id,s.access])).rows[0].r
      normalizeCheckoutSessionV2(value,s.id)
      return value
    }
    const choose = async (s,method) => {
      const value = (await db.query('select serenity_checkout_select_method_v4($1,$2,$3) r',[s.id,s.access,method])).rows[0].r
      normalizeCheckoutSessionV2(value,s.id)
      return value
    }
    const claim = async (s,method='pix') => {
      const attempt=randomUUID()
      await db.query(`select ${method==='pix'?'serenity_checkout_claim_pix_v2':'serenity_checkout_claim_card_v3'}($1,$2,$3,'123',repeat('d',64))`,[s.id,s.access,attempt])
      return attempt
    }
    let serial=5000
    const complete = async (s,attempt,method='pix') => {
      const current=await context(s)
      const facts={provider_payment_id:String(serial++),external_reference:s.id,attempt_id:attempt,environment:'production',merchant_id:'123',amount_cents:current.total_cents,
        currency:'BRL',method,status:'approved',status_detail:'accredited',refunded_cents:0,updated_at:new Date().toISOString(),expires_at:null}
      const observe=()=>db.query(`select ${method==='pix'?'serenity_checkout_observe_payment_v2':'serenity_checkout_observe_payment_v3'}($1,$2,'webhook') r`,[attempt,JSON.stringify(facts)])
      assert.equal((await observe()).rows[0].r.application_state,'applied')
      await observe()
      return (await db.query('select * from serenity_orders where id=$1',[s.id])).rows[0]
    }
    const legacy=await prepare()
    const legacyAttempt=await claim(legacy)
    const sql=fs.readFileSync(new URL('../database/pix-discount/01-pix-five.sql',import.meta.url),'utf8')
    await db.exec(sql)
    await db.exec(sql)
    assert.equal((await db.query('select serenity_checkout_card_ready_v3() r')).rows[0].r.ready,true)
    assert.equal((await db.query('select serenity_checkout_payment_ready_v3() r')).rows[0].r.ready,true)
    const old=await context(legacy)
    assert.equal(old.total_cents,29800)
    assert.equal(old.payment_options.pix_discount_cents,0)
    await assert.rejects(choose(legacy,'pix'),/PAYMENT_(ALREADY_STARTED|CHECKOUT_UNAVAILABLE)/)
    assert.equal(Math.round(Number((await complete(legacy,legacyAttempt)).total)*100),29800)

    const s=await prepare()
    let result=await context(s)
    assert.equal(result.payment_options.card_total_cents,29800)
    assert.equal(result.payment_options.pix_discount_cents,1440)
    assert.equal(result.payment_options.pix_total_cents,28360)
    assert.equal((await choose(s,'pix')).total_cents,28360)
    assert.equal((await choose(s,'pix')).total_cents,28360)
    assert.equal((await choose(s,'card')).total_cents,29800)
    assert.equal((await choose(s,'pix')).total_cents,28360)
    await assert.rejects(choose({...s,access:'f'.repeat(64)},'card'),/CHECKOUT_ACCESS_INVALID/)
    await assert.rejects(claim(s,'card'),/PAYMENT_METHOD_CHANGED/)
    const pix=await claim(s)
    await assert.rejects(choose(s,'card'),/PAYMENT_(ALREADY_STARTED|CHECKOUT_UNAVAILABLE)/)
    const order=await complete(s,pix)
    assert.equal(Math.round(Number(order.total)*100),28360)
    assert.equal(Math.round(Number(order.discount)*100),12640)
    assert.equal((await db.query('select discount_cents from serenity_coupon_redemptions where order_id=$1',[s.id])).rows[0].discount_cents,4000)
    assert.equal((await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity,492)

    const fee=await prepare({quantity:2,code:'',color:'28'})
    result=await choose(fee,'pix')
    assert.equal(result.payment_options.pix_discount_cents,900)
    assert.equal(result.total_cents,21100) // 20000 - 2000 progressive - 900 Pix + 3000 anodization + 1000 shipping.
    const card=await prepare()
    await choose(card,'pix')
    result=await choose(card,'card')
    const cardOrder=await complete(card,await claim(card,'card'),'card')
    assert.equal(Math.round(Number(cardOrder.total)*100),29800)

    await db.exec('update serenity_collection_settings set enabled=false')
    const onlyPix=await prepare({quantity:2,code:''})
    result=await choose(onlyPix,'pix')
    assert.equal(result.total_cents,20000)
    assert.equal(Math.round(Number((await complete(onlyPix,await claim(onlyPix))).discount)*100),1000)
    assert.equal((await db.query('select count(*)::int n from serenity_coupon_redemptions where order_id=$1',[onlyPix.id])).rows[0].n,0)

    const user=randomUUID(), rules={active:true,discount_percent:50,minimum_products_cents:0,settings_version:1,account_version:1}
    await db.query('insert into auth.users values($1,now())',[user])
    await db.query('insert into wholesale_fixture values($1,$2)',[user,JSON.stringify(rules)])
    const wholesale=await prepare({quantity:4,code:'',user,rules})
    result=await choose(wholesale,'pix')
    assert.equal(result.payment_options.pix_discount_cents,0)
    assert.equal(result.total_cents,21000)
    assert.equal((await db.query("select has_function_privilege('anon','serenity_checkout_select_method_v4(uuid,text,text)','execute') ok")).rows[0].ok,false)
  } finally { await db.close() }
})
