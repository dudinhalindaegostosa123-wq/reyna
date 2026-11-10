const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const center = load('src/lib/label-center.ts')

test('batch selection excludes unfinished shipments and already purchased labels', () => {
  const base = { label_stage: 'to_buy', job_state: 'prepared', shipping_pending: false }
  assert.equal(center.labelCanSelect(base), true)
  for (const state of ['empty','quoted','rejected']) assert.equal(center.labelCanSelect({...base,job_state:state}),true)
  for (const patch of [{ job_state: 'creating' }, { job_state: 'uncertain' }, { shipping_pending: true }, { label_stage: 'purchased' }, { label_stage: 'review' }, { label_stage: 'shipped' }, { label_stage: 'unverified' }]) {
    assert.equal(center.labelCanSelect({ ...base, ...patch }), false)
  }
})

test('quick shipment data requires admin and a paid canonical order without purchasing', async () => {
  const id = '8d5dcd39-52ba-4a64-8592-30338f48987e'
  let status = 'paid', reads = 0, preparations = 0
  const mocks = {
    '@/lib/admin-auth': { adminDatabase: async () => ({ db: { from(table) {
      assert.equal(table, 'serenity_orders'); reads++
      const query = { select() { return query }, eq(key, value) { assert.equal(key, 'id'); assert.equal(value, id); return query }, single: async () => ({ data: { id, status }, error: null }) }
      return query
    } } }) },
    '@/lib/label-scope-server': { scopedLabelDatabase: db => db },
    '@/lib/admin-sales': { saleUuid: value => value === id },
    '@/lib/label-draft-server': { loadLabelPreparation: async () => { preparations++; return { id,issues:[] } } },
    '@/lib/label-cart-server': { loadLabelJobView: async () => ({ orderId: id,issues:[] }) },
  }
  const api = load('src/app/admin/frete/quick-label-actions.ts', mocks)
  assert.equal((await api.loadQuickLabel('bad')).error, 'Pedido inválido.')
  assert.equal(reads, 0)
  status = 'pending'
  assert.ok((await api.loadQuickLabel(id)).error)
  assert.equal(preparations, 0)
  status = 'paid'
  assert.equal((await api.loadQuickLabel(id)).error, '')
  assert.equal(preparations, 1)
  mocks['@/lib/admin-auth'] = { adminDatabase: async () => { throw new Error('FORBIDDEN') } }
  await assert.rejects(load('src/app/admin/frete/quick-label-actions.ts', mocks).loadQuickLabel(id), /FORBIDDEN/)
})

test('queue filters and numeric search combine, and pagination keeps the chosen filter', async () => {
  const calls = []
  const db = { from() {
    const query = { select(...args) { calls.push(['select', ...args]); return query }, eq(...args) { calls.push(['eq', ...args]); return query }, or(value) { calls.push(['or', value]); return query }, ilike() { return query }, order() { return query }, range() { return query }, then(resolve) { return Promise.resolve({ data: [], count: 41, error: null }).then(resolve) } }
    return query
  } }
  const Page = load('src/app/admin/etiquetas/page.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: props => React.createElement('a', props, props.children) },
    '@/lib/admin-auth': { adminDatabase: async () => ({ db }) },
    '@/lib/label-center': center,
    '@/components/admin/LabelBatchList': { default: () => null },
  }).default
  const html = renderToStaticMarkup(await Page({ searchParams: { filtro: 'prepare', q: '42' } }))
  assert.ok(calls.some(call => call[0] === 'or' && call[1] === 'and(or(job_state.neq.prepared,shipping_pending.eq.true),or(order_number.eq.42,customer_name.ilike.*42*,jewelry_search.ilike.*42*))'))
  assert.match(html, /filtro=prepare&amp;page=2/)
  calls.length = 0
  await Page({ searchParams: { filtro: 'ready', q: 'TN623' } })
  assert.ok(calls.some(call => call[0] === 'or' && call[1] === 'and(or(customer_name.ilike.*TN623*,jewelry_search.ilike.*TN623*))'))
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'job_state' && call[2] === 'prepared'))
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'shipping_pending' && call[2] === false))
})

