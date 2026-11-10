const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHmac } = require('node:crypto')
const { load } = require('./helpers/load.cjs')

const env = {
  VERCEL_ENV: 'production', NODE_ENV: 'production',
  MERCADO_PAGO_ENVIRONMENT: 'production', MERCADO_PAGO_PAYMENTS_ENABLED: 'true',
  MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-fixture-token',
  NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY: 'APP_USR-fixture-key',
  MERCADO_PAGO_WEBHOOK_SECRET: 'fixture-webhook-secret-not-a-real-secret',
  SERENITY_SITE_URL: 'https://store.example.com',
}
const checkout = '11111111-1111-1111-1111-111111111111'
const attempt = '22222222-2222-2222-2222-222222222222'
const expected = { orderId: checkout, attemptId: attempt, merchantId: '456', amountCents: 1000, method: 'pix', environment: 'production' }
const expiration = new Date(Date.now() + 32 * 60000).toISOString()
function payment(extra = {}) {
  return {
    id: '123', collector_id: '456', transaction_amount: 10,
    transaction_amount_refunded: 0, currency_id: 'BRL', live_mode: true,
    external_reference: checkout, metadata: { serenity_attempt_id: attempt },
    payment_method_id: 'pix', payment_type_id: 'bank_transfer',
    status: 'pending', status_detail: 'pending_waiting_transfer',
    date_last_updated: new Date().toISOString(), date_of_expiration: expiration,
    point_of_interaction: { transaction_data: { qr_code: '000201-fixture', qr_code_base64: 'dGVzdA==' } },
    ...extra,
  }
}
function response(value, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), text: async () => JSON.stringify(value) }
}
function gateway(fetch, environment = env) {
  return load('src/lib/mercado-pago-server.ts', {'@/lib/read-fetch':load('src/lib/read-fetch.ts')}, environment, { fetch })
}

test('production requires explicit enable, real credentials, public URL, signature secret and production deployment', () => {
  const api = gateway()
  assert.equal(api.mercadoPagoPublicConfig().environment, 'production')
  for (const change of [
    { MERCADO_PAGO_PAYMENTS_ENABLED: 'false' },
    { MERCADO_PAGO_ACCESS_TOKEN: 'TEST-not-production' },
    { VERCEL_ENV: 'preview' }, { SERENITY_SITE_URL: 'http://store.example.com' },
    { MERCADO_PAGO_WEBHOOK_SECRET: '' },
  ]) assert.throws(() => gateway(undefined, { ...env, ...change }).mercadoPagoPublicConfig())
})

test('live payments are accepted only for matching production amount, merchant, checkout, attempt and currency', () => {
  const api = gateway()
  assert.equal(api.normalizeMercadoPagoPayment(payment(), expected).environment, 'production')
  for (const change of [
    { live_mode: false }, { collector_id: '999' }, { transaction_amount: 1 },
    { external_reference: attempt }, { metadata: { serenity_attempt_id: checkout } },
    { currency_id: 'USD' }, { payment_method_id: 'credit_card' },
  ]) assert.throws(() => api.normalizeMercadoPagoPayment(payment(change), expected), /MP_PAYMENT_MISMATCH/)
  assert.throws(() => api.normalizeMercadoPagoTestPayment(payment(), expected), /MP_TEST_ENVIRONMENT_REQUIRED/)
})

test('a production credential for a test account is rejected before creating Pix', async () => {
  const api = gateway(async () => response({ id: 456, site_id: 'MLB', tags: ['test_user'] }))
  await assert.rejects(api.mercadoPagoMerchant(), /MP_PRODUCTION_ACCOUNT_REQUIRED/)
})

test('production Pix uses server amount, stable idempotency key and canonical notification URL', async () => {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url, init })
    return response(url.endsWith('/users/me') ? { id: 456, site_id: 'MLB', tags: [] } : payment())
  }
  const api = gateway(fetch)
  const pix = load('src/lib/mercado-pago-pix-server.ts', { '@/lib/mercado-pago-server': api }, env, { fetch })
  const facts = await pix.createMercadoPagoPix(expected, {
    email: 'fixture@example.com', documentType: 'CPF', documentNumber: '00000000000',
  }, expiration)
  const posts = calls.filter(call => call.init.method === 'POST')
  assert.equal(posts.length, 1)
  const body = JSON.parse(posts[0].init.body)
  assert.equal(posts[0].init.headers['X-Idempotency-Key'], attempt)
  assert.equal(body.notification_url, 'https://store.example.com/api/webhooks/mercado-pago?source_news=webhooks')
  assert.equal(body.transaction_amount, 10)
  assert.equal(body.external_reference, checkout)
  assert.equal(body.metadata.serenity_attempt_id, attempt)
  assert.equal(facts.environment, 'production')
})

