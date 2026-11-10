const { test } = require('node:test')
const assert = require('node:assert/strict')

const { load } = require('./helpers/load.cjs')

const credentials = {
  VERCEL_ENV: 'production',
  NODE_ENV: 'production',
  MERCADO_PAGO_ENVIRONMENT: 'test',
  MERCADO_PAGO_ACCESS_TOKEN: 'TEST-fixture-token',
  NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY: 'TEST-fixture-key',
}

const checkoutId = '11111111-1111-1111-1111-111111111111'
const attemptId = '22222222-2222-2222-2222-222222222222'

test('main deployment accepts sandbox and rejects incomplete production configuration', () => {
  const api = load('src/lib/mercado-pago-server.ts', {'@/lib/read-fetch':load('src/lib/read-fetch.ts')}, credentials)
  assert.equal(api.mercadoPagoTestPublicConfig().environment, 'test')
  for (const environment of [undefined, 'production']) {
    const blocked = load('src/lib/mercado-pago-server.ts', {'@/lib/read-fetch':load('src/lib/read-fetch.ts')}, {
      ...credentials, MERCADO_PAGO_ENVIRONMENT: environment,
    })
    assert.throws(() => blocked.mercadoPagoTestPublicConfig(), /MP_(ENVIRONMENT_REQUIRED|PRODUCTION_CREDENTIALS_REQUIRED)/)
  }
})

test('a real provider payment is rejected even when deployed on production', () => {
  const api = load('src/lib/mercado-pago-server.ts', {'@/lib/read-fetch':load('src/lib/read-fetch.ts')}, credentials)
  const payment = {
    id: '123', collector_id: '456', transaction_amount: 10,
    transaction_amount_refunded: 0, currency_id: 'BRL', live_mode: true,
    external_reference: checkoutId,
    metadata: { serenity_attempt_id: attemptId },
    payment_method_id: 'pix', payment_type_id: 'bank_transfer',
    status: 'approved', status_detail: 'accredited',
  }
  assert.throws(() => api.normalizeMercadoPagoTestPayment(payment, {
    orderId: checkoutId, attemptId, merchantId: '456', amountCents: 1000, method: 'pix',
  }), /MP_PAYMENT_MISMATCH/)
})

function dependencies(authError) {
  const calls = []
  const cookies = []
  const mocks = {
    '@/lib/analytics-server':{captureCheckoutAnalytics:async()=>{}},
    '@/lib/payment-processing-server': { assertProductionPaymentReady: async () => {} },
    '@/lib/checkout-server': {
      checkoutDatabase: async () => ({ rpc: async (name, params) => {
        if (name === 'serenity_checkout_start_v2') assert.equal(params.p_user, '33333333-3333-4333-8333-333333333333')
        calls.push(name)
        return { data: { fixture: true }, error: null }
      } }),
      checkoutHash: () => 'fixture-hash',
    },
    '@/lib/checkout': {
      validateCheckoutLines: (items) => items,
      validateCheckoutContact: (customer, address) => ({ customer, address }),
    },
    '@/lib/checkout-document': { normalizeCheckoutDocument: (value) => value },
    '@/lib/coupon-ui': { normalizeCouponCode: (value) => value },
    '@/lib/wholesale-server': {
      readWholesaleAccess: async () => ({ userId: '33333333-3333-4333-8333-333333333333', rules: null }),
      wholesaleError: () => '',
    },
    '@/lib/mercado-pago-server': {
      mercadoPagoPublicConfig: () => ({ environment: 'test' }),
      mercadoPagoMerchant: async () => { if (authError) throw authError; return '456' },
    },
    '@/lib/checkout-session-server-v2': {
      checkoutAccessV2: () => ({ hash: 'fixture-hash', token: 'fixture-token' }),
      normalizeCheckoutSessionV2: () => ({
        id: checkoutId, totalCents: 1000, shippingPending: false,
        reservedUntil: '2026-11-01T00:00:00.000Z',
      }),
      writeCheckoutCookieV2: (...args) => cookies.push(args),
      checkoutSessionErrorV2: (error) => error.message,
    },
    '@/lib/shipping-server': { deliveryError: () => '', deliveryOptions: async () => ({ options: [] }) },
  }
  mocks['@/lib/guest-checkout']=load('src/lib/guest-checkout.ts',{'./wholesale-server':mocks['@/lib/wholesale-server']})
  mocks['@/lib/guest-tracking-server']={assertGuestCheckoutReady:async()=>{},registerGuestCheckout:async()=>{throw new Error('unexpected guest registration while disabled')}}
  return { mocks, calls, cookies }
}

const input = {
  id: checkoutId, items: [{ slug: 'fixture', quantity: 1, variant: '', color: '' }],
  customer: { name: 'Fixture', email: 'fixture@example.com', phone: '11999999999', document: '00000000000' },
  address: { cep: '01001000', street: 'Fixture', number: '1', complement: '', district: 'Fixture', city: 'Fixture', state: 'SP' },
  totalCents: 1000, shippingQuote: attemptId, website: '',
}

