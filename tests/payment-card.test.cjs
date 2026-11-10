const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { load } = require('./helpers/load.cjs')
const { renderer, nodes, storage } = require('./helpers/render.cjs')

const env = {
  VERCEL_ENV: 'production', MERCADO_PAGO_ENVIRONMENT: 'production',
  MERCADO_PAGO_PAYMENTS_ENABLED: 'true', MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-fixture',
  NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY: 'APP_USR-fixture-public',
  MERCADO_PAGO_WEBHOOK_SECRET: 'fixture-webhook-secret-not-real', SERENITY_SITE_URL: 'https://store.example.com',
}
const checkoutId = '11111111-1111-1111-1111-111111111111'
const attemptId = '22222222-2222-2222-2222-222222222222'
const token = 'a'.repeat(32)
const card = { token, paymentMethodId: 'visa', issuerId: '123', installments: 3 }
const payer = { email: 'fixture@example.com', identification: { type: 'CPF', number: '52998224725' } }
const expected = { orderId: checkoutId, attemptId, merchantId: '456', amountCents: 1000, method: 'card', environment: 'production' }
const documentApi = load('src/lib/checkout-document.ts')
const validator = load('src/lib/card-payment.ts', { '@/lib/checkout-document': documentApi })
function payment(extra = {}) {
  return {
    id: '123', collector_id: '456', transaction_amount: 10, transaction_amount_refunded: 0,
    currency_id: 'BRL', live_mode: true, external_reference: checkoutId,
    metadata: { serenity_attempt_id: attemptId }, payment_method_id: 'visa', payment_type_id: 'credit_card',
    status: 'approved', status_detail: 'accredited', date_last_updated: new Date().toISOString(), ...extra,
  }
}
const response = (value, status = 200) => ({ ok: status < 300, status, headers: new Headers(), text: async () => JSON.stringify(value) })
const gateway = fetch => load('src/lib/mercado-pago-server.ts', {'@/lib/read-fetch':load('src/lib/read-fetch.ts')}, env, { fetch })

test('card input accepts only an opaque SDK token; raw card fields and client amount are rejected', () => {
  assert.equal(validator.validateCardPaymentInput(card).installments, 3)
  for (const extra of [ { card_number: '4111111111111111' }, { cvv: '123' }, { transaction_amount: 1 }, { installments: 13 }, { token: '4111111111111111' } ]) {
    assert.throws(() => validator.validateCardPaymentInput({ ...card, ...extra }), /MP_CARD_INPUT_INVALID/)
  }
  assert.equal(validator.validateCardPaymentInput({ ...card, payer }).payer.identification.number, payer.identification.number)
})

test('server checks the payment method against active credit-card methods', async () => {
  const api = gateway(async (_url, init) => {
    assert.equal(init.method, 'GET')
    return response([
      { id: 'visa', payment_type_id: 'credit_card', status: 'active' },
      { id: 'pix', payment_type_id: 'bank_transfer', status: 'active' },
      { id: 'debit', payment_type_id: 'debit_card', status: 'active' },
    ])
  })
  await api.mercadoPagoCreditCardMethod('visa')
  await assert.rejects(api.mercadoPagoCreditCardMethod('pix'), /MP_CARD_METHOD_INVALID/)
  await assert.rejects(api.mercadoPagoCreditCardMethod('debit'), /MP_CARD_METHOD_INVALID/)
})

test('card creation uses server amount, installments, idempotency and the same signed webhook endpoint', async () => {
  let posted
  const fetch = async (_url, init) => { posted = init; return response(payment()) }
  const api = gateway(fetch)
  const adapter = load('src/lib/mercado-pago-card-server.ts', { '@/lib/mercado-pago-server': api }, env, { fetch })
  const result = await adapter.createMercadoPagoCard(expected, card, payer)
  const body = JSON.parse(posted.body)
  assert.equal(body.transaction_amount, 10)
  assert.equal(body.installments, 3)
  assert.equal(body.token, token)
  assert.equal(body.three_d_secure_mode, 'optional')
  assert.equal(body.notification_url, 'https://store.example.com/api/webhooks/mercado-pago?source_news=webhooks')
  assert.equal(posted.headers['X-Idempotency-Key'], attemptId)
  assert.equal(body.card_number, undefined)
  assert.equal(body.cvv, undefined)
  assert.equal(result.method, 'card')
  assert.equal(result.status, 'approved')
  assert.equal(result.token, undefined)
})

