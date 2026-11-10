const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const {normalizeCheckoutSessionV2}=load('src/lib/checkout-session-server-v2.ts',{
 'node:crypto':require('node:crypto'),'next/headers':{cookies:()=>({})},'@/lib/checkout-server':{checkoutHash:()=>''},'@/lib/wholesale-server':{wholesaleError:()=>''},
})
const id='11111111-1111-4111-8111-111111111111'
const context=(options={})=>({checkout_id:id,state:'pending',environment:'production',pricing_mode:'retail',total_cents:10000,shipping_pending:false,reserved_until:'2026-10-26T22:00:00Z',order_id:null,order_number:null,needs_review:false,test_approved:false,attempts:[],payment_options:{card_total_cents:10000,pix_total_cents:9500,pix_discount_cents:500,applied_discount_cents:0,selected_method:null,...options}})
test('new checkout opens before method selection with zero applied Pix discount; card and wholesale can keep zero',()=>{
 assert.equal(normalizeCheckoutSessionV2(context(),id).paymentOptions.appliedDiscountCents,0)
 assert.equal(normalizeCheckoutSessionV2(context({selected_method:'card'}),id).paymentOptions.appliedDiscountCents,0)
 const wholesale={...context({pix_total_cents:10000,pix_discount_cents:0,applied_discount_cents:0}),pricing_mode:'wholesale'}
 assert.equal(normalizeCheckoutSessionV2(wholesale,id).paymentOptions.pixDiscountCents,0)
 const pix={...context({selected_method:'pix',applied_discount_cents:500}),total_cents:9500}
 assert.equal(normalizeCheckoutSessionV2(pix,id).totalCents,9500)
})
test('discount validation still rejects negative, fractional, missing, unsafe and inconsistent amounts',()=>{
 for(const value of [-1,0.5,null,undefined,'NaN',Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>normalizeCheckoutSessionV2(context({applied_discount_cents:value}),id),/CHECKOUT_CONTEXT_INVALID/)
 assert.throws(()=>normalizeCheckoutSessionV2(context({pix_discount_cents:501}),id),/CHECKOUT_CONTEXT_INVALID/)
 assert.throws(()=>normalizeCheckoutSessionV2(context({pix_total_cents:0}),id),/CHECKOUT_CONTEXT_INVALID/)
 assert.throws(()=>normalizeCheckoutSessionV2({...context(),total_cents:0},id),/CHECKOUT_CONTEXT_INVALID/)
})