test('invalid gateway authentication fails before checkout reservation and payment cookie', async () => {
  const { mocks, calls, cookies } = dependencies(new Error('MP_HTTP_401'))
  const api = load('src/app/checkout/actions-v2.ts', mocks)
  const result = await api.startCheckoutV2(input)
  assert.equal(result.error, 'MP_HTTP_401')
  assert.equal(calls.length, 0)
  assert.equal(cookies.length, 0)
})

test('valid continuation creates only a temporary checkout and internal payment access', async () => {
  const { mocks, calls, cookies } = dependencies()
  const api = load('src/app/checkout/actions-v2.ts', mocks)
  const result = await api.startCheckoutV2(input)
  assert.equal(result.error, '')
  assert.equal(result.checkout.paymentUrl, `/pagamento/${checkoutId}`)
  assert.equal(result.receipt, undefined)
  assert.deepEqual(calls, ['serenity_checkout_start_v2'])
  assert.equal(cookies.length, 1)
})

test('the legacy submit action cannot create orders or reserve stock', async () => {
  const { mocks, calls, cookies } = dependencies()
  const api = load('src/app/checkout/actions.ts', mocks)
  const result = await api.submitCheckout(input)
  assert.ok(result.error)
  assert.equal(result.receipt, undefined)
  assert.equal(calls.length, 0)
  assert.equal(cookies.length, 0)
})


test('guest checkout is refused before reservation, credentials lookup or capability cookie', async () => {
  const { mocks, calls, cookies } = dependencies()
  mocks['@/lib/wholesale-server'].readWholesaleAccess = async () => ({ userId: null, rules: null })
  mocks['@/lib/mercado-pago-server'].mercadoPagoMerchant = async () => { throw new Error('must not query gateway') }
  const api = load('src/app/checkout/actions-v2.ts', mocks)
  const result = await api.startCheckoutV2(input)
  assert.equal(result.loginRequired, true)
  assert.equal(result.checkout, undefined)
  assert.equal(calls.length, 0)
  assert.equal(cookies.length, 0)
})

test('an expired customer session requests login without creating checkout or payment access', async () => {
  const { mocks, calls, cookies } = dependencies()
  mocks['@/lib/wholesale-server'].readWholesaleAccess = async () => { throw new Error('WHOLESALE_SESSION') }
  const api = load('src/app/checkout/actions-v2.ts', mocks)
  const result = await api.startCheckoutV2(input)
  assert.equal(result.loginRequired, true)
  assert.equal(calls.length, 0)
  assert.equal(cookies.length, 0)
})
test('checkout diagnostics identify the failure stage without creating another session or exposing customer data',async()=>{
 const {mocks,calls,cookies}=dependencies(new Error('MP_QUERY_FAILED'))
 let diagnostic
 mocks['@/lib/checkout-session-server-v2'].checkoutSessionErrorV2=(error,context)=>{diagnostic=context;return error.message}
 const api=load('src/app/checkout/actions-v2.ts',mocks)
 const result=await api.startCheckoutV2(input)
 assert.equal(result.error,'MP_QUERY_FAILED');assert.equal(diagnostic.stage,'merchant');assert.equal(diagnostic.checkoutId,checkoutId)
 assert.equal(calls.length,0);assert.equal(cookies.length,0)
 assert.equal('customer' in diagnostic,false)
})
test('database failures are distinguished from provider failures before any reservation',async()=>{
 const {mocks,calls}=dependencies()
 let diagnostic
 mocks['@/lib/checkout-server'].checkoutDatabase=async()=>{throw new Error('CHECKOUT_UNAVAILABLE')}
 mocks['@/lib/checkout-session-server-v2'].checkoutSessionErrorV2=(error,context)=>{diagnostic=context;return error.message}
 const api=load('src/app/checkout/actions-v2.ts',mocks)
 await api.startCheckoutV2(input)
 assert.equal(diagnostic.stage,'database');assert.equal(calls.length,0)
})

test('enabled guest checkout keeps customer and address validation, passes null owner and registers secure receipt before payment cookie',async()=>{
 const {mocks,cookies}=dependencies()
 mocks['@/lib/wholesale-server'].readWholesaleAccess=async()=>({userId:null,rules:null})
 mocks['@/lib/guest-checkout']=load('src/lib/guest-checkout.ts',{'./wholesale-server':mocks['@/lib/wholesale-server']},{SERENITY_GUEST_CHECKOUT_ENABLED:'true'})
 let registered=false
 mocks['@/lib/guest-tracking-server'].registerGuestCheckout=async(_db,id,hash)=>{assert.equal(id,checkoutId);assert.equal(hash,'fixture-hash');assert.equal(cookies.length,0);registered=true}
 mocks['@/lib/checkout-server'].checkoutDatabase=async()=>({rpc:async(name,args)=>{assert.equal(name,'serenity_checkout_start_v2');assert.equal(args.p_user,null);assert.equal(args.p_customer.email,input.customer.email);return {data:{},error:null}}})
 const result=await load('src/app/checkout/actions-v2.ts',mocks).startCheckoutV2(input)
 assert.equal(result.error,'');assert.equal(registered,true);assert.equal(cookies.length,1)
})