test('3DS challenge comes only from a matching provider payment and requires HTTPS', () => {
  const api = gateway()
  const challenge = payment({ status: 'pending', status_detail: 'pending_challenge', three_ds_info: { external_resource_url: 'https://issuer.example.com/challenge', creq: 'dGVzdA==' } })
  const result = api.normalizeMercadoPagoPayment(challenge, expected)
  assert.equal(result.card_authentication.creq, 'dGVzdA==')
  assert.throws(() => api.normalizeMercadoPagoPayment({ ...challenge, three_ds_info: { ...challenge.three_ds_info, external_resource_url: 'javascript:alert(1)' } }, expected), /MP_RESPONSE_INVALID/)
})

test('card authorization errors are not retried automatically', async () => {
  let posts = 0
  const fetch = async () => { posts++; return response({ error: 'unauthorized' }, 401) }
  const adapter = load('src/lib/mercado-pago-card-server.ts', { '@/lib/mercado-pago-server': gateway(fetch) }, env, { fetch })
  await assert.rejects(adapter.createMercadoPagoCard(expected, card, payer), /MP_HTTP_401/)
  assert.equal(posts, 1)
})

function actionHarness({ priced = false, failed = false, blocking = false, userId = '33333333-3333-4333-8333-333333333333', ownerId = '33333333-3333-4333-8333-333333333333' } = {}) {
  const calls = [], requests = []
  let context = {
    id: checkoutId, environment: 'production', state: 'pending', totalCents: 1000,
    reservedUntil: new Date(Date.now() + 35 * 60000).toISOString(), attempts: [],
    needsReview: false, shippingPending: false, testApproved: false, orderId: null,
  }
  if (priced) context.paymentOptions = { selectedMethod: 'card' }
  if (blocking) context.attempts.push({ id: 'other', method: 'pix', blocksNewAttempt: true })
  const db = {
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { account_user_id: ownerId, customer_snapshot: { email: payer.email, document: payer.identification.number } } }) }) }) }),
    rpc: async (name, params) => {
      calls.push({ name, params })
      if (name === 'serenity_checkout_claim_card_v3') return { data: {
        submit: true, lease_id: '33333333-3333-3333-3333-333333333333', checkout_id: checkoutId, attempt_id: attemptId,
        environment: 'production', merchant_id: '456', method: 'card', currency: 'BRL', amount_cents: 1000,
        customer: { email: payer.email, document: payer.identification.number },
      } }
      if (name === 'serenity_checkout_pix_uncertain_v2') context = { ...context, state: 'review', needsReview: true }
      return { data: {} }
    },
  }
  const action = load('src/app/pagamento/[id]/card-actions.ts', {
    '@/lib/guest-checkout':load('src/lib/guest-checkout.ts',{'./wholesale-server':{readWholesaleAccess:async()=>({userId,rules:null})}}),
    '@/lib/checkout-server': { checkoutDatabase: async () => db, checkoutHash: value => { requests.push(JSON.parse(value)); return 'b'.repeat(64) } },
    '@/lib/checkout-document': documentApi, '@/lib/card-payment': validator,
    '@/lib/mercado-pago-server': { mercadoPagoPublicConfig: () => ({ environment: 'production' }), mercadoPagoMerchant: async () => '456', mercadoPagoCreditCardMethod: async () => {} },
    '@/lib/mercado-pago-card-server': { createMercadoPagoCard: async (exp) => { assert.equal(exp.amountCents, 1000); if (failed) throw new Error('MP_SUBMISSION_UNCERTAIN'); return { method: 'card', status: 'approved' } } },
    '@/lib/payment-processing-server': { assertProductionPaymentReady: async () => {}, assertCardPaymentReady: async () => {}, paymentFailureCode: error => error.message, observeCheckoutPayment: async () => { context = { ...context, orderId: checkoutId } } },
    '@/lib/checkout-session-server-v2': { readCheckoutSessionV2: async () => ({ session: context, accessHash: 'b'.repeat(64) }), checkoutSessionErrorV2: error => error.message },
  })
  return { action, calls, requests }
}

