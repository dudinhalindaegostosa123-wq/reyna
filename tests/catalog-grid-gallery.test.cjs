const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const id='11111111-1111-4111-8111-111111111111'
function fixture(fail=false,thumbnail=false){
 const calls=[]
 const api=load('src/lib/catalog-server.ts',{
 ...require('./helpers/commerce.cjs'),react:{cache:fn=>fn},'next/cache':{unstable_cache:fn=>fn},'./data':{plainText:x=>x},'@/lib/wholesale-server':{readWholesaleAccess:async()=>({rules:null})}
 },{SUPABASE_URL:'https://fixture.example',SUPABASE_PUBLISHABLE_KEY:'public'},{fetch:async url=>{
 const parsed=new URL(url);calls.push(parsed)
 if(parsed.pathname.endsWith('/product_media')){
 assert.equal(parsed.searchParams.get('product_id'),`in.(${id})`)
 if(fail)return new Response('{}',{status:403})
 return new Response(JSON.stringify([{product_id:id,storage_path:'cover.webp'},{product_id:id,storage_path:'variant-blue.webp'},{product_id:id,storage_path:'variant-pink.webp'},{product_id:id,storage_path:'variant-blue.webp'}]))
 }
 return new Response(JSON.stringify([{id:'42',database_id:id,slug:'labret',name:'Labret',categories:['Labret'],category_slugs:['labret'],tags:[],price:100,product_type:'variable',visibility:'visible',storage_path:'cover.webp',thumbnail_path:thumbnail?'thumb-cover.webp':null}]),{headers:{'content-range':'0-0/1'}})
 }})
 return {api,calls}
}
test('listing cards receive ordered and deduplicated cover and variant photos',async()=>{
 const {api,calls}=fixture();const page=await api.getStorePage()
 assert.deepEqual(Array.from(page.products[0].images),['cover.webp','variant-blue.webp','variant-pink.webp'].map(file=>`https://fixture.example/storage/v1/object/public/produtos/${file}`))
 assert.equal(calls.filter(url=>url.pathname.endsWith('/product_media')).length,1)
})
test('gallery unavailability keeps the catalog and cover usable',async()=>{
 const {api}=fixture(true);const page=await api.getStorePage()
 assert.equal(page.products[0].images.length,1);assert.equal(page.products[0].price,100)
})

test('hover photo skips the full-size duplicate of the displayed thumbnail cover',async()=>{
 const {api}=fixture(false,true);const page=await api.getStorePage()
 assert.deepEqual(Array.from(page.products[0].images),['thumb-cover.webp','variant-blue.webp','variant-pink.webp'].map(file=>`https://fixture.example/storage/v1/object/public/produtos/${file}`))
})
