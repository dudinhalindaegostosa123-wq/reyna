const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const context={measurementId:'G-ZR73XP32BW',clientId:'123.456',sessionId:'1762180000',capturedAt:Date.now()}
test('analytics sidecar is bound to checkout capability and its failures never block the financial checkout',async()=>{
 const api=load('src/lib/analytics-server.ts',{'./analytics-model':load('src/lib/analytics-model.ts')},{NEXT_PUBLIC_GA4_MEASUREMENT_ID:'G-ZR73XP32BW'})
 let called=0
 const db={rpc:(name,args)=>{called++;assert.equal(name,'serenity_analytics_capture_v1');assert.equal(args.p_checkout,'checkout');assert.equal(args.p_access_hash,'capability');assert.equal(args.p_context.clientId,'123.456');return {abortSignal:async()=>{throw Error('database unavailable')}}}}
 await api.captureCheckoutAnalytics(db,'checkout','capability',context);assert.equal(called,1)
 await api.captureCheckoutAnalytics(db,'checkout','capability',{...context,clientId:'email@example.com'});assert.equal(called,1)
})