test('card server action binds to saved checkout and persists only the payload HMAC', async () => {
  const { action, calls } = actionHarness()
  const result = await action.startCardPayment(checkoutId, attemptId, card)
  assert.equal(result.session.orderId, checkoutId)
  assert.deepEqual(calls.map(c => c.name), ['serenity_checkout_claim_card_v3'])
  assert.equal(JSON.stringify(calls).includes(token), false)
})

test('a pending Pix blocks a card attempt; unknown card response is saved as uncertain', async () => {
  const blocked = actionHarness({ blocking: true })
  const result = await blocked.action.startCardPayment(checkoutId, attemptId, card)
  assert.equal(result.session.orderId, null)
  assert.equal(blocked.calls.length, 0)
  const unknown = actionHarness({ failed: true })
  const uncertain = await unknown.action.startCardPayment(checkoutId, attemptId, card)
  assert.equal(uncertain.session.needsReview, true)
  assert.deepEqual(unknown.calls.map(c => c.name), ['serenity_checkout_claim_card_v3', 'serenity_checkout_pix_uncertain_v2'])
})

const session = () => ({
  id: checkoutId, state: 'pending', environment: 'production', pricingMode: 'retail', totalCents: 1000,
  shippingPending: false, reservedUntil: new Date(Date.now() + 35 * 60000).toISOString(),
  orderId: null, orderNumber: null, needsReview: false, testApproved: false, attempts: [],
})

test('choosing card never automatically generates Pix, while selecting Pix submits once', async () => {
  let generated = 0
  const saved = storage()
  const view = renderer('src/app/pagamento/[id]/PixCheckoutV2.tsx', {
    '@/components/analytics/GoogleAdsProvider': { GoogleAdsPurchase: () => null },
    'next/link': { default: 'Link' }, 'next/dynamic': { default: () => 'SecureCard' },
    '@/lib/cart': { useCartStore: () => () => {} },
    './actions-v2': { startPixV2: async () => { generated++; return { error: '', session: { ...session(), state: 'payment_pending', attempts: [{ id: attemptId, method: 'pix', state: 'pending', blocksNewAttempt: true }] } } }, refreshCheckoutPaymentV2: async () => ({ error: '' }) },
  }, { sessionStorage: saved, crypto: { randomUUID }, document: { visibilityState: 'visible' } })
  const props = { initial: session(), enabled: true, publicKey: 'APP_USR-fixture', cardReady: true }
  let tree = view.render(props); view.flush()
  assert.equal(generated, 0)
  nodes(tree, n => n.type === 'button' && n.props['aria-label'] === 'Cartão de crédito')[0].props.onClick()
  tree = view.render(props); view.flush()
  assert.equal(generated, 0)
  nodes(tree, n => n.type === 'button' && n.props.children === 'Alterar forma de pagamento')[0].props.onClick()
  tree = view.render(props); view.flush()
  nodes(tree, n => n.type === 'button' && n.props['aria-label'] === 'Pix')[0].props.onClick()
  view.render(props); view.flush()
  await new Promise(resolve => setImmediate(resolve))
  view.render(props); view.flush()
  assert.equal(generated, 1)
})

test('SDK form callbacks stay stable and a later definitive refusal gets a new attempt only on submit', async () => {
  const saved = storage(), submitted = []
  const view = renderer('src/app/pagamento/[id]/CardCheckout.tsx', {
    '@mercadopago/sdk-react': { CardPayment: 'SDKCard', StatusScreen: 'SDKStatus', initMercadoPago() {} },
    './card-actions': { startCardPayment: async (_id, id, input) => { submitted.push({ id, input }); return { error: '', session: session() } } },
  }, { sessionStorage: saved, crypto: { randomUUID }, window: {} })
  let props = { checkoutId, totalCents: 1000, publicKey: 'APP_USR-fixture', canPay: true, onSession() {}, onBusy() {}, onRefresh() {} }
  view.render(props); view.flush()
  let tree = view.render(props); view.flush()
  const first = nodes(tree, n => n.type === 'SDKCard')[0].props
  tree = view.render({ ...props, onSession() {} }); view.flush()
  const rerender = nodes(tree, n => n.type === 'SDKCard')[0].props
  assert.equal(first.initialization, rerender.initialization)
  assert.equal(first.onSubmit, rerender.onSubmit)
  const data = { token, issuer_id: '123', payment_method_id: 'visa', installments: 3, transaction_amount: 0.01, payer }
  await first.onSubmit(data)
  props = { ...props, attempt: { id: submitted[0].id, state: 'rejected', applicationState: 'applied', blocksNewAttempt: false } }
  tree = view.render(props); view.flush()
  const next = nodes(tree, n => n.type === 'SDKCard')[0].props
  await next.onSubmit({ ...data, token: 'b'.repeat(32) })
  assert.notEqual(submitted[0].id, submitted[1].id)
  assert.equal(submitted[0].input.transaction_amount, undefined)
  assert.equal(JSON.stringify([...saved.values.values()]).includes(token), false)
})

