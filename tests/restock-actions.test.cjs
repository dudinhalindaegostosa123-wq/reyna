const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs'),{createHmac}=require('node:crypto')
test('restock signup requires consent and valid fields, normalizes email, hashes request identity and never sends email on registration',async()=>{
 const calls=[];let enabled=true,error=null
 const {subscribeRestock}=load('src/app/avisos/estoque/actions.ts',{
  'next/headers':{headers:()=>new Headers({'x-forwarded-for':'203.0.113.1'})},'node:crypto':{createHmac},
  '@/lib/payment-processing-server':{paymentDatabase:()=>({rpc:async(...args)=>{calls.push(args);return {error}}})},
  '@/lib/order-email-server':{emailEnabled:()=>enabled,emailConfigured:()=>true}
 },{VERCEL:'1',CRON_SECRET:'test-key-'.repeat(8)})
 const input={slug:'importado-23927',variant:'101',email:' Cliente@Example.com ',consent:'on'}
 const form=(changes={})=>({get:key=>({...input,...changes})[key]})
 for(const fields of [{consent:''},{email:'a@example.com\r\nBcc: b@example.com'},{slug:'../evil'}])assert.ok((await subscribeRestock(form(fields))).error)
 assert.equal(calls.length,0)
 assert.ok((await subscribeRestock(form())).success)
 assert.equal(calls[0][0],'serenity_restock_subscribe_v1');assert.equal(calls[0][1].p_email,'cliente@example.com');assert.equal(calls[0][1].p_variant,'101');assert.match(calls[0][1].p_key,/^[a-f0-9]{64}$/)
 enabled=false;assert.ok((await subscribeRestock(form())).error);assert.equal(calls.length,1)
 enabled=true;error={message:'RESTOCK_AVAILABLE'};assert.match((await subscribeRestock(form())).error,/já está disponível/)
 assert.ok((await subscribeRestock(form({website:'bot'}))).success);assert.equal(calls.length,2)
})
