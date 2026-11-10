const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')

const id = '11111111-1111-4111-8111-111111111111'

test('new product page authenticates and passes serializable classification data to the editor', async () => {
  const labels = Object.create(null)
  labels.Topo = 'Topos'
  labels.__proto__ = 'Categoria especial'
  const options = { categoryLabels: labels, groups: [{ label: 'Joias', categories: ['Topo'] }], materials: ['Titânio'], tags: [] }
  const calls = []
  const db = { fixture: true }
  const jsx = (type, props) => ({ type, props })
  const page = load('src/app/admin/produtos/novo/page.tsx', {
    'node:crypto': { randomUUID: () => id },
    'next/link': { default: 'Link' },
    '@/lib/admin-auth': { adminDatabase: async () => { calls.push('authenticate'); return { db } } },
    '@/lib/admin-classification': { getAdminClassification: async client => { assert.equal(client, db); calls.push('classification'); return options } },
    '@/lib/admin-unified': { emptyProduct: productId => ({ id: productId, name: '', status: 'draft' }) },
    '../[id]/UnifiedProductEditor': { default: 'Editor' },
    'react/jsx-runtime': { jsx, jsxs: jsx },
  }, { SUPABASE_URL: 'https://fixture.example' })
  const tree = await page.default()
  const editor = tree.props.children.find(child => child.type === 'Editor')
  assert.deepEqual(calls, ['authenticate', 'classification'])
  assert.equal(page.dynamic, 'force-dynamic')
  assert.equal(editor.props.isNew, true)
  assert.equal(editor.props.bundle.product.id, id)
  assert.equal(editor.props.bundle.product.status, 'draft')
  assert.equal(editor.props.options.categoryLabels.Topo, 'Topos')
  assert.equal(editor.props.options.categoryLabels.__proto__, 'Categoria especial')
  assert.notEqual(Object.getPrototypeOf(editor.props.options.categoryLabels), null)
  assert.equal(Object.getPrototypeOf(labels), null)
  assert.equal(editor.props.storageUrl, 'https://fixture.example')
  assert.doesNotThrow(() => JSON.stringify(editor.props))
})
