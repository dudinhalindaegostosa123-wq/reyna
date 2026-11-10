const {test}=require('node:test')
const assert=require('node:assert/strict')
const {load}=require('./helpers/load.cjs')
function preparation({found={data:{old_id:1}},created={error:null},env={}}={}) {
 const calls=[]
 const api=load('src/lib/legacy-auth-server.ts',{'node:crypto':{randomBytes:()=>({toString:()=> 'unpredictable-generated-password'})},'@supabase/supabase-js':{createClient:()=>({from:()=>({select:()=>({eq:(key,email)=>({maybeSingle:async()=>{calls.push({lookup:email});return found}})})}),auth:{admin:{createUser:async input=>{calls.push(input);return created}}}})}},{VERCEL_ENV:'production',SERENITY_LEGACY_ACTIVATION_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'private',...env})
 return {api,calls}
}
test('legacy activation is on-demand, unconfirmed, gated and never replaces an existing password',async()=>{
 let {api,calls}=preparation()
 await api.prepareLegacyRecovery('owner@example.com')
 assert.equal(calls.length,2);assert.equal(calls[1].email_confirm,false);assert.ok(calls[1].password)
 ;({api,calls}=preparation({created:{error:{code:'email_exists'}}}))
 await api.prepareLegacyRecovery('owner@example.com');assert.equal(calls.length,2)
 ;({api,calls}=preparation({found:{data:null}}))
 await api.prepareLegacyRecovery('unknown@example.com');assert.equal(calls.length,1)
 ;({api,calls}=preparation({env:{VERCEL_ENV:'preview'}}))
 await api.prepareLegacyRecovery('owner@example.com');assert.equal(calls.length,0)
})
test('verified imported account is directed to profile completion; current accounts keep their existing profile',async()=>{
 let destination='',registration=0
 const actions=load('src/app/minha-conta/entrar/actions.ts',{
  'next/cache':{revalidatePath(){}},'next/navigation':{redirect:path=>{destination=path;throw Error('REDIRECT')}},
  '@/lib/customer-auth':{customerAuth:()=>({auth:{signInWithPassword:async()=>({data:{user:{id:'owner',email_confirmed_at:'2025-01-01'}},error:null})}})},
  '../cadastrar/actions':{completeCustomerRegistration:async()=>{registration++;return {error:''}}},
  '@/lib/legacy-history-server':{legacyProfile:async()=>({eligible:true,needs_profile:true})},
 },{SERENITY_LEGACY_ACTIVATION_ENABLED:'true'})
 const form=new FormData();form.set('email','owner@example.com');form.set('password','new-secure-password');form.set('return_to','/checkout')
 await assert.rejects(actions.loginCustomer({},form),/REDIRECT/)
 assert.equal(destination,'/minha-conta/completar?retorno=checkout');assert.equal(registration,0)
})