test('401 is not retried and cannot be treated as approval', async () => {
  let posts = 0
  const fetch = async (url, init) => {
    if (init.method === 'POST') { posts++; return response({ error: 'unauthorized', cause: [{ code: 7 }] }, 401) }
    return response({ id: 456, site_id: 'MLB', tags: [] })
  }
  const api = gateway(fetch)
  const pix = load('src/lib/mercado-pago-pix-server.ts', { '@/lib/mercado-pago-server': api }, env, { fetch })
  await assert.rejects(pix.createMercadoPagoPix(expected, {
    email: 'fixture@example.com', documentType: 'CPF', documentNumber: '00000000000',
  }, expiration), /MP_HTTP_401/)
  assert.equal(posts, 1)
})

test('pausing new charges leaves read-only reconciliation available', async () => {
  const paused = { ...env, MERCADO_PAGO_PAYMENTS_ENABLED: 'false' }
  let gets = 0
  const api = gateway(async (url, init) => {
    assert.equal(init.method, 'GET'); gets++
    return response(payment())
  }, paused)
  assert.throws(() => api.mercadoPagoPublicConfig(), /MP_PRODUCTION_DISABLED/)
  const facts = await api.readMercadoPagoPayment('123', expected)
  assert.equal(facts.status, 'pending')
  assert.equal(gets, 1)
})

const webhook = load('src/lib/mercado-pago-webhook.ts', { 'node:crypto': require('node:crypto') })
function notification(body = { type: 'payment', data: { id: '123' } }, time = Date.now()) {
  const ts = String(time)
  const digest = createHmac('sha256', env.MERCADO_PAGO_WEBHOOK_SECRET)
    .update(`id:123;request-id:fixture-request;ts:${ts};`).digest('hex')
  return new Request('https://store.example.com/api/webhooks/mercado-pago?data.id=123', {
    method: 'POST', headers: {
      'x-request-id': 'fixture-request', 'x-signature': `ts=${ts},v1=${digest}`,
    }, body: JSON.stringify(body),
  })
}

test('webhook checks HMAC, query ID and request ID; permits delayed signed redelivery', () => {
  assert.equal(webhook.verifyMercadoPagoWebhook(notification(), env.MERCADO_PAGO_WEBHOOK_SECRET).paymentId, '123')
  assert.equal(webhook.verifyMercadoPagoWebhook(notification(), 'wrong-secret-123456'), null)
  const changed = notification(); changed.headers.set('x-request-id', 'tampered')
  assert.equal(webhook.verifyMercadoPagoWebhook(changed, env.MERCADO_PAGO_WEBHOOK_SECRET), null)
  const future = notification(undefined, Date.now() + 20 * 60000)
  assert.equal(webhook.verifyMercadoPagoWebhook(future, env.MERCADO_PAGO_WEBHOOK_SECRET), null)
  assert.ok(webhook.verifyMercadoPagoWebhook(notification(undefined, Date.now() - 2 * 86400000), env.MERCADO_PAGO_WEBHOOK_SECRET))
})

function processing(api) {
  let observed
  let reads = 0
  const row = { id: attempt, checkout_id: checkout, environment: 'production', merchant_id: '456', method: 'pix', amount_cents: 1000, provider_payment_id: '123' }
  const db = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { reads++; return { data: row } } }) }) }),
    rpc: async (name, params) => { assert.equal(name, 'serenity_checkout_observe_payment_v2'); observed = params; return { data: { state: 'pending', application_state: 'pending' } } },
  }
  const service = load('src/lib/payment-processing-server.ts', {
    '@supabase/supabase-js': { createClient: () => db }, 'next/cache': { revalidatePath() {}, revalidateTag() {} },
    '@/lib/mercado-pago-server': api, '@/lib/mercado-pago-reconcile-server': {},
  }, env)
  // paymentDatabase recebe a configuração do módulo de serviço.
  const routeWithDB = load('src/app/api/webhooks/mercado-pago/route.ts', {
    '@/lib/mercado-pago-server': api, '@/lib/mercado-pago-webhook': webhook,
    '@/lib/payment-processing-server': { ...service, paymentDatabase: () => db },
  }, env)
  return { route: routeWithDB, observed: () => observed, reads: () => reads }
}

test('webhook never trusts an approval submitted in the notification body', async () => {
  const api = gateway(async (url) => response(url.endsWith('/users/me')
    ? { id: 456, site_id: 'MLB', tags: [] } : payment()))
  const harness = processing(api)
  const result = await harness.route.POST(notification({ type: 'payment', data: { id: '123' }, status: 'approved', transaction_amount: 999 }))
  assert.equal(result.status, 200)
  assert.equal(harness.observed().p_observation.status, 'pending')
  assert.equal(harness.observed().p_observation.amount_cents, 1000)
})

test('forged signature and body/query disagreement cannot touch the database', async () => {
  let remote = 0
  const harness = processing(gateway(async () => { remote++; throw new Error('Unexpected network') }))
  const request = notification(); request.headers.set('x-signature', 'ts=123,v1=bad')
  assert.equal((await harness.route.POST(request)).status, 401)
  assert.equal((await harness.route.POST(notification({ type: 'payment', data: { id: '999' } }))).status, 400)
  assert.equal(remote, 0)
  assert.equal(harness.reads(), 0)
  assert.equal(harness.observed(), undefined)
})

