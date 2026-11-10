const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
test('missing curation SQL preserves catalog behavior, but transient errors never silently resurrect excluded products',async()=>{
 function api(status,rows){return load('src/lib/stone-overrides-server.ts',{'next/cache':{unstable_cache:fn=>fn}},{SUPABASE_URL:'https://db.example',SUPABASE_PUBLISHABLE_KEY:'public'},{fetch:async url=>{assert.ok(url.includes('select=color_id%2Cproduct_id%2Cincluded'));return new Response(JSON.stringify(rows),{status})}})}
 assert.equal((await api(404,{}).getStoneOverrides()).length,0)
 const rows=await api(200,[{color_id:'verde',product_id:'fixture',included:false}]).getStoneOverrides()
 assert.equal(rows[0].included,false)
 await assert.rejects(api(503,{}).getStoneOverrides(),/STONE_CURATIONS_READ/)
})
