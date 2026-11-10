const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const data = load('src/lib/data.ts')
const { projectCart, projectTotal } = load('src/lib/ready-project.ts', { './data': data })
const product = (extra = {}) => ({ id: '17', slug: 'joia', name: 'Joia', price: 10.25, priceAvailable: true,
  inStock: true, stock: 3, images: ['foto'], ...extra })
const piece = (p = product(), quantity = 1, variationId = '') => ({ product: p, quantity, variationId })

test('project uses exact variations, quantities and current prices in cents', () => {
  const variable = product({ id: '20', variations: [{ id: '8901', name: 'Azul 1.2', price: 18.13, priceAvailable: true, inStock: true, stock: 4 }] })
  assert.equal(projectTotal([piece(), piece(variable, 2, '8901')]), 46.51)
  const items = projectCart([], [piece(), piece(variable, 2, '8901')])
  assert.equal(items.length, 2)
  assert.equal(items[1].variationId, '8901')
  assert.equal(items[1].variants['Variação'], 'Azul 1.2')
  assert.equal(items[1].quantity, 2)
  // Wholesale prices are supplied by the existing catalog; never apply a second discount.
  assert.equal(projectTotal([piece(product({ price: 5.13 }), 2)]), 10.26)
})

test('unavailable final piece prevents the entire addition without changing existing cart', () => {
  const existing = projectCart([], [piece()])
  const before = JSON.stringify(existing)
  assert.equal(projectCart(existing, [piece(), piece(product({ id: '90', inStock: false }))]), null)
  assert.equal(JSON.stringify(existing), before)
  assert.equal(projectCart(existing, [piece(product(), 3)]), null)
  assert.equal(JSON.stringify(existing), before)
})

test('merge respects total stock including anodized pieces and duplicates', () => {
  const existing = projectCart([], [piece()])
  const next = projectCart(existing, [piece(product(), 2)])
  assert.equal(next.length, 1)
  assert.equal(next[0].quantity, 3)
  assert.equal(existing[0].quantity, 1)
  assert.equal(projectCart([], [piece(product(), 2), piece(product(), 2)]), null)
  const anodized = [{ ...existing[0], variantKey: 'anodized', anodization: { code: '28' } }]
  assert.equal(projectCart(anodized, [piece(product(), 3)]), null)
})

test('missing variation or price blocks purchase and never invents a total', () => {
  const p = product({ variations: [] })
  assert.equal(projectTotal([piece(p, 1, 'removed')]), null)
  assert.equal(projectCart([], [piece(p, 1, 'removed')]), null)
  assert.equal(projectCart([], [piece(product({ priceAvailable: false }))]), null)
  assert.equal(projectTotal([piece(product({ priceAvailable: false }))]), null)
  assert.equal(projectCart([], []), null)
  assert.equal(projectCart([], [piece(product(), 1.5)]), null)
})
