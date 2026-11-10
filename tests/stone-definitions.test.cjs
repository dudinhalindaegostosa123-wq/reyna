const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const colors=load('src/lib/stone-colors.ts')
test('dynamic color registry falls back only when absent and never hides backend failures',async()=>{
 const api=(status,rows)=>load('src/lib/stone-definitions-server.ts',{'./stone-colors':colors,'next/cache':{unstable_cache:fn=>fn}},{SUPABASE_URL:'https://db.example',SUPABASE_PUBLISHABLE_KEY:'public'},{fetch:async()=>new Response(JSON.stringify(rows),{status})})
 assert.equal((await api(404,{}).getStoneDefinitions()).length,13)
 assert.equal((await api(200,[{id:'opala-branca',name:'Opala branca',color:'#ffffff'}]).getStoneDefinitions())[0].id,'opala-branca')
 await assert.rejects(api(503,{}).getStoneDefinitions(),/STONE_COLORS_READ/)
})
