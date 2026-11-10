import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { paymentDatabase } from './helpers/payment-db.mjs'

test('progressive discounts: real quotes, coupon allocation, reservations and paid orders stay consistent', async () => {
  const db = await paymentDatabase()
  try {
    // Exact function supplied from the live database, including multiline comparisons.
    const installed = fs.readFileSync(new URL('./fixtures/payments/installed-complete-order-v2.sql', import.meta.url), 'utf8')
    await db.exec(installed)
    const completeSignature = 'public.serenity_checkout_complete_order_v2(uuid)'
    const originalComplete = (await db.query('select pg_get_functiondef($1::regprocedure) as definition', [completeSignature])).rows[0].definition
    // The other installed functions can also be formatted across lines.
    for (const signature of ['public.serenity_checkout_reserve_coupon_v2(uuid,text)',
      'public.serenity_checkout_claim_pix_v2(uuid,text,uuid,text,text)',
      'public.serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)']) {
      let definition = (await db.query('select pg_get_functiondef($1::regprocedure) as definition', [signature])).rows[0].definition
      definition = definition.replace('elsif checkout.discount_cents <> 0 then', 'elsif\n checkout.discount_cents\n <> 0\n then')
        .replace('discount := checkout.discount_cents;', 'discount\n := checkout.discount_cents\n ;')
        .replace('if checkout.discount_cents > 0 then', 'if\n checkout.discount_cents >\n 0 then')
        .replace('coupon_hold.discount_cents is distinct from checkout.discount_cents', 'coupon_hold.discount_cents\n is distinct\n from checkout.discount_cents')
      await db.exec(definition)
    }
    const sql = fs.readFileSync(new URL('../database/collection/01-progressivo.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    assert.equal((await db.query('select definition from serenity_collection_function_backups_v1 where signature=$1', [completeSignature])).rows[0].definition, originalComplete)
    const jewel = randomUUID(), care = randomUUID(), variantParent = randomUUID(), variant = randomUUID(), coupon = randomUUID()
    for (const [id, slug, name, material, categories, type] of [
      [jewel, 'joia', 'Argola Ouro 18K', 'Ouro 18K', ['Conch'], 'simple'],
      [care, 'cuidados', 'After Care Limpeza', '', ['After care'], 'simple'],
      [variantParent, 'topo', 'Topo Titânio', 'Titânio', ['Topo'], 'variable'],
    ]) await db.query(`insert into products(id,slug,name,material,categories,status,visibility,stock_status,stock_quantity,sold_individually,product_type,regular_price,tags)
      values($1,$2,$3,$4,$5,'published','visible','instock',100,false,$6,100,'{anodizavel}')`, [id,slug,name,material,categories,type])
    await db.query("insert into product_variants(id,product_id,woo_id,enabled,stock_status,stock_quantity,regular_price,attributes,name) values($1,$2,22,true,'instock',100,100,'{}','Azul')", [variant,variantParent])
    await db.query("insert into serenity_coupons values($1,'TEST10','active',null,null,'all',0,'percent',10,100,100,1)",[coupon])
    const items = (quantity, slug = 'joia', color = '', v = '') => [{ slug, variant: v, quantity, color }]
    const quote = async (lines, code = '') => (await db.query('select serenity_checkout_coupon_quote_v2($1,$2,$3,null) r',[JSON.stringify(lines),code,'c'.repeat(64)])).rows[0].r
    for (const [quantity, rate, total] of [[1,0,10000],[2,10,18000],[3,15,25500],[4,20,32000],[5,20,40000]]) {
      const q = await quote(items(quantity))
      assert.equal(q.total_cents,total)
      assert.equal(q.progressive.percent,rate)
      assert.equal(q.progressive.quantity,quantity)
    }
    const combined = await quote(items(4), 'TEST10')
    assert.equal(combined.coupon.discount_cents,4000)
    assert.equal(combined.progressive.discount_cents,7200)
    assert.equal(combined.discount_cents,11200)
    assert.equal(combined.total_cents,28800) // 400 x .9 x .8, not a 30% discount.
    const careOnly = await quote(items(5,'cuidados'))
    assert.equal(careOnly.progressive.quantity,0)
    assert.equal(careOnly.total_cents,50000)
    const mixed = await quote([...items(2),...items(3,'cuidados')])
    assert.equal(mixed.progressive.quantity,2)
    assert.equal(mixed.total_cents,48000)
    const anodized = await quote(items(2,'topo','28','22'))
    assert.equal(anodized.total_cents,21000) // 200 - 20 + 30 anodization
    assert.equal(anodized.progressive.discount_cents,2000)
    await db.query("update serenity_coupons set scope='products',discount_type='fixed',discount_value=50 where id=$1",[coupon])
    await db.query('insert into serenity_coupon_products values($1,$2)',[coupon,care])
    const restricted = await quote([...items(2),...items(1,'cuidados')],'TEST10')
    assert.equal(restricted.coupon.discount_cents,5000)
    assert.equal(restricted.progressive.discount_cents,2000) // A care-only coupon never reduces the jewelry basis.
    assert.equal(restricted.total_cents,23000)
    await db.query("update serenity_coupons set scope='all',discount_type='percent',discount_value=10 where id=$1",[coupon])
    const wholesaleUser = randomUUID()
    await db.query('insert into wholesale_fixture values($1,$2)',[wholesaleUser, JSON.stringify({active:true,discount_percent:50,minimum_products_cents:0,settings_version:1,account_version:1})])
    const wholesale = (await db.query('select serenity_wholesale_stock_review_v2($1,$2,null) r',[wholesaleUser,JSON.stringify(items(4))])).rows[0].r
    assert.equal(wholesale.total_cents,20000)
    assert.equal(wholesale.progressive,undefined)

    // Exercise start + coupon reservation + verified approval + stock/order triggers.
    const start = async (code = '', quantity = 4) => {
      const q = await quote(items(quantity),code)
      const id = randomUUID(), shipping = randomUUID(), access = id.replaceAll('-','').repeat(2)
      await db.query("insert into serenity_shipping_quotes(id,request_id,cart_hash,destination,subtotal_cents,amount_cents,manual,settings_version,snapshot,expires_at) values($1,$2,$3,'18072000',$4,1000,false,1,'{\"pricing_mode\":\"retail\"}',now()+interval '15 minutes')",[shipping,id,'b'.repeat(64),q.subtotal_cents])
      await db.query('select serenity_checkout_start_v2($1,$2,$3,\'production\',null,$4,$5,$6,$7,$8,$9,$10,$11)',[
        id,'a'.repeat(64),access,JSON.stringify(items(quantity)),JSON.stringify({name:'Teste',email:'test@example.com',phone:'11999999999',document:'52998224725'}),
        JSON.stringify({cep:'18072000',street:'Rua',number:'1',complement:'',district:'Bairro',city:'Sorocaba',state:'SP'}),q.total_cents+1000,'b'.repeat(64),shipping,code,'c'.repeat(64)])
      return { id,access,q }
    }
    const complete = async (checkout, method = 'pix') => {
      const attempt = randomUUID()
      await db.query(`select ${method === 'card' ? 'serenity_checkout_claim_card_v3' : 'serenity_checkout_claim_pix_v2'}($1,$2,$3,$4,$5)`,[checkout.id,checkout.access,attempt,'123','d'.repeat(64)])
      const facts = {provider_payment_id:String(Math.floor(Math.random()*1e12)),external_reference:checkout.id,attempt_id:attempt,environment:'production',merchant_id:'123',amount_cents:checkout.q.total_cents+1000,currency:'BRL',method,status:'approved',status_detail:'accredited',refunded_cents:0,updated_at:new Date().toISOString(),expires_at:null}
      const observe = () => db.query(`select ${method === 'card' ? 'serenity_checkout_observe_payment_v3' : 'serenity_checkout_observe_payment_v2'}($1,$2,'webhook') r`,[attempt,JSON.stringify(facts)])
      const result = (await observe()).rows[0].r
      assert.equal(result.application_state,'applied')
      await observe()
      const order = (await db.query('select * from serenity_orders where id=$1',[checkout.id])).rows[0]
      assert.equal(Number(order.total)*100,checkout.q.total_cents+1000)
      assert.equal(Number(order.discount)*100,checkout.q.discount_cents)
    }
    const withoutCoupon = await start()
    assert.equal((await db.query('select count(*)::int n from serenity_checkout_coupon_v2 where checkout_id=$1',[withoutCoupon.id])).rows[0].n,0)
    await complete(withoutCoupon)
    const withCoupon = await start('TEST10')
    assert.equal((await db.query('select discount_cents from serenity_checkout_coupon_v2 where checkout_id=$1',[withCoupon.id])).rows[0].discount_cents,4000)
    await complete(withCoupon, 'card')
    assert.equal((await db.query('select discount_cents from serenity_coupon_redemptions where order_id=$1',[withCoupon.id])).rows[0].discount_cents,4000)
    assert.equal((await db.query('select stock_quantity from products where id=$1',[jewel])).rows[0].stock_quantity,92)
    assert.equal((await db.query('select count(*)::int n from serenity_orders')).rows[0].n,2)
    await db.exec('update serenity_collection_settings set enabled=false')
    assert.equal((await quote(items(4))).total_cents,40000)
    assert.equal((await quote(items(4))).progressive,undefined)
    const legacy = await start('TEST10',1)
    assert.equal(legacy.q.progressive,undefined)
    await db.exec('update serenity_collection_settings set enabled=true')
    await complete(legacy)
    const lockedQuote = await start('TEST10',2)
    await db.exec('update serenity_collection_settings set enabled=false')
    await complete(lockedQuote,'card')
    assert.equal((await db.query('select count(*)::int n from serenity_orders')).rows[0].n,4)
    // A genuinely different expression must still stop the migration atomically.
    await db.exec(originalComplete.replace(/coupon_hold\.discount_cents\s+is\s+distinct\s+from\s+checkout\.discount_cents/,
      'coupon_hold.discount_cents is distinct from coalesce(checkout.discount_cents, 0)'))
    await assert.rejects(db.exec(sql), /A confirmação de pagamentos mudou \(comparação\)/)
    await db.exec('rollback')
    assert.equal((await db.query('select enabled from serenity_collection_settings')).rows[0].enabled, false)
    assert.equal((await db.query("select has_function_privilege('anon','serenity_checkout_coupon_quote_v2(jsonb,text,text,uuid)','execute') ok")).rows[0].ok,false)
  } finally { await db.close() }
})
