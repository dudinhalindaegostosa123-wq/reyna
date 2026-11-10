const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const { legacyPurchaseDate, legacyOrderAddresses } = load('src/lib/legacy-order-display.ts')

test('historical purchase date uses the original timestamp in São Paulo and handles missing dates', () => {
  assert.equal(legacyPurchaseDate('2025-01-02T01:30:00+00:00'), '01/01/2025, 22:30')
  for (const value of [null, undefined, '', 'NULL', 'bad date']) {
    assert.equal(legacyPurchaseDate(value), 'Data não informada no site antigo')
  }
})

test('historical shipping and billing addresses stay separate with no fabricated fallback', () => {
  const [shipping, billing] = legacyOrderAddresses({
    primeiro_nome: 'Ana', endereco: 'Rua de cobrança, 12', cidade: 'São Paulo', estado: 'SP', cep: '01000-000',
    entrega_primeiro_nome: 'Bia', entrega_endereco: 'Rua de entrega, 34', entrega_complemento: 'Apto 5',
    entrega_cidade: 'Campinas', entrega_estado: 'SP', entrega_cep: '13000-000', entrega_pais: 'BR',
  })
  assert.ok(shipping.lines.includes('Rua de entrega, 34'))
  assert.ok(shipping.lines.includes('Apto 5'))
  assert.ok(shipping.lines.includes('Campinas — SP'))
  assert.ok(billing.lines.includes('Rua de cobrança, 12'))
  assert.ok(!shipping.lines.includes('Rua de cobrança, 12'))
  assert.equal(legacyOrderAddresses({ primeiro_nome: 'Ana', entrega_endereco: 'NULL', entrega_pais: 'BR' })[0].lines.length, 0)
  assert.ok(legacyOrderAddresses(null).every(a => a.lines.length === 0))
})
