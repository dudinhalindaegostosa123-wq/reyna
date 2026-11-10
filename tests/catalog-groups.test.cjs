const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')

const rows = [
  { id: 'top', categories: ['Topo'], category_slugs: ['topo'], material: 'Titânio' },
  { id: 'chain', categories: ['Correntes'], category_slugs: ['correntes'], material: 'Ouro' },
  { id: 'both', categories: ['Topo', 'Correntes'], category_slugs: ['topo', 'correntes'], material: 'Titânio' },
  { id: 'pendant', categories: ['Pingentes'], category_slugs: ['pingentes'], material: 'Ouro' },
  { id: 'shaft', categories: ['Hastes e Conectores'], category_slugs: ['hastes-e-conectores'], material: 'Titânio' },
].map(row => ({ ...row, name: row.id, slug: row.id, tags: [], price: 100, in_stock: true, price_available: true, product_type: 'simple' }))

function catalog(wholesale = false) {
  const calls = []
  const api = load('src/lib/catalog-server.ts', {
    ...require('./helpers/commerce.cjs'),
    react: { cache: fn => fn },
    'next/cache': { unstable_cache: fn => fn },
    './data': { plainText: text => text },
    '@/lib/wholesale-server': { readWholesaleAccess: async () => ({ rules: wholesale ? { active: true, settings_version: 7 } : null }) },
  }, { SUPABASE_URL: 'https://fixture.example', SUPABASE_PUBLISHABLE_KEY: 'fixture-public', SUPABASE_SECRET_KEY: 'fixture-private' }, {
    fetch: async (url, options) => {
      const parsed = new URL(url), query = parsed.searchParams
      calls.push({ parsed, options })
      let data = rows
      const filter = query.get('category_slugs')
      if (filter?.startsWith('ov.{')) { const slugs = filter.slice(4, -1).split(','); data = data.filter(row => row.category_slugs.some(slug => slugs.includes(slug))) }
      if (filter === 'cs.{hastes-e-conectores}') data = data.filter(row => row.category_slugs.includes('hastes-e-conectores'))
      const material = query.get('material')
      if (material) data = data.filter(row => `eq.${row.material}` === material)
      const selected = query.get('id')
      if (selected) { const ids = selected.slice(4, -1).split(','); data = data.filter(row => ids.includes(row.id)) }
      const count = data.length
      data = data.slice(Number(query.get('offset') || 0), Number(query.get('offset') || 0) + Number(query.get('limit') || 500))
      if (parsed.pathname.endsWith('/serenity_wholesale_catalog')) data = data.map(row => ({ ...row, price: 50, wholesale_settings_version: 7, wholesale_enabled: true }))
      return new Response(JSON.stringify(data), { headers: { 'content-range': `0-${data.length - 1}/${count}` } })
    },
  })
  return { api, calls }
}

test('Topos includes both categories once and excludes unrelated shafts', async () => {
  const { api, calls } = catalog()
  const category = await api.getStoreCategory('topos-e-correntes')
  assert.equal(category.count, 3)
  assert.equal(category.name, 'Topos')
  assert.deepEqual(Array.from(category.materials), ['Ouro', 'Titânio'])
  const page = await api.getStorePage({ category: 'topos-e-correntes' })
  assert.deepEqual(Array.from(page.products, p => p.id), ['top', 'chain', 'both'])
  assert.equal(calls.at(-1).parsed.searchParams.get('category_slugs'), 'ov.{topo,correntes}')
})

test('Labret child pages preserve material filters, pagination and the separate shafts category', async () => {
  const { api, calls } = catalog()
  const page = await api.getStorePage({ category: 'topos-e-correntes', material: 'Titânio', perPage: 1, page: 2, sort: 'price-asc' })
  assert.equal(page.total, 2)
  assert.equal(page.page, 2)
  assert.equal(page.products[0].id, 'both')
  assert.equal(calls.at(-1).parsed.searchParams.get('order'), 'price.asc.nullslast,name.asc,database_id.asc')
  const shafts = await api.getStorePage({ category: 'hastes-e-conectores' })
  assert.deepEqual(Array.from(shafts.products, p => p.id), ['shaft'])
})

test('Grouped products retain the authenticated wholesale price path', async () => {
  const { api, calls } = catalog(true)
  const page = await api.getStorePage({ category: 'topos-e-correntes' })
  assert.equal(page.products[0].price, 50)
  const request = calls.at(-1)
  assert.equal(request.parsed.pathname, '/rest/v1/serenity_wholesale_catalog')
  assert.equal(request.options.cache, 'no-store')
  assert.equal(request.parsed.searchParams.get('category_slugs'), 'ov.{topo,correntes}')
})


test('Color selections intersect filters before counting and paging, including wholesale prices', async () => {
  const { api, calls } = catalog(true)
  const page = await api.getStorePage({ productIds: ['top', 'both', 'chain'], material: 'Titânio', page: 2, perPage: 1, sort: 'price-desc' })
  assert.equal(page.total, 2)
  assert.equal(page.products[0].id, 'both')
  assert.equal(page.products[0].price, 50)
  assert.equal(calls.at(-1).parsed.searchParams.get('id'), 'in.(top,both,chain)')
  assert.equal(calls.at(-1).parsed.pathname, '/rest/v1/serenity_wholesale_catalog')
  const count = calls.length
  assert.equal((await api.getStorePage({ productIds: [] })).total, 0)
  assert.equal(calls.length, count)
})


test('Correntes e pingentes joins the correct categories without mixing in unrelated tops', async () => {
  const { api,calls } = catalog()
  const category = await api.getStoreCategory('correntes-e-pingentes')
  assert.equal(category.name,'Correntes e pingentes')
  assert.equal(category.count,3)
  const page = await api.getStorePage({ category: 'correntes-e-pingentes' })
  assert.deepEqual(Array.from(page.products, product => product.id),['chain','both','pendant'])
  assert.equal(calls.at(-1).parsed.searchParams.get('category_slugs'),'ov.{correntes,pingentes,pingente}')
})

test('labret search includes legacy top names without changing SKU or category URLs',async()=>{
 const {api,calls}=catalog()
 await api.getStorePage({search:'labret estrela'})
 const query=calls.at(-1).parsed.searchParams
 assert.equal(query.get('or'),'(search_text.like.*labret*,search_text.like.*topo*)')
 assert.ok(query.getAll('search_text').includes('like.*estrela*'))
})

test('coated-titanium material filter accepts old and 24K labels without merging solid-gold materials',async()=>{
 const {api,calls}=catalog()
 for(const material of ['Titânio Revestido de Ouro 18K','Titânio Revestido de Ouro 24K']){
  await api.getStorePage({category:'topos-e-correntes',material})
  const filter=calls.at(-1).parsed.searchParams.get('material')
  assert.match(filter,/18K/);assert.match(filter,/24K/);assert.ok(filter.startsWith('in.('))
 }
 await api.getStorePage({category:'topos-e-correntes',material:'Ouro 18K'})
 assert.equal(calls.at(-1).parsed.searchParams.get('material'),'eq.Ouro 18K')
})
