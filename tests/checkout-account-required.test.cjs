const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const id = '11111111-1111-4111-8111-111111111111'
const attempt = '22222222-2222-4222-8222-222222222222'
const owner = '33333333-3333-4333-8333-333333333333'

function pix({ userId = owner, ownerId = owner, pending = false, priced = false } = {}) {
  let financialCalls = 0
  const session = { id, state: 'pending', environment: 'production', totalCents: 1000, shippingPending: false, needsReview: false, reservedUntil: new Date(Date.now() + 600000).toISOString(), attempts: pending ? [{ blocksNewAttempt: true, method: 'pix', state: 'pending' }] : [] }
  if (priced) session.paymentOptions = { selectedMethod: 'pix' }
  const api = load('src/app/pagamento/[id]/actions-v2.ts', {
    '@/lib/guest-checkout':load('src/lib/guest-checkout.ts',{'./wholesale-server':{readWholesaleAccess:async()=>({userId,rules:null})}}),
    '@/lib/payment-processing-server': { assertProductionPaymentReady: async () => {} },
    '@/lib/checkout-server': { checkoutDatabase: async () => ({
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { account_user_id: ownerId, customer_snapshot: {} } }) }) }) }),
      rpc: async () => { financialCalls++; throw new Error('must not claim') },
    }) },
    '@/lib/checkout-document': {},
    '@/lib/mercado-pago-server': { mercadoPagoPublicConfig: () => ({ environment: 'production' }), mercadoPagoMerchant: async () => { financialCalls++; throw new Error('must not contact gateway') } },
    '@/lib/mercado-pago-pix-server': {}, '@/lib/mercado-pago-reconcile-server': {},
    '@/lib/checkout-session-server-v2': { readCheckoutSessionV2: async () => ({ session, accessHash: 'fixture' }), checkoutSessionErrorV2: e => e.message },
  })
  return { api, calls: () => financialCalls }
}

test('account-owned Pix requires its authenticated owner; a foreign session cannot claim or charge', async () => {
  for (const settings of [{ userId: null }, { ownerId: id }]) {
    const fixture = pix(settings)
    const result = await fixture.api.startPixV2(id, attempt)
    assert.match(result.error, /CHECKOUT_(LOGIN_REQUIRED|ACCOUNT_MISMATCH)/)
    assert.equal(fixture.calls(), 0)
  }
})

test('existing pending payment remains queryable without triggering a new Pix', async () => {
  const fixture = pix({ userId: null, ownerId: null, pending: true })
  const result = await fixture.api.startPixV2(id, attempt)
  assert.equal(result.error, '')
  assert.equal(result.session.attempts.length, 1)
  assert.equal(fixture.calls(), 0)
})

function registration(immediateSession) {
  const written = [], signups = []
  const auth = {
    auth: {
      signUp: async input => { signups.push(input); return { data: { session: immediateSession ? {} : null } } },
      getUser: async () => ({ data: { user: { id: owner, email: 'fixture@example.com', email_confirmed_at: '2026-10-22' } } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { customer_id: owner } }) }) }) }),
  }
  const api = load('src/app/minha-conta/cadastrar/actions.ts', {
    '@supabase/supabase-js': {}, 'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect: url => { throw new Error(`REDIRECT:${url}`) } },
    'next/headers': { cookies: () => ({ set: (...args) => written.push(args) }) },
    '@/lib/customer-auth': { customerAuth: () => auth },
    '@/lib/checkout-document': { normalizeCheckoutDocument: value => value },
  }, { NODE_ENV: 'production', SERENITY_SITE_URL: 'https://store.example' })
  const form = new FormData()
  for (const [key, value] of Object.entries({ name: 'Fixture Customer', phone: '11999999999', document: '12345678901', account_type: 'retail', email: 'fixture@example.com', password: 'fixture-password', password_confirmation: 'fixture-password', return_to: '/checkout' })) form.set(key, value)
  return { api, written, signups, form }
}

test('registration preserves checkout intent for email confirmation without changing the allowed callback URL', async () => {
  const fixture = registration(false)
  const result = await fixture.api.registerCustomer({ error: '' }, fixture.form)
  assert.equal(result.success, true)
  assert.equal(fixture.signups[0].options.emailRedirectTo, 'https://store.example/minha-conta/confirmar')
  assert.equal(fixture.written[0][0], 'serenity-auth-return')
  assert.equal(fixture.written[0][1], 'checkout')
  assert.equal(fixture.written[0][2].httpOnly, true)
  assert.equal(fixture.written[0][2].secure, true)
})

test('registration with an immediate confirmed session returns to checkout and clears the intent cookie', async () => {
  const fixture = registration(true)
  await assert.rejects(fixture.api.registerCustomer({ error: '' }, fixture.form), /REDIRECT:\/checkout/)
  assert.equal(fixture.written.at(-1)[2].maxAge, 0)
})

test('email callback accepts only checkout intent, clears it and preserves the return path on failure', async () => {
  for (const [intent, valid, expected] of [['checkout', true, '/checkout'], ['https://outside.example', true, '/minha-conta'], ['checkout', false, '/minha-conta/entrar?aviso=confirmacao-invalida&retorno=checkout']]) {
    let cleared = false
    const route = load('src/app/minha-conta/confirmar/route.ts', {
      'next/server': { NextResponse: { redirect: url => ({ url, headers: new Headers(), cookies: { set: (_name, _value, opts) => { cleared = opts.maxAge === 0 } } }) } },
      'next/headers': { cookies: () => ({ get: () => ({ value: intent }) }) },
      '@/lib/customer-auth': { customerAuth: () => ({ auth: { exchangeCodeForSession: async () => ({ data: { user: valid ? { email_confirmed_at: '2026-10-22' } : null } }) } }) },
      '../cadastrar/actions': { completeCustomerRegistration: async () => ({ error: '' }) },
    })
    const response = await route.GET(new Request('https://store.example/minha-conta/confirmar?code=fixture'))
    assert.equal(response.url.pathname + response.url.search, expected)
    assert.equal(response.url.origin, 'https://store.example')
    assert.equal(cleared, true)
  }
})


test('Pix refuses stale or missing price confirmation before claiming a payment', async () => {
  for (const expected of [undefined, 999, 1001]) {
    const fixture = pix({ priced: true })
    const result = await fixture.api.startPixV2(id,attempt,expected)
    assert.match(result.error,/O valor mudou/)
    assert.equal(fixture.calls(),0)
  }
})

test('changing the payment method requires the authenticated checkout owner', async () => {
  const fixture = pix({ ownerId: id })
  const result = await fixture.api.selectPaymentMethodV4(id,'pix')
  assert.match(result.error,/CHECKOUT_ACCOUNT_MISMATCH/)
  assert.equal(fixture.calls(),0)
})
