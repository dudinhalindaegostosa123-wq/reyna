const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const id='10000000-0000-4000-8000-000000000001',remote='20000000-0000-4000-8000-000000000001',operation='30000000-0000-4000-8000-000000000001',lease='40000000-0000-4000-8000-000000000001'
test('legacy tracking only inspects info for the current prepared shipment and persists a verified status',async()=>{
 let requests=[],finishes=[],inspected=0
 const saved={state:'prepared',remote_id:remote,operation,selected:{},context:{}}
 const chain={select(){return chain},eq(){return chain},single:async()=>({data:saved,error:null})}
 const db={from:table=>{assert.equal(table,'serenity_legacy_label_jobs_v1');return chain},rpc:async(name,args)=>name.includes('claim')?{data:[{order_id:id,remote_id:remote,operation,lease_id:lease}]}:(finishes.push(args),{data:true})}
 const worker=load('src/lib/legacy-tracking-server.ts',{'./admin-sales':load('src/lib/admin-sales.ts'),'./label-cart-server':{remoteCart:response=>response},'./label-purchase-server':{labelShipmentRequest:async(...args)=>(requests.push(args),{tracking:'BR123'}),inspectShipment:()=>{inspected++;return {status:'posted'}}}})
 assert.equal((await worker.syncLegacyShipments(db,'store@example.com')).synced,1)
 assert.equal(requests[0][0],'info');assert.equal(requests[0][1],remote);assert.equal(inspected,1);assert.equal(finishes[0].p_status,'posted');assert.equal(finishes[0].p_tracking,'BR123');assert.equal(finishes[0].p_lease,lease)
 // A preparação mudou: não consulta nem compra uma etiqueta e não confirma postagem.
 saved.operation=lease
 assert.equal((await worker.syncLegacyShipments(db,'store@example.com')).failed,1)
 assert.equal(requests.length,1);assert.equal(finishes[1].p_error,'LEGACY_TRACKING_SYNC_FAILED');assert.equal(finishes[1].p_status,undefined)
})
test('missing optional legacy tracking migration does not break tracking of current orders',async()=>{
 const worker=load('src/lib/legacy-tracking-server.ts',{'./admin-sales':{},'./label-cart-server':{},'./label-purchase-server':{}})
 const result=await worker.syncLegacyShipments({rpc:async()=>({error:{code:'PGRST202'}})},'store@example.com')
 assert.equal(result.installed,false);assert.equal(result.failed,0)
})
