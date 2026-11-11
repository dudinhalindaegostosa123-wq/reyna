import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { paymentDatabase } from './helpers/payment-db.mjs'
import loader from './helpers/load.cjs'
const { normalizeCheckoutSessionV2 } = loader.load('src/lib/checkout-session-server-v2.ts', {
  'node:crypto': {}, 'next/headers': {}, '@/lib/checkout-server': {}, '@/lib/wholesale-server': {},
})
const migration = fs.readFileSync(new URL('../database/asaas/01-checkout.sql', import.meta.url), 'utf8')

for (const pixDiscount of [false, true]) test(`Asaas SQL integration, Pix discount ${pixDiscount}`, async t => {
  const db = await paymentDatabase()
  try {
    if (pixDiscount) {
      await db.exec(fs.readFileSync(new URL('./fixtures/payments/installed-complete-order-v2.sql', import.meta.url), 'utf8'))
      await db.exec(fs.readFileSync(new URL('../database/collection/01-progressivo.sql', import.meta.url), 'utf8'))
      await db.exec(fs.readFileSync(new URL('../database/pix-discount/01-pix-five.sql', import.meta.url), 'utf8'))
    }
    await db.exec(migration); await db.exec(migration)
    assert.equal((await db.query('select serenity_asaas_ready_v1() r')).rows[0].r.ready, true)
    const product = randomUUID()
    await db.query(`insert into products(id,slug,name,status,visibility,stock_status,stock_quantity,sold_individually,product_type,regular_price,tags)
      values($1,'asaas-test','Topo Teste','published','visible','instock',100,false,'simple',100,'{}')`, [product])
    const context = async s => {
      const data = (await db.query('select serenity_checkout_context_v2($1,$2) r', [s.id,s.access])).rows[0].r
      normalizeCheckoutSessionV2(data,s.id)
      return data
    }
    const prepare = async (method = 'pix', environment = 'production') => {
      const id = randomUUID(), shipping = randomUUID(), access = id.replaceAll('-','').repeat(2)
      await db.query(`insert into serenity_shipping_quotes(id,request_id,cart_hash,destination,subtotal_cents,amount_cents,manual,settings_version,snapshot,expires_at)
        values($1,$2,repeat('b',64),'18072000',10000,1000,false,1,'{"pricing_mode":"retail"}',now()+interval '15 minutes')`, [shipping,id])
      await db.query(`select serenity_checkout_start_v2($1,repeat('a',64),$2,$3,null,$4,$5,$6,11000,repeat('b',64),$7,'',repeat('c',64))`, [
        id,access,environment,JSON.stringify([{slug:'asaas-test',variant:'',quantity:1,color:''}]),
        JSON.stringify({name:'Fixture',email:'fixture@example.com',document:'52998224725',phone:'11999999999'}),
        JSON.stringify({cep:'18072000',street:'Rua',number:'1',complement:'',district:'Bairro',city:'Sorocaba',state:'SP'}),shipping,
      ])
      if (pixDiscount) await db.query('select serenity_checkout_select_method_v4($1,$2,$3)',[id,access,method])
      return {id,access,method,environment}
    }
    const claim = async (s, attempt = randomUUID()) => {
      const data = (await db.query(`select serenity_asaas_claim_v1($1,$2,$3,'123',repeat('d',64),$4) r`,[s.id,s.access,attempt,s.method])).rows[0].r
      return {...data,id:attempt}
    }
    const bind = async a => db.query(`select serenity_asaas_customer_v1($1,$2,'cus_fixture')`,[a.id,a.lease_id])
    let tick = 0
    const facts = (s,a,status='approved',extra={}) => ({
      provider_payment_id:'pay_'+a.id,merchant_id:'123',external_reference:s.id,attempt_id:a.id,
      environment:s.environment,method:s.method,currency:'BRL',amount_cents:a.amount_cents,refunded_cents:0,
      customer_id:'cus_fixture',invoice_url:`https://${s.environment==='test'?'sandbox':'www'}.asaas.com/i/fixture`,
      status,status_detail:status==='approved'?'CONFIRMED':'PENDING',updated_at:new Date(Date.now()+tick++*1000).toISOString(),
      expires_at:new Date(Date.now()+12*60*60*1000).toISOString(),pix_code:'pix-fixture',pix_qr_base64:'dGVzdA==',...extra,
    })
    const observe = async (s,a,status='approved',extra={}) => (await db.query("select serenity_asaas_observe_v1($1,$2,'webhook') r",[a.id,JSON.stringify(facts(s,a,status,extra))])).rows[0].r
    const count = async table => Number((await db.query(`select count(*) n from ${table}`)).rows[0].n)
    const stock = async () => (await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity
    await t.test('claim blocks duplicate POST and cross-method/provider attempts before approval',async()=>{
      const s=await prepare(),a=await claim(s)
      assert.equal(a.submit,true)
      assert.equal((await claim(s,a.id)).submit,false)
      await assert.rejects(claim({...s,method:'card'}),/PAYMENT_(ALREADY_STARTED|METHOD_CHANGED)/)
      await assert.rejects(db.query(`select serenity_checkout_claim_pix_v2($1,$2,$3,'123',repeat('d',64))`,[s.id,s.access,randomUUID()]),/PAYMENT_ALREADY_STARTED/)
      await assert.rejects(db.query(`select serenity_asaas_customer_v1($1,$2,'cus_other')`,[a.id,randomUUID()]),/PAYMENT_LEASE_INVALID/)
      await bind(a)
      await observe(s,a,'pending')
      const publicContext=await context(s)
      assert.equal(publicContext.attempts[0].provider,'asaas')
      assert.equal(publicContext.attempts[0].pix_code,'pix-fixture')
      assert.equal(await count('serenity_orders'),0)
      assert.equal(await stock(),100)
      assert.equal((await observe(s,a)).application_state,'applied')
      assert.equal((await observe(s,a)).application_state,'applied')
      assert.equal(await count('serenity_orders'),1)
      assert.equal(await stock(),99)
      const order=(await db.query('select * from serenity_orders where id=$1',[s.id])).rows[0]
      assert.equal(order.shipping_details.payment.provider,'asaas')
      assert.match(order.notes,/Asaas/)
      assert.equal((await context(s)).state,'converted')
      await assert.rejects(observe(s,a,'approved',{amount_cents:1}),/PAYMENT_OBSERVATION_MISMATCH/)
      await assert.rejects(observe(s,a,'approved',{customer_id:'cus_wrong'}),/PAYMENT_OBSERVATION_MISMATCH/)
      await assert.rejects(observe(s,a,'approved',{invoice_url:'https://attacker.example/i/a'}),/ASAAS_INVOICE_URL_INVALID/)
      await assert.rejects(observe(s,a,'approved',{environment:'test'}),/PAYMENT_OBSERVATION_MISMATCH/)
    })
    await t.test('inline card approval converts once and full refund does not restock',async()=>{
      const s=await prepare('card'),a=await claim(s);await bind(a)
      assert.equal((await observe(s,a)).application_state,'applied')
      await observe(s,a)
      assert.equal(await stock(),98)
      const r=await observe(s,a,'refunded',{refunded_cents:a.amount_cents})
      assert.equal(r.application_state,'applied')
      assert.equal((await db.query('select status from serenity_orders where id=$1',[s.id])).rows[0].status,'refunded')
      assert.equal(await stock(),98)
    })
    await t.test('uncertain submission can recover by authenticated facts but cannot POST again',async()=>{
      const s=await prepare(),a=await claim(s);await bind(a)
      await db.query(`select serenity_asaas_uncertain_v1($1,$2,repeat('d',64),'ASAAS_SUBMISSION_UNCERTAIN')`,[a.id,a.lease_id])
      assert.equal((await claim(s,a.id)).submit,false)
      await assert.rejects(claim(s),/PAYMENT_(CHECKOUT_UNAVAILABLE|ALREADY_STARTED)/)
      assert.equal((await context(s)).needs_review,true)
      assert.equal((await observe(s,a)).application_state,'applied')
      assert.equal(await stock(),97)
    })
    await t.test('sandbox approval creates no order and no stock debit',async()=>{
      const before=await count('serenity_orders')
      const s=await prepare('card','test'),a=await claim(s);await bind(a)
      assert.equal((await observe(s,a)).application_state,'test_approved')
      assert.equal((await context(s)).order_id,null)
      assert.equal(await count('serenity_orders'),before)
      assert.equal(await stock(),97)
    })
    await t.test('late approval and refunds/unknown states go to review',async()=>{
      const before=await count('serenity_orders')
      const s=await prepare(),a=await claim(s);await bind(a)
      await db.query(`update serenity_checkout_sessions_v2 set created_at=now()-interval '40 minutes',expires_at=now()-interval '1 minute',access_expires_at=now()+interval '22 hours' where id=$1`,[s.id])
      const result=await observe(s,a)
      assert.equal(result.state,'approved');assert.equal(result.application_state,'review')
      assert.equal(await count('serenity_orders'),before)
      assert.equal(await stock(),97)
      const other=await prepare(),otherAttempt=await claim(other);await bind(otherAttempt)
      assert.equal((await observe(other,otherAttempt,'in_mediation')).application_state,'review')
      assert.equal((await context(other)).needs_review,true)
    })
    await t.test('private RPCs are inaccessible to anonymous and authenticated roles',async()=>{
      for(const role of ['anon','authenticated']) {
        assert.equal((await db.query(`select has_function_privilege($1,'serenity_asaas_observe_v1(uuid,jsonb,text)','execute') ok`,[role])).rows[0].ok,false)
        assert.equal((await db.query(`select has_function_privilege($1,'serenity_asaas_claim_v1(uuid,text,uuid,text,text,text)','execute') ok`,[role])).rows[0].ok,false)
      }
    })
  } finally { await db.close() }
})
