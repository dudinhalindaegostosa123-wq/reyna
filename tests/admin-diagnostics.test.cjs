const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs'),{renderer}=require('./helpers/render.cjs')
const diagnostics=load('src/lib/admin-diagnostics.ts')
const jwt=payload=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.fixture-signature'

test('admin key checks reject public keys and foreign legacy projects without exposing values',()=>{
 assert.equal(diagnostics.adminKeyProblem('sb_secret_fixture','https://new.supabase.co'),null)
 assert.equal(diagnostics.adminKeyProblem(jwt({role:'service_role',ref:'new'}),'https://new.supabase.co'),null)
 assert.equal(diagnostics.adminKeyProblem('sb_publishable_fixture','https://new.supabase.co'),'public-key')
 assert.equal(diagnostics.adminKeyProblem(jwt({role:'anon',ref:'new'}),'https://new.supabase.co'),'public-key')
 assert.equal(diagnostics.adminKeyProblem(jwt({role:'service_role',ref:'old'}),'https://new.supabase.co'),'wrong-project')
 assert.equal(diagnostics.adminKeyProblem('"sb_secret_quoted"','https://new.supabase.co'),'invalid-key')
 assert.equal(diagnostics.adminKeyProblem('','https://new.supabase.co'),'missing')
})

test('authorized users with a public admin key are redirected before private database requests',async()=>{
 let created=false
 const auth=load('src/lib/admin-auth.ts',{
  '@/lib/admin-diagnostics':diagnostics,
  '@supabase/ssr':{createServerClient:()=>({auth:{getUser:async()=>({data:{user:{id:'admin',email_confirmed_at:'2026-01-01'}}})}})},
  '@supabase/supabase-js':{createClient(){created=true;return {}}},
  'next/headers':{cookies:()=>({})},'next/navigation':{redirect:path=>{throw Error(path)}},
 },{SUPABASE_URL:'https://new.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SECRET_KEY:jwt({role:'anon'}),SERENITY_ADMIN_USER_IDS:'admin'})
 await assert.rejects(auth.adminDatabase(),{message:'/admin/configuracao?motivo=chave'})
 assert.equal(created,false)
})

test('authenticated database error notices show only safe codes and fixed guidance',()=>{
 const notice=renderer('src/components/admin/AdminDatabaseNotice.tsx',{'next/link':{default:'Link'},'@/lib/admin-diagnostics':diagnostics})
 for(const error of [{code:'42501',message:'secret-private-value'},{code:'57014',details:'secret-private-value'},{code:'unsafe-secret-private-value'},{message:'Invalid API key'}]){
  const tree=notice.render({error,stage:'editor'})
  const content=JSON.stringify(tree)
  assert.doesNotMatch(content,/secret-private-value/)
  assert.match(content,/Código/)
 }
 assert.equal(diagnostics.adminErrorCode({code:'57014'}),'57014')
 assert.equal(diagnostics.adminErrorCode({message:'Invalid API key'}),'API_KEY_INVALID')
})
