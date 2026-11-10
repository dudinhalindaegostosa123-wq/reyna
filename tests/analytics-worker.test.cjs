const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const model=load('src/lib/analytics-model.ts')
function fixture(status=204,fail=false){
 const finishes=[],requests=[]
 const job={order_id:'12345678-1234-4234-8234-123456789abc',measurement_id:'G-ZR73XP32BW',lease_id:'lease',context:{clientId:'123.456',sessionId:'1762180000',adUserData:'denied'},occurred_at:new Date().toISOString(),payload:{subtotal:100,discount:10,shipping:5,total:95,items:[{item_id:'3431',name:'Labret',quantity:1,unit_price:100}]}}
 const db={rpc:async(name,args)=>{if(name==='serenity_analytics_claim_v1')return {data:[job]};finishes.push(args);return {data:true}}}
 const api=load('src/lib/analytics-server.ts',{'./analytics-model':model},{VERCEL_ENV:'production',SERENITY_GA4_SERVER_ENABLED:'true',SERENITY_GA4_API_SECRET:'test-secret-private-value',NEXT_PUBLIC_GA4_MEASUREMENT_ID:'G-ZR73XP32BW'},{fetch:async(url,options)=>{requests.push({url,options});if(fail)throw Error('network contains a secret');return new Response(null,{status})}})
 return {api,db,job,finishes,requests}
}
test('worker submits one GA4 purchase with stable transaction and client IDs and matching lease',async()=>{
 const {api,db,finishes,requests}=fixture();const result=await api.drainAnalytics(db)
 assert.equal(result.sent,1);assert.equal(finishes[0].p_state,'sent')
 const body=JSON.parse(requests[0].options.body)
 assert.equal(body.events[0].params.transaction_id,'12345678-1234-4234-8234-123456789abc');assert.equal(body.events[0].params.value,90)
 assert.equal(body.consent.ad_user_data,'DENIED');assert.equal(body.events[0].params.session_id,1762180000)
 assert.ok(!requests[0].options.body.includes('test-secret'))
})
test('known HTTP failures retry or block, but uncertain transport is held for review rather than blindly repeated',async()=>{
 for(const [status,state] of [[429,'pending'],[503,'pending'],[400,'blocked']]){const {api,db,finishes}=fixture(status);await api.drainAnalytics(db);assert.equal(finishes[0].p_state,state)}
 const {api,db,finishes}=fixture(204,true);await api.drainAnalytics(db);assert.equal(finishes[0].p_state,'review');assert.equal(finishes[0].p_error,'ANALYTICS_DELIVERY_UNCERTAIN')
})
test('preview and disabled workers do not claim or send events',async()=>{
 for(const env of [{VERCEL_ENV:'preview',SERENITY_GA4_SERVER_ENABLED:'true'},{VERCEL_ENV:'production'}]){
  const api=load('src/lib/analytics-server.ts',{'./analytics-model':model},env)
  const result=await api.drainAnalytics({rpc:()=>{throw Error('should not query')}});assert.equal(result.skipped,true)
 }
})