test('verified notification with wrong provider amount is not applied', async () => {
  const harness = processing(gateway(async (url) => response(url.endsWith('/users/me')
    ? { id: 456, site_id: 'MLB', tags: [] } : payment({ transaction_amount: 99 }))))
  assert.equal((await harness.route.POST(notification())).status, 503)
  assert.equal(harness.observed(), undefined)
})

test('approval saved without order asks the provider to redeliver the signed notification', async () => {
  const api = gateway(async (url) => response(url.endsWith('/users/me')
    ? { id: 456, site_id: 'MLB', tags: [] } : payment({ status: 'approved' })))
  const row = { id: attempt, checkout_id: checkout, environment: 'production', merchant_id: '456', method: 'pix', amount_cents: 1000 }
  const service = load('src/lib/payment-processing-server.ts', {
    '@supabase/supabase-js': {}, 'next/cache': { revalidatePath() {}, revalidateTag() {} },
    '@/lib/mercado-pago-server': api, '@/lib/mercado-pago-reconcile-server': {},
  }, env)
  const db = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
    rpc: async () => ({ data: { state: 'approved', application_state: 'review' } }),
  }
  const route = load('src/app/api/webhooks/mercado-pago/route.ts', {
    '@/lib/mercado-pago-server': api, '@/lib/mercado-pago-webhook': webhook,
    '@/lib/payment-processing-server': { ...service, paymentDatabase: () => db },
  }, env)
  assert.equal((await route.POST(notification())).status, 503)
})

test('production database readiness refuses a missing migration and accepts only V3 ready', async () => {
  const api = gateway()
  const service = load('src/lib/payment-processing-server.ts', {
    '@supabase/supabase-js': {}, 'next/cache': {},
    '@/lib/mercado-pago-server': api, '@/lib/mercado-pago-reconcile-server': {},
  }, env)
  await assert.rejects(service.assertProductionPaymentReady({ rpc: async () => ({ error: { code: 'PGRST202' } }) }), /PAYMENT_DATABASE_MIGRATION_REQUIRED/)
  await service.assertProductionPaymentReady({ rpc: async () => ({ data: { version: 3, ready: true } }) })
})

test('oversized signed notification is rejected before any provider or database access', async () => {
  let remote = 0
  const harness = processing(gateway(async () => { remote++; throw new Error('Unexpected network') }))
  const request = notification({ type: 'payment', data: { id: '123' }, padding: 'x'.repeat(18000) })
  assert.equal((await harness.route.POST(request)).status, 400)
  assert.equal(remote, 0)
  assert.equal(harness.reads(), 0)
})

test('reconciliation cron requires a valid secret and does not run in Preview', async () => {
  const secret = 'fixture-cron-secret-at-least-32-characters'
  const mocks = {
    'node:crypto': require('node:crypto'), '@/lib/mercado-pago-server': {},
    '@/lib/payment-processing-server': {},
  }
  const route = load('src/app/api/cron/pagamentos/route.ts', mocks, { CRON_SECRET: secret, VERCEL_ENV: 'preview' })
  assert.equal((await route.GET(new Request('https://store.example.com/api/cron/pagamentos'))).status, 401)
  const valid = new Request('https://store.example.com/api/cron/pagamentos', { headers: { authorization: `Bearer ${secret}` } })
  const result = await route.GET(valid)
  assert.equal(result.status, 200)
  assert.equal((await result.json()).skipped, true)
})

test('payment backup prioritizes approved attempts and reports unresolved reviews as failures',async()=>{
 const calls=[]
 const db={from(){let selecting=false;const q={select(){selecting=true;return q},eq(){return q},in(){return q},neq(){return q},order(key){calls.push(key);return q},limit(){return q},update(){selecting=false;return q},then(resolve){return Promise.resolve({error:null,data:selecting?[{id:'first'},{id:'second'}]:null}).then(resolve)}};return q}}
 const route=load('src/app/api/cron/pagamentos/route.ts',{
  'node:crypto':require('node:crypto'),
  '@/lib/mercado-pago-server':{mercadoPagoConfig:()=>({environment:'production'})},
  '@/lib/payment-processing-server':{paymentDatabase:()=>db,reconcilePaymentAttempt:async(_db,id)=>({found:true,review:id==='first'}),paymentFailureCode:()=> 'FAILED'},
 },{CRON_SECRET:'test-secret-at-least-thirty-two-characters',VERCEL_ENV:'production'})
 const response=await route.GET(new Request('https://store.example/api/cron/pagamentos',{headers:{authorization:'Bearer test-secret-at-least-thirty-two-characters'}}))
 assert.equal(response.status,503)
 assert.equal((await response.json()).failed,1)
 assert.deepEqual(calls,['state','last_reconciled_at','created_at'])
})
