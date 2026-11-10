const assert = require('node:assert/strict')
const { test } = require('node:test')
const { load } = require('./helpers/load.cjs')

const orderId = '12345678-1234-1234-1234-123456789abc'
const paid = () => ({
  environment: 'production', state: 'converted', orderId,
  totalCents: 12345, needsReview: false, testApproved: false, shippingPending: false,
  attempts: [{ state: 'approved', applicationState: 'applied' }],
})
function setup(options = {}) {
  const stored = new Map()
  const window = {
    localStorage: {
      getItem(key) { if (options.blockStorage) throw Error('denied'); return stored.get(key) },
      setItem(key, value) { if (options.blockStorage) throw Error('denied'); stored.set(key, value) },
    },
  }
  const fresh = () => load('src/lib/google-ads.ts', {}, {}, { window })
  return { api: fresh(), fresh, window, stored }
}

test('approved production order sends actual BRL total and order ID', () => {
  const { api } = setup()
  const event = api.purchaseConversion(paid())
  assert.equal(event.send_to, 'AW-11257948716/_htiCIPG0fgbEKzUmvgp')
  assert.equal(event.value, 123.45)
  assert.equal(event.currency, 'BRL')
  assert.equal(event.transaction_id, orderId)
})
test('pending, test, review, unpaid and invalid orders never convert', () => {
  const { api } = setup()
  for (const patch of [
    { environment: 'test' }, { state: 'pending' }, { state: 'payment_pending' },
    { orderId: null }, { orderId: 'invalid' }, { needsReview: true },
    { testApproved: true }, { shippingPending: true }, { totalCents: 0 },
    { totalCents: -1 }, { totalCents: 1.1 }, { totalCents: NaN },
    { attempts: [] }, { attempts: [{ state: 'approved', applicationState: 'review' }] },
    { attempts: [{ state: 'pending', applicationState: 'applied' }] },
    { attempts: [...paid().attempts, { state: 'refunded', applicationState: 'applied' }] },
    { attempts: [...paid().attempts, { state: 'charged_back', applicationState: 'applied' }] },
  ]) assert.equal(api.purchaseConversion({ ...paid(), ...patch }), null, JSON.stringify(patch))
})
test('Pix pending to approved sends one conversion, without requiring a click', () => {
  const { api, window } = setup()
  assert.equal(api.trackPurchaseConversion({ ...paid(), state: 'payment_pending', orderId: null }), false)
  assert.equal(window.dataLayer, undefined)
  assert.equal(api.trackPurchaseConversion(paid()), true)
  assert.equal(api.trackPurchaseConversion(paid()), false)
  const messages = window.dataLayer.map(args => Array.from(args))
  assert.equal(messages[0][0], 'js')
  assert.equal(messages[1][0], 'config')
  assert.equal(messages[2][0], 'event')
  assert.equal(messages[2][1], 'conversion')
})
test('persistent order key prevents repeats after module reload', () => {
  const { api, fresh } = setup()
  assert.equal(api.trackPurchaseConversion(paid()), true)
  assert.equal(fresh().trackPurchaseConversion(paid()), false)
})
test('blocked storage does not break payment or repeat in same mount', () => {
  const { api } = setup({ blockStorage: true })
  assert.equal(api.trackPurchaseConversion(paid()), true)
  assert.equal(api.trackPurchaseConversion(paid()), false)
})
test('existing tag queue is preserved and initialization happens once', () => {
  const { api, window } = setup()
  window.dataLayer = ['existing']
  api.initializeGoogleAds()
  api.initializeGoogleAds()
  assert.equal(window.dataLayer[0], 'existing')
  assert.equal(window.dataLayer.length, 3)
})
test('advertising error does not throw and permits retry', () => {
  const { api, window } = setup()
  window.gtag = () => { throw Error('blocked') }
  assert.equal(api.trackPurchaseConversion(paid()), false)
  delete window.gtag
  assert.equal(api.trackPurchaseConversion(paid()), true)
})
test('server execution never sends events', () => {
  const api = load('src/lib/google-ads.ts')
  assert.equal(api.trackPurchaseConversion(paid()), false)
})
test('provider disables preview tracking and supports paid session updates', () => {
  let enabled = false
  let pathname = '/'
  let sends = 0
  let initializes = 0
  const effects = []
  const jsx = (type, props) => ({ type, props })
  const components = load('src/components/analytics/GoogleAdsProvider.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react': {
      createContext: () => ({ Provider: 'provider' }),
      useContext: () => enabled,
      useEffect: effect => effects.push(effect),
    },
    './CommerceAnalytics':{default:'CommerceAnalytics'},
    'next/script': { default: 'script' },
    'next/navigation':{usePathname:()=>pathname},
    '@/lib/google-ads': {
      GOOGLE_ADS_ID: 'AW-11257948716',
      initializeGoogleAds: () => initializes++,
      trackPurchaseConversion: session => { if (session.state === 'converted') sends++ },
    },
  })
  pathname='/acompanhar'
  const privatePage=components.default({enabled:true,children:'tracking'})
  assert.equal(privatePage.props.children[0],false)
  effects.splice(0).forEach(effect=>effect())
  assert.equal(initializes,0)
  pathname='/'
  const disabled = components.default({ enabled: false, children: 'checkout' })
  components.GoogleAdsPurchase({ session: paid() })
  effects.splice(0).forEach(effect => effect())
  assert.equal(disabled.props.children[0], false)
  assert.equal(initializes, 0)
  assert.equal(sends, 0)
  enabled = true
  components.default({ enabled: true, children: 'checkout' })
  components.GoogleAdsPurchase({ session: { ...paid(), state: 'payment_pending' } })
  effects.splice(0).forEach(effect => effect())
  assert.equal(initializes, 1)
  assert.equal(sends, 0)
  components.GoogleAdsPurchase({ session: paid() })
  effects.splice(0).forEach(effect => effect())
  assert.equal(sends, 1)
})
