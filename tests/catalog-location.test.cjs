const {test}=require('node:test')
const assert=require('node:assert/strict')
const {load}=require('./helpers/load.cjs')
const api=load('src/lib/catalog-area.ts',{
 '@/lib/commerce-server':{},'./data':{},'./catalog-server':{},'./wholesale-server':{},
})
test('Labrets keeps tops included when location and jewelry filters are active',()=>{
 for(const slugs of [['topo','helix'],['labret','topo','helix']]){
  const q=api.buildAreaQuery({category:'labret',area:'orelha',subarea:'helix',jewelry:'topo-labret-12',material:'Titânio',page:2,perPage:12},slugs)
  assert.equal(q.get('and'),'(category_slugs.ov.{labret,topo},category_slugs.ov.{helix})')
  assert.equal(q.get('jewelry_filters'),'cs.{topo-labret-12}')
  assert.equal(q.get('material'),'eq.Titânio')
  assert.equal(q.get('offset'),'12')
  assert.notEqual(q.get('limit'),'0')
 }
})
test('all jewelry pages offer location filters, with subareas and material applied before pagination',()=>{
 assert.equal(api.supportsAreaFilter('todos'),true)
 assert.equal(api.supportsAreaFilter('piercings-de-ouro-18k'),true)
 assert.equal(api.supportsAreaFilter('after-care'),false)
 const q=api.buildAreaQuery({category:'todos',area:'orelha',subarea:'helix',material:'Titânio',page:2,perPage:12},['helix','nariz','tragus'])
 assert.match(q.get('and'),/category_slugs.ov.\{helix\}/)
 assert.equal(q.get('material'),'eq.Titânio')
 assert.equal(q.get('offset'),'12')
 assert.equal(api.buildAreaQuery({category:'todos',area:'umbigo'},['helix']).get('limit'),'0')
})
test('one 1.6 mm filter combines both legacy groups and preserves old links',()=>{
 assert.equal(api.JEWELRY_OPTIONS.filter(o=>o.label.includes('1.6')).length,1)
 assert.equal(api.normalizeJewelry('micro-surface-16'),'topo-rosca-16')
 for(const value of ['topo-rosca-16','micro-surface-16']){
  const q=api.buildAreaQuery({category:'todos',area:'nariz',jewelry:value},['nariz'])
  assert.equal(q.get('jewelry_filters'),'ov.{topo-rosca-16,micro-surface-16}')
  assert.match(q.get('and'),/nariz/)
 }
 const q=api.buildAreaQuery({category:'todos',area:'all',jewelry:'push-pin'},[])
 assert.equal(q.get('jewelry_filters'),'cs.{push-pin}')
})
