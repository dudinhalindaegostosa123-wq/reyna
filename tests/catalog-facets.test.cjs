const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const {availableCatalogFilters}=load('src/lib/catalog-facets.ts')
const {matchesAreaSelection,AREA_OPTIONS,JEWELRY_OPTIONS,getSubareaOptions}=load('src/lib/catalog-area.ts',{
 ...require('./helpers/commerce.cjs'),'./data':{plainText:x=>x},'./catalog-server':{},'./wholesale-server':{}
})
const rows=[
 {id:'top',material:'Titânio',category_slugs:['topo','helix'],jewelry_filters:['topo-labret-12']},
 {id:'top2',material:'Ouro 18K',category_slugs:['topo','tragus'],jewelry_filters:['push-pin']},
 {id:'ring',material:'Aço',category_slugs:['argolas','septo'],jewelry_filters:['argolas']},
]
const facets=(items,selection={})=>{const selected={area:'all',subarea:'all',jewelry:'all',material:'all',...selection};return availableCatalogFilters(items,selected,{areas:AREA_OPTIONS,subareas:getSubareaOptions(selected.area),jewelry:JEWELRY_OPTIONS},matchesAreaSelection)}
test('Topo never receives ring or unrelated region filters; all catalog rows contribute to facets',()=>{
 const result=facets(rows.slice(0,2))
 assert.deepEqual(Array.from(result.jewelry,x=>x.value),['all','topo-labret-12','push-pin'])
 assert.deepEqual(Array.from(result.areas,x=>x.value),['all','orelha'])
 assert.deepEqual(Array.from(result.materials),['Ouro 18K','Titânio'])
})
test('facets respect the other selections while allowing switches within their own dimension',()=>{
 const result=facets(rows,{area:'orelha',material:'Titânio'})
 assert.deepEqual(Array.from(result.jewelry,x=>x.value),['all','topo-labret-12'])
 assert.ok(result.subareas.some(x=>x.value==='helix'));assert.ok(!result.subareas.some(x=>x.value==='tragus'))
 assert.deepEqual(Array.from(result.materials),['Ouro 18K','Titânio'])
 const empty=facets([]);assert.deepEqual(Array.from(empty.jewelry,x=>x.value),['all']);assert.equal(empty.materials.length,0)
})
test('server reads facets beyond the first page, scopes by product ID and does not use the current 12-product page',async()=>{
 const page1=Array.from({length:500},(_,i)=>({id:'other'+i,material:'Aço',category_slugs:['septo'],jewelry_filters:['argolas']}))
 const requests=[]
 const {getCatalogFacets}=load('src/lib/catalog-facets-server.ts',{
  'next/cache':{unstable_cache:fn=>fn},'./catalog-server':{getStoreFilterProducts:async()=>[{id:'top'}]},
  './catalog-area':{AREA_OPTIONS,JEWELRY_OPTIONS,getSubareaOptions,matchesAreaSelection},'./catalog-facets':{availableCatalogFilters}
 },{SUPABASE_URL:'https://fixture.example',SUPABASE_PUBLISHABLE_KEY:'public'}, {fetch:async url=>{const offset=Number(new URL(url).searchParams.get('offset'));requests.push(offset);return new Response(JSON.stringify(offset===0?page1:[rows[0]]))}})
 const result=await getCatalogFacets('topo',{area:'all',subarea:'all',jewelry:'all',material:'all'})
 assert.deepEqual(requests,[0,500]);assert.deepEqual(Array.from(result.materials),['Titânio'])
 assert.deepEqual(Array.from(result.jewelry,x=>x.value),['all','topo-labret-12'])
})
