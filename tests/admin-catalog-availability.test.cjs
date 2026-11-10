const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const { renderer, nodes } = require('./helpers/render.cjs')

test('inventory distinguishes an absent view from permission and connection failures', async () => {
  const { getAdminInventory } = load('src/lib/admin-inventory.ts')
  for (const code of ['PGRST205', '42P01', '42501', '08006']) {
    const db = { from: () => ({ select: () => ({ in: async () => ({ error: { code } }) }) }) }
    await assert.rejects(getAdminInventory(db, ['product']), {
      message: ['PGRST205', '42P01'].includes(code) ? 'ADMIN_INVENTORY_NOT_INSTALLED' : 'ADMIN_INVENTORY_QUERY',
    })
  }
})

function catalog(inventoryError, queryError = null, statisticsError = queryError) {
  const product = { id: 'product', name: 'Argola Lunarity', status: 'published', regular_price: 39 }
  const chain = { select() { return chain }, eq() { return chain }, order() { return chain },
    range: async () => ({ data: [product], count: 1, error: queryError }),
    then(resolve) { return Promise.resolve({ count: 1, error: statisticsError }).then(resolve) } }
  return renderer('src/app/admin/produtos/page.tsx', {
    'next/link': { default: 'Link' },
    'next/navigation': { redirect() { throw new Error('Unexpected redirect') } },
    '@/lib/admin-auth': { adminDatabase: async () => ({ db: { from: () => chain }, user: { email: 'admin@example.test' } }) },
    '@/lib/admin-inventory': { getAdminInventory: async () => { if (inventoryError) throw new Error(inventoryError); return new Map() } },
    '@/components/admin/ProductStockBadge': { default: 'StockBadge' },
    '../actions': { logout() {} },
    '@/components/admin/AdminCatalogSetupNotice': { default: 'SetupNotice' },
    '@/components/admin/AdminDatabaseNotice': { default: 'DatabaseNotice' },
    '@/lib/admin-diagnostics': load('src/lib/admin-diagnostics.ts'),
  }, { Error })
}

test('catalog stays usable when the inventory view has not been installed', async () => {
  const tree = await catalog('ADMIN_INVENTORY_NOT_INSTALLED').render({})
  assert.match(JSON.stringify(tree), /Argola Lunarity/)
  assert.equal(nodes(tree, n => n.props.role === 'status').length, 1)
  assert.equal(nodes(tree, n => n.type === 'StockBadge')[0].props.row, undefined)
  assert.ok(nodes(tree, n => n.type === 'Link' && n.props.href === '/admin/produtos/product').length)
})

test('catalog displays explicit failure notices for permission errors and failed product queries', async () => {
  assert.equal(nodes(await catalog('ADMIN_INVENTORY_QUERY').render({}),n=>n.type==='DatabaseNotice').length,1)
  assert.equal(nodes(await catalog(null,{code:'42501'}).render({}),n=>n.type==='DatabaseNotice')[0].props.error.code,'42501')
  const tree = await catalog(null).render({})
  assert.equal(nodes(tree, n => n.props.role === 'status').length, 0)
})

test('an absent search function displays installation guidance',async()=>{
  const tree=await catalog(null,{code:'PGRST202'}).render({})
  assert.equal(nodes(tree,n=>n.type==='SetupNotice').length,1)
})
test('a failed statistic does not hide a valid product list or invent a zero count',async()=>{
 const tree=await catalog(null,null,{code:'42703',message:'column products.missing does not exist'}).render({})
 assert.equal(nodes(tree,n=>n.type==='DatabaseNotice').length,0)
 assert.match(JSON.stringify(tree),/Argola Lunarity/)
 assert.match(JSON.stringify(tree),/Alguns indicadores/)
 assert.ok(nodes(tree,n=>n.props.children==='—').length)
})

test('name search uses parameterized terms and preserves status and page filters',async()=>{
 const calls=[]
 const chain={select(){return chain},eq(key,value){calls.push(['eq',key,value]);return chain},order(){return chain},range:async(from,to)=>{calls.push(['range',from,to]);return {data:[],count:50,error:null}},then(resolve){return Promise.resolve({count:50,error:null}).then(resolve)}}
 const view=renderer('src/app/admin/produtos/page.tsx',{
  'next/link':{default:'Link'},'next/navigation':{redirect(){throw Error('unexpected')}},
  '@/lib/admin-auth':{adminDatabase:async()=>({db:{from:()=>chain,rpc:(name,args,options)=>{calls.push(['rpc',name,args,options]);return chain}},user:{email:'admin@example.test'}})},
  '@/lib/admin-inventory':{getAdminInventory:async()=>new Map()},'@/components/admin/ProductStockBadge':{default:'StockBadge'},'../actions':{logout(){}},'@/components/admin/AdminCatalogSetupNotice':{default:'SetupNotice'},'@/components/admin/AdminDatabaseNotice':{default:'DatabaseNotice'},'@/lib/admin-diagnostics':load('src/lib/admin-diagnostics.ts'),
 })
 const tree=await view.render({searchParams:{q:'titanio flor',status:'published',page:'2'}})
 assert.equal(calls[0][1],'lunarity_admin_search_products')
 assert.equal(calls[0][2].p_query,'titanio flor')
 assert.equal(calls[0][3].count,'exact')
 assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='status'&&c[2]==='published'))
 assert.ok(calls.some(c=>c[0]==='range'&&c[1]===24&&c[2]===47))
 const next=nodes(tree,n=>n.type==='Link'&&n.props.href?.includes('page=3'))[0]
 assert.equal(new URL(next.props.href,'https://fixture.example').searchParams.get('q'),'titanio flor')
})

test('missing admin secret routes only authorized users to configuration instructions', async () => {
  for (const allowed of [true, false]) {
    const auth = load('src/lib/admin-auth.ts', {
      '@/lib/admin-diagnostics':load('src/lib/admin-diagnostics.ts'),
      '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-id', email_confirmed_at: '2026-01-01' } } }) } }) },
      '@supabase/supabase-js': { createClient() { throw new Error('Must not create a database client') } },
      'next/headers': { cookies: () => ({}) },
      'next/navigation': { redirect(path) { throw new Error(path) } },
    }, { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-fixture', SERENITY_ADMIN_USER_IDS: allowed ? 'admin-id' : '' })
    await assert.rejects(auth.adminDatabase(), { message: allowed ? '/admin/configuracao' : '/admin/login?erro=permissao' })
  }
})