test('new jewelry search failure does not prevent normal listing and exposes a safe reference if base listing also fails', async () => {
  const calls=[]
  let failBase=false
  const db={from(table){let head=false
    const q={select(_fields,options){head=Boolean(options?.head);return q},eq(...args){calls.push([table,'eq',...args]);return q},or(value){calls.push([table,'or',value]);return q},order(){return q},range(){calls.push([table,'range']);return q},then(resolve){
      const error=!head&&(table==='serenity_admin_label_center_v3'||failBase)?{code:'42703',message:'private raw database detail'}:null
      return Promise.resolve({data:error?null:head?[]:[{order_id:'order',customer_name:'Paula'}],count:1,error}).then(resolve)
    }};return q
  }}
  const Page=load('src/app/admin/etiquetas/page.tsx',{
    'react/jsx-runtime':require('react/jsx-runtime'),
    'next/link':{default:props=>React.createElement('a',props,props.children)},
    '@/lib/admin-auth':{adminDatabase:async()=>({db})},
    '@/lib/label-center':center,
    '@/components/admin/LabelBatchList':{default:props=>React.createElement('p',null,'Lista carregada: '+props.rows.length)},
  }).default
  let html=renderToStaticMarkup(await Page({searchParams:{q:'Paula',filtro:'prepare'}}))
  assert.match(html,/Lista carregada: 1/)
  assert.match(html,/busca por código da joia está temporariamente indisponível/)
  assert.ok(calls.some(c=>c[0]==='serenity_admin_label_center_v2'&&c[1]==='or'&&c[2]==='and(or(job_state.neq.prepared,shipping_pending.eq.true),or(customer_name.ilike.*Paula*))'))
  calls.length=0
  html=renderToStaticMarkup(await Page({searchParams:{}}))
  assert.match(html,/Lista carregada: 1/)
  assert.ok(!calls.some(c=>c[0]==='serenity_admin_label_center_v3'&&c[1]==='range'))
  failBase=true
  html=renderToStaticMarkup(await Page({searchParams:{}}))
  assert.match(html,/ETIQUETAS-42703/)
  assert.ok(!html.includes('private raw database detail'))
})

test('opening quick shipment quotes saved valid data automatically but never repeats a prepared or uncertain operation',async()=>{
 const id='8d5dcd39-52ba-4a64-8592-30338f48987e'
 let state='empty',quoted=0,issues=[]
 const db={from(){const q={select(){return q},eq(){return q},single:async()=>({data:{id,status:'paid'},error:null})};return q}}
 const api=load('src/app/admin/frete/quick-label-actions.ts',{
  '@/lib/admin-auth':{adminDatabase:async()=>({db,user:{id:'admin',email:'owner@example.com'}})},
  '@/lib/label-scope-server':{scopedLabelDatabase:db=>db},
  '@/lib/admin-sales':{saleUuid:value=>value===id},
  '@/lib/label-draft-server':{loadLabelPreparation:async()=>({id,issues})},
  '@/lib/label-cart-server':{
   loadLabelJobView:async()=>({orderId:id,state,issues:[],agency:'',cnae:'',stale:false,expires:'2099-01-01T00:00:00Z'}),
   quoteLabel:async()=>{quoted++;state='quoted'},
  },
 })
 assert.equal((await api.loadQuickLabel(id)).job.state,'quoted');assert.equal(quoted,1)
 await api.loadQuickLabel(id);assert.equal(quoted,1)
 for(const locked of ['prepared','creating','uncertain']){state=locked;await api.loadQuickLabel(id);assert.equal(quoted,1)}
 state='empty';issues=['Destinatário: Preencha o número.'];await api.loadQuickLabel(id);assert.equal(quoted,1)
})
