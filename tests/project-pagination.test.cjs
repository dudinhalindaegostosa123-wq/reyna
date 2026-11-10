const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const { renderer, nodes } = require('./helpers/render.cjs')
const ear = load('src/lib/ear-project.ts')

function catalog(wholesale = false) {
  const calls = []
  const rows = Array.from({ length: 29 }, (_, i) => ({ id: String(i + 1), slug: `joia-${i + 1}`, name: `Joia ${i + 1}`,
    price: 10, storage_path: `foto-${i + 1}.webp`, product_type: 'simple', wholesale_enabled: true, wholesale_settings_version: 7 }))
  const server = load('src/lib/catalog-server.ts', {
    ...require('./helpers/commerce.cjs'),
    react: { cache: fn => fn }, 'next/cache': { unstable_cache: fn => fn }, './data': {},
    '@/lib/wholesale-server': { readWholesaleAccess: async () => ({ rules: wholesale ? { active: true, settings_version: 7 } : null }) },
  }, { SUPABASE_URL: 'https://fixture.example', SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SECRET_KEY: 'private' }, {
    fetch: async (url, options) => {
      const parsed = new URL(url)
      calls.push({ url: parsed, options })
      const offset = Number(parsed.searchParams.get('offset'))
      const limit = Number(parsed.searchParams.get('limit'))
      const result = rows.slice(offset, offset + limit).map(row => ({ ...row, price: wholesale ? 5 : row.price }))
      return new Response(JSON.stringify(result), { headers: { 'content-range': `*/${rows.length}` } })
    },
  })
  return { server, calls }
}

test('suggestions paginate exact counts without duplicates and clamp outdated page numbers', async () => {
  const { server, calls } = catalog()
  const filters = new URLSearchParams({ and: '(or(category_slugs.cs.{conch}),or(name.ilike.*topo*))', order: 'featured.desc,created_at.desc,database_id.asc' })
  const first = await server.getProjectSuggestionPage(filters, 1)
  const second = await server.getProjectSuggestionPage(filters, 2)
  const last = await server.getProjectSuggestionPage(filters, 999)
  assert.equal(first.total, 29)
  assert.equal(first.totalPages, 3)
  assert.equal(first.products.length, 12)
  assert.equal(second.products[0].id, '13')
  assert.equal(last.page, 3)
  assert.equal(last.products.length, 5)
  assert.equal(new Set([...first.products, ...second.products, ...last.products].map(product => product.id)).size, 29)
  assert.ok(calls.every(call => call.url.searchParams.get('and') === filters.get('and')))
  assert.ok(calls.every(call => call.url.searchParams.get('order') === filters.get('order')))
})

test('paginated suggestions preserve authenticated wholesale prices and bypass shared caching', async () => {
  const { server, calls } = catalog(true)
  const result = await server.getProjectSuggestionPage(new URLSearchParams(), 2)
  assert.equal(result.products[0].price, 5)
  assert.ok(calls.every(call => call.url.pathname === '/rest/v1/serenity_wholesale_catalog' && call.options.cache === 'no-store'))
})

test('API validates page input, preserves preferences and disables shared response caching', async () => {
  const calls = []
  const route = load('src/app/api/projeto-auricular/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, ...options }) } },
    '@/lib/ear-project': ear,
    '@/lib/catalog-server': { getProjectSuggestionPage: async (query, page) => { calls.push({ query, page }); return { products: [], page, total: 29, totalPages: 3 } } },
  })
  const response = await route.GET({ nextUrl: new URL(`https://fixture.example${ear.suggestionUrl('conch', { ...ear.newChoice(), color: 'dourado', type: 'topo' }, 2)}`) })
  assert.equal(calls[0].page, 2)
  assert.match(calls[0].query.get('and'), /category_slugs.cs.\{conch\}/)
  assert.match(calls[0].query.get('and'), /name.ilike.\*ouro\*/)
  assert.match(calls[0].query.get('and'), /name.ilike.\*topo\*/)
  assert.equal(response.headers['Cache-Control'], 'private, no-store')
  for (const page of ['-1', '0', '1.5', 'nope', '100001']) {
    const result = await route.GET({ nextUrl: new URL(`https://fixture.example/api/projeto-auricular?region=conch&page=${page}`) })
    assert.equal(result.status, 400)
  }
  assert.equal(calls.length, 1)
})

test('pagination exposes numbered pages and correct previous/next boundaries', () => {
  const calls = []
  const view = renderer('src/app/projeto-auricular/ProjectPagination.tsx', {})
  assert.equal(view.render({ page: 1, totalPages: 1, total: 10, onChange() {} }), null)
  let tree = view.render({ page: 1, totalPages: 3, total: 29, onChange: page => calls.push(page) })
  let buttons = nodes(tree, node => node.type === 'button')
  assert.equal(buttons[0].props.disabled, true)
  buttons.find(button => button.props['aria-label'] === 'Página 2').props.onClick()
  assert.deepEqual(calls, [2])
  tree = view.render({ page: 3, totalPages: 3, total: 29, onChange: page => calls.push(page) })
  buttons = nodes(tree, node => node.type === 'button')
  assert.equal(buttons.at(-1).props.disabled, true)
  assert.equal(buttons.find(button => button.props['aria-label'] === 'Página 3').props['aria-current'], 'page')
})
