const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const { renderer, nodes } = require('./helpers/render.cjs')

test('campaign is hidden before SQL installation, when paused, and from wholesale accounts', async () => {
  const fixture = (enabled, wholesale, status = 200) => load('src/lib/collection-server.ts', {
    './wholesale-server': { readWholesaleAccess: async () => ({ rules: { active: wholesale } }) },
  }, { SUPABASE_URL: 'https://fixture.example', SUPABASE_PUBLISHABLE_KEY: 'public' }, {
    fetch: async () => new Response(status === 200 ? JSON.stringify([{ enabled }]) : '', { status }),
  })
  assert.equal(await fixture(true,false).showCollectionCampaign(),true)
  assert.equal(await fixture(true,true).showCollectionCampaign(),false)
  assert.equal(await fixture(false,false).showCollectionCampaign(),false)
  assert.equal(await fixture(false,false,404).showCollectionCampaign(),false)
})

test('cart progress uses the authoritative quote, hides for wholesale, and shows the next threshold', () => {
  const view = renderer('src/components/cart/CollectionProgress.tsx', { '@/lib/collection-progress': load('src/lib/collection-progress.ts'), '@/lib/data': { formatPrice: price => String(price) } })
  const text = tree => JSON.stringify(tree)
  assert.equal(view.render({ quote: null }),null)
  const quote = { pricing_mode: 'retail', progressive: { quantity: 2, percent: 5, discount_cents: 1000 } }
  assert.match(text(view.render({ quote })), /Falta 1 joia para alcançar 7%/)
  const full = view.render({ quote: { ...quote, progressive: { quantity: 7, percent: 15, discount_cents: 10500 } } })
  assert.equal(nodes(full, node => node.props.role === 'progressbar')[0].props['aria-valuenow'],5)
  assert.match(text(full), /Parabéns! Você alcançou 15%, o limite máximo/)
  assert.equal(view.render({ quote: { ...quote, pricing_mode: 'wholesale' } }),null)
})

function actions(wholesale = false) {
  const calls = [], deliveries = []
  const base = { items: [], total_cents: 20000, total: 200 }
  const progressive = { ...base, total_cents: 18000, total: 180, subtotal_cents: 20000, discount_cents: 2000, progressive: { percent: 10 } }
  const db = { rpc: async (name,args) => { calls.push({ name,args }); return { data: name === 'serenity_checkout_coupon_quote_v2' ? progressive : base } } }
  const api = load('src/app/checkout/actions.ts', {
    '@/lib/checkout-document': { normalizeCheckoutDocument: value => value }, '@/lib/coupon-ui': { normalizeCouponCode: value => value },
    '@/lib/wholesale-server': { readWholesaleAccess: async () => ({ userId: 'user', rules: { active: wholesale } }), wholesaleError: () => '' },
    '@/lib/guest-checkout':{optionalCheckoutAccess:async()=>({userId:'user',rules:{active:wholesale}})},
    '@/lib/checkout-server': { checkoutDatabase: async () => db, checkoutHash: value => value, checkoutError: () => '' },
    '@/lib/checkout': { validateCheckoutLines: value => value },
    '@/lib/shipping-server': { deliveryError: () => '', deliveryOptions: async (...args) => { deliveries.push(args); return { options: [] } } },
  })
  return { api,calls,deliveries }
}

test('retail review and freight agree on the progressive total while shipping keeps its undiscounted validation basis', async () => {
  const { api,calls,deliveries } = actions()
  const items = [{ slug: 'joia', quantity: 2, variant: '', color: '' }]
  const review = await api.reviewCheckout(items)
  assert.equal(review.quote.total_cents,18000)
  assert.equal(calls[0].name,'serenity_checkout_coupon_quote_v2')
  const shipping = await api.quoteCheckoutShipping({ items,requestId: '12345678-1234-1234-1234-123456789012',cep: '18072000' })
  assert.equal(shipping.quote.total_cents,18000)
  assert.equal(deliveries[0][4].total_cents,20000)
})

test('wholesale review never invokes progressive/coupon pricing', async () => {
  const { api,calls } = actions(true)
  await api.reviewCheckout([{ slug: 'joia',quantity:4,variant:'',color:'' }])
  assert.equal(calls.length,1)
  assert.equal(calls[0].name,'serenity_wholesale_stock_review_v2')
})
test('cart banner visibly presents all tiers and celebrates the maximum using the authoritative eligible quantity',()=>{
 const view=renderer('src/components/cart/CollectionProgress.tsx',{'@/lib/collection-progress':load('src/lib/collection-progress.ts'),'@/lib/data':{formatPrice:value=>String(value)}})
 const tree=view.render({compact:true,quote:{pricing_mode:'retail',progressive:{quantity:5,percent:15,discount_cents:15000}}})
 const status=nodes(tree,n=>n.props.role==='status')[0]
 assert.match(status.props.children,/Parabéns!.*15%.*limite máximo/)
 assert.match(status.props.className,/text-base/)
 assert.match(JSON.stringify(tree),/Ouro 18K e Bioflex não participam/)
 assert.equal(nodes(tree,n=>n.type==='div' && String(n.props.className).includes('rounded-xl border p-3')).length,4)
})
