const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
test('catalog failures log only a safe database code, never response details or keys',async()=>{
 for(const code of ['57014','PGRST301','invalid secret content']){
  const logs=[]
  const api=load('src/lib/catalog-server.ts',{
   ...require('./helpers/commerce.cjs'),react:{cache:fn=>fn},'next/cache':{unstable_cache:fn=>fn},'./data':{plainText:x=>x},'@/lib/wholesale-server':{readWholesaleAccess:async()=>({rules:null})},
  },{SUPABASE_URL:'https://fixture.example',SUPABASE_PUBLISHABLE_KEY:'private-test-key'},{console:{error:(...args)=>logs.push(args)},fetch:async()=>new Response(JSON.stringify({code,message:'private response details',details:'private data'}),{status:500})})
  await assert.rejects(api.getStorePage(),/Não foi possível consultar o catálogo/)
  assert.equal(logs[0].at(-1),code==='invalid secret content'?'UNKNOWN':code)
  assert.doesNotMatch(JSON.stringify(logs),/private|invalid secret content/)
 }
})
