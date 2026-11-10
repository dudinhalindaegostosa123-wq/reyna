const {test}=require('node:test')
const assert=require('node:assert/strict')
const {load}=require('./helpers/load.cjs')
const data=load('src/lib/data.ts')
const merchant=load('src/lib/google-merchant.ts',{'./data':data})
const base={id:'3430',slug:'importado-3430',name:'Topo & Estrela',description:'<p>Joia & detalhes</p>',longDescription:'',price:82,priceAvailable:true,inStock:true,material:'Titânio',images:['https://images.example/joia.jpg'],sku:'TN856'}
test('retail XML escapes content, uses stable IDs and rejects missing prices/images',()=>{
 const xml=merchant.merchantXml([base,base,{...base,id:'bad',price:0},{...base,id:'bad2',images:[]}])
 assert.equal((xml.match(/<item>/g)||[]).length,1)
 assert.match(xml,/<g:id>3430<\/g:id>/)
 assert.match(xml,/Topo &amp; Estrela/)
 assert.match(xml,/<g:price>82.00 BRL/)
 const parsed=require('node:child_process').spawnSync('python3',['-c','import sys,xml.etree.ElementTree as E; r=E.fromstring(sys.stdin.read()); assert r.tag=="rss"'],{input:xml,encoding:'utf8'})
 assert.equal(parsed.status,0,parsed.stderr)
 assert.doesNotMatch(xml,/<g:brand>|<g:gtin>|<g:mpn>/)
 assert.throws(()=>merchant.merchantXml([]),/MERCHANT_EMPTY_CATALOG/)
})
test('variants are grouped, deep-linked, separately priced, sized and stocked',()=>{
 const product={...base,variations:[{id:'3431',name:'Tamanho M',price:90,priceAvailable:true,inStock:true,attributes:{Tamanho:'M',Cor:'Azul'}},{id:'3432',name:'Tamanho G',price:100,priceAvailable:true,inStock:false,attributes:{Tamanho:'G'}}]}
 const xml=merchant.merchantXml([product])
 assert.equal((xml.match(/<item>/g)||[]).length,2)
 assert.match(xml,/variacao=3431/)
 assert.match(xml,/<g:size>M<\/g:size>/)
 assert.match(xml,/<g:color>Azul<\/g:color>/)
 assert.match(xml,/<g:availability>out_of_stock/)
 assert.match(xml,/<g:item_group_id>3430/)
 const schema=merchant.productStructuredData(product)
 assert.equal(schema.offers[0].price,'90.00')
 assert.equal(schema.offers[1].availability,'https://schema.org/OutOfStock')
 assert.equal(schema.offers[0].url,merchant.merchantLink(product,'3431'))
})
test('feed failure returns retryable 503 rather than an empty successful feed',async()=>{
 const route=load('src/app/google-merchant.xml/route.ts',{'@/lib/catalog-server':{getMerchantCatalog:async()=>{throw Error('private database details')}},'@/lib/google-merchant':merchant})
 const result=await route.GET()
 assert.equal(result.status,503)
 assert.equal(result.headers.get('Cache-Control'),'no-store')
 assert.doesNotMatch(await result.text(),/private/)
})
test('feed reader uses anonymous public retail views, pagination and parent stock',async()=>{
 const calls=[]
 const rows={store_catalog:[{database_id:'p',id:'3430',slug:'importado-3430',name:'Topo',product_type:'variable',categories:['Topos'],category_slugs:['topos'],tags:[],material:'Titânio',price:82,price_available:true,in_stock:true}],serenity_store_variants:[{id:'v',product_id:'p',woo_id:3431,name:'M',sku:'TN',attributes:{Tamanho:'M'},regular_price:82,sale_price:null,sale_starts_at:null,sale_ends_at:null,stock_status:'instock',stock_quantity:4}],products:[{id:'p',stock_quantity:0,stock_status:'outofstock',sold_individually:false}],product_media:[{id:'m',product_id:'p',variant_id:null,storage_path:'joia.jpg',media_type:'image'}]}
 const catalog=load('src/lib/catalog-server.ts',{'./individual-sale':load('src/lib/individual-sale.ts'),
  '@/lib/read-fetch':{readFetch:async(url,options)=>{const parsed=new URL(url);const table=parsed.pathname.split('/').pop();calls.push({table,options,parsed});const offset=Number(parsed.searchParams.get('offset')||0); const result=table==='product_media' ? Array.from({length:Math.min(500,1001-offset)},(_,i)=>({...rows[table][0],id:'m'+(offset+i)})) : rows[table]; return new Response(JSON.stringify(result),{status:200,headers:{'content-range':`0-499/${table==='product_media' ? 1001 : result.length}`}})}},
  '@/lib/stem-description':load('src/lib/stem-description.ts'),'@/lib/commerce-server':{getCommercePolicy:async()=>({version:1})},
  '@/lib/commerce':{DEFAULT_COMMERCE_POLICY:{},isTopProduct:()=>false,existingVariantStem:()=>undefined,isMicrodermalProduct:()=>false},
  './legacy-product-links':load('src/lib/legacy-product-links.ts'),react:{cache:x=>x},'next/cache':{unstable_cache:x=>x},'./data':data,
  '@/lib/wholesale-server':{readWholesaleAccess:()=>{throw Error('must not read customer session')}},
 },{SUPABASE_URL:'https://db.example',SUPABASE_PUBLISHABLE_KEY:'public-key'},{fetch:()=>{}})
 const products=await catalog.getMerchantCatalog()
 assert.equal(products[0].variations[0].price,82)
 assert.equal(products[0].variations[0].stock,0)
 assert.equal(products[0].variations[0].inStock,false)
 assert.equal(products[0].images[0],'https://db.example/storage/v1/object/public/produtos/joia.jpg')
 assert.equal(calls.find(c=>c.table==='store_catalog').parsed.searchParams.get('visibility'),'eq.visible')
 assert.ok(calls.every(c=>c.options.headers.apikey==='public-key'))
 assert.ok(calls.every(c=>!c.table.includes('wholesale')))
 assert.equal(calls.filter(c=>c.table==='product_media').length,3)
 assert.deepEqual(calls.filter(c=>c.table==='product_media').map(c=>c.parsed.searchParams.get('offset')),['0','500','1000'])
 assert.equal(await catalog.resolveLegacyProductLink(3429,new URLSearchParams('attribute_tamanho=M')),'https://serenitypiercings.com.br/produto/importado-3430?variacao=3431')
 assert.equal(await catalog.resolveLegacyProductLink(3429,new URLSearchParams('attribute_tamanho=P')),null)
})
