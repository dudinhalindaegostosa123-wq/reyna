const {test}=require('node:test')
const assert=require('node:assert/strict')
const {load}=require('./helpers/load.cjs')
const links=load('src/lib/legacy-product-links.ts')
const variants=[{id:'m',woo_id:3431,attributes:{Tamanho:'M'}},{id:'g',woo_id:3430,attributes:{Tamanho:'G'}}]
test('verified legacy attributes preserve exact variant and reject ambiguous or unknown choices',()=>{
 assert.equal(links.matchLegacyVariant(variants,new URLSearchParams('attribute_tamanho=M')).id,'3431')
 assert.equal(links.matchLegacyVariant(variants,new URLSearchParams('attribute_pa_tamanho=g')).id,'3430')
 assert.throws(()=>links.matchLegacyVariant(variants,new URLSearchParams('attribute_tamanho=P')))
 assert.throws(()=>links.matchLegacyVariant([...variants,variants[0]],new URLSearchParams('attribute_tamanho=M')))
 assert.equal(links.matchLegacyVariant(variants,new URLSearchParams('utm_source=test')),null)
})
test('301 only for verified slugs; temporary read failures are 503, missing products 404',async()=>{
 let fail=false,missing=false
 const route=load('src/app/product/[slug]/route.ts',{
  '@/lib/legacy-product-links':links,
  '@/lib/catalog-server':{resolveLegacyProductLink:async(id,query)=>{assert.equal(id,3429);assert.equal(query.get('attribute_tamanho'),'M');if(fail)throw Error();if(missing)return null;return 'https://serenitypiercings.com.br/produto/importado-3429?variacao=3431'}},
 })
 const req=new Request('https://serenitypiercings.com.br/product/topo-estrela-titanio/?attribute_tamanho=M')
 let result=await route.GET(req,{params:{slug:'topo-estrela-titanio'}})
 assert.equal(result.status,301)
 assert.equal(result.headers.get('Location'),'https://serenitypiercings.com.br/produto/importado-3429?variacao=3431')
 assert.equal((await route.GET(req,{params:{slug:'unverified'}})).status,404)
 assert.equal((await route.GET(req,{params:{slug:'toString'}})).status,404)
 missing=true;assert.equal((await route.GET(req,{params:{slug:'topo-estrela-titanio'}})).status,404)
 missing=false;fail=true;assert.equal((await route.GET(req,{params:{slug:'topo-estrela-titanio'}})).status,503)
})
test('expanded mapping only includes published parent IDs from the original product export',()=>{
 const {spawnSync}=require('node:child_process')
 const result=spawnSync('python3',['-c',"import csv,json; f=open('produtos.csv',encoding='utf-8-sig'); print(json.dumps([int(r['ID']) for r in csv.DictReader(f) if r['Tipo']!='variation' and r['Publicado']=='1']))"],{encoding:'utf8'})
 assert.equal(result.status,0,result.stderr)
 const published=new Set(JSON.parse(result.stdout))
 const entries=Object.entries(links.LEGACY_PRODUCT_IDS)
 assert.equal(entries.length,1741)
 assert.equal(new Set(entries.map(([,id])=>id)).size,1741)
 for(const [slug,id] of entries){assert.match(slug,/^[a-z0-9-]+$/);assert.ok(published.has(id),`Unverified parent ${id}`)}
 assert.equal(links.LEGACY_PRODUCT_IDS['topo-estrela-titanio'],3429)
 assert.equal(links.LEGACY_PRODUCT_IDS['piercing-nostril-ouro'],1382)
 assert.ok(!entries.some(([slug])=>slug.includes('__trashed')))
})