test('the same webhook processes credit-card approval through the card observer', async () => {
  const api = gateway(async (url) => response(url.endsWith('/users/me') ? { id: 456, site_id: 'MLB', tags: [] } : payment()))
  let observed
  const row = { id: attemptId, checkout_id: checkoutId, environment: 'production', merchant_id: '456', method: 'card', amount_cents: 1000 }
  const db = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
    rpc: async (name, params) => { observed = { name, params }; return { data: { state: 'approved', application_state: 'applied' } } },
  }
  const service = load('src/lib/payment-processing-server.ts', {
    '@supabase/supabase-js': {}, 'next/cache': { revalidatePath() {}, revalidateTag() {} },
    '@/lib/mercado-pago-server': api, '@/lib/mercado-pago-reconcile-server': {},
  }, env)
  await service.processPaymentNotification(db, '123')
  assert.equal(observed.name, 'serenity_checkout_observe_payment_v3')
  assert.equal(observed.params.p_observation.method, 'card')
  assert.equal(observed.params.p_observation.status, 'approved')
})

test('3DS renders in the official status component and only asks the server to refresh', () => {
  let requests = 0, refreshes = 0
  const view = renderer('src/app/pagamento/[id]/CardCheckout.tsx', {
    '@mercadopago/sdk-react': { CardPayment: 'SDKCard', StatusScreen: 'SDKStatus', initMercadoPago() {} },
    './card-actions': { startCardPayment: async () => { requests++; return { error: '' } } },
  })
  const props = {
    checkoutId, totalCents: 1000, publicKey: 'APP_USR-fixture', canPay: false,
    attempt: { id: attemptId, providerPaymentId: '123', method: 'card', state: 'pending', applicationState: 'pending', blocksNewAttempt: true,
      cardAuthentication: { externalResourceURL: 'https://issuer.example.com/challenge', creq: 'dGVzdA==' } },
    onSession() {}, onBusy() {}, onRefresh() { refreshes++ },
  }
  view.render(props); view.flush()
  const tree = view.render(props)
  assert.equal(nodes(tree, n => n.type === 'SDKCard').length, 0)
  const status = nodes(tree, n => n.type === 'SDKStatus')[0]
  assert.equal(status.props.initialization.additionalInfo.creq, 'dGVzdA==')
  status.props.onReady()
  assert.equal(refreshes, 1)
  assert.equal(requests, 0)
})


test('account-owned card charges require exact ownership, even with a checkout capability', async () => {
  for (const options of [{ userId: null }, { ownerId: '44444444-4444-4444-8444-444444444444' }]) {
    const { action, calls, requests } = actionHarness(options)
    const result = await action.startCardPayment(checkoutId, attemptId, card)
    assert.match(result.error, /CHECKOUT_(LOGIN_REQUIRED|ACCOUNT_MISMATCH)/)
    assert.equal(calls.length, 0)
    assert.equal(requests.length, 0)
  }
})


test('card refuses a stale quoted amount without claiming or submitting the token', async () => {
  const fixture = actionHarness({ priced: true })
  const result = await fixture.action.startCardPayment(checkoutId,attemptId,card,999)
  assert.match(result.error,/O valor mudou/)
  assert.equal(fixture.calls.length,0)
  assert.equal(fixture.requests.length,0)
})

test('guest card charge remains bound to its validated checkout capability, amount and provider idempotency',async()=>{
 const fixture=actionHarness({userId:null,ownerId:null})
 const result=await fixture.action.startCardPayment(checkoutId,attemptId,card)
 assert.equal(result.error,'');assert.equal(result.session.orderId,checkoutId)
 assert.equal(fixture.calls.filter(c=>c.name==='serenity_checkout_claim_card_v3').length,1)
})
