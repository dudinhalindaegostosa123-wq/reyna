const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { load } = require('./helpers/load.cjs')
const shipping = load('src/lib/shipping.ts')
const gateway = load('src/lib/melhor-envio.ts')

test('delivery estimate adds four days only to valid carrier estimates', () => {
  assert.equal(shipping.deliveryEstimateDays(2), 6)
  assert.equal(shipping.deliveryEstimateDays(0), 4)
  assert.equal(shipping.deliveryEstimateDays(10), 14)
  for (const input of [null, -1, 2.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.equal(shipping.deliveryEstimateDays(input), null)
  }
})

function checkout({ manual = false, raw } = {}) {
  const saved = []
  const settings = { enabled: !manual, max_units: 10, manual_slugs: [], weight_g: 500, height: 2, width: 12, length: 17, origin: '18072000', version: 1 }
  let requests = 0
  const db = { from: table => {
    if (table === 'serenity_shipping_settings') return { select: () => ({ eq: () => ({ single: async () => ({ data: settings }) }) }) }
    assert.equal(table, 'serenity_shipping_quotes')
    return { delete: () => ({ lt: async () => ({ error: null }) }), insert: async rows => { saved.push(...rows); return { error: null } } }
  } }
  const api = load('src/lib/shipping-server.ts', {
    ...require('./helpers/commerce.cjs'),
    'node:crypto': { randomUUID }, '@/lib/checkout-server': { checkoutHash: () => 'fixture' },
    '@/lib/shipping': shipping,
    '@/lib/melhor-envio': { readQuotes: gateway.readQuotes, melhorEnvio: async () => { requests++; return raw } },
  })
  return { saved, requests: () => requests, run: () => api.deliveryOptions(db, [{ slug: 'fixture', quantity: 1, variant: '', color: '' }], randomUUID(), '18072000', { total_cents: 10000 }) }
}

test('checkout returns and stores the total lead time once, preserving freight prices and raw carrier data', async () => {
  const raw = [
    { id: 1, name: 'Expresso', price: '13.33', delivery_time: 2, company: { name: 'Transportadora' } },
    { id: 2, name: 'Econômico', price: '20.00', delivery_time: 10, company: { name: 'Transportadora' } },
    { id: 3, name: 'Sem prazo', price: '30.00', delivery_time: null, company: { name: 'Transportadora' } },
  ]
  const quote = checkout({ raw })
  for (let i = 0; i < 2; i++) {
    const result = await quote.run()
    assert.deepEqual(Array.from(result.options, o => o.days), [6, 14, null])
    assert.deepEqual(Array.from(result.options, o => o.amount_cents), [1333, 2000, 3000])
    assert.match(result.message, /confirmação do pagamento/)
  }
  assert.equal(quote.saved[0].snapshot.days, 6)
  assert.equal(quote.saved[0].snapshot.preparation_days, 4)
  assert.equal(quote.saved[0].snapshot.provider.delivery_time, 2)
  assert.equal(raw[0].delivery_time, 2)
})

test('manual freight keeps its unknown estimate and never contacts the carrier', async () => {
  const quote = checkout({ manual: true })
  const result = await quote.run()
  assert.equal(result.options[0].manual, true)
  assert.equal(result.options[0].days, null)
  assert.equal(quote.saved[0].snapshot.preparation_days, undefined)
  assert.equal(quote.requests(), 0)
})
