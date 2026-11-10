const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs'),{timingSafeEqual}=require('node:crypto')
test('email cron authorizes requests and continues restock processing when the separate order worker fails',async()=>{
 const calls=[],secret='test-secret-'.repeat(4)
 const {GET}=load('src/app/api/cron/emails/route.ts',{
  'node:crypto':{timingSafeEqual},'@/lib/payment-processing-server':{paymentDatabase:()=>({})},
  '@/lib/order-email-server':{drainOrderEmails:async()=>{calls.push('order');throw Error('offline')}},
  '@/lib/restock-server':{drainRestockEmails:async()=>{calls.push('restock');return {sent:1,failed:0,skipped:false}}}
 },{CRON_SECRET:secret})
 assert.equal((await GET(new Request('https://example.test'))).status,401);assert.equal(calls.length,0)
 const response=await GET(new Request('https://example.test',{headers:{Authorization:'Bearer '+secret}}))
 assert.equal(response.status,503);assert.equal((await response.json()).restock.sent,1);assert.deepEqual(calls,['order','restock'])
})
