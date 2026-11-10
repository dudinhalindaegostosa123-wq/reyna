const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
test('admin batch checks provider facts for recent unfinished production attempts without creating another charge',async()=>{
 const calls=[],updates=[],filters=[]
 const db={from(table){assert.equal(table,'serenity_checkout_payments_v2');let write=false,id;const query={select(){return query},eq(key,value){filters.push([key,value]);if(key==='id')id=value;return query},in(key,value){filters.push([key,Array.from(value)]);return query},neq(key,value){filters.push([key,value]);return query},gte(key,value){filters.push([key,value]);return query},order(){return query},limit(count){assert.equal(count,20);return query},update(){write=true;return query},then(resolve){if(write)updates.push(id);return Promise.resolve({data:write?null:[{id:'approved'},{id:'pending'},{id:'failed'}],error:null}).then(resolve)}};return query}}
 const actions=load('src/app/admin/pagamentos/actions.ts',{'@/lib/admin-auth':{adminDatabase:async()=>({db})},'next/navigation':{redirect:url=>{throw Error(url)}},'@/lib/payment-processing-server':{reconcilePaymentAttempt:async(_db,id,source)=>{calls.push([id,source]);if(id==='failed')throw Error('MP_QUERY_FAILED');return {found:true,review:id==='pending'}},paymentFailureCode:()=> 'MP_QUERY_FAILED'}})
 await assert.rejects(actions.reconcileRecentAdminPayments(),/consultados=2&conferir=1&falhas=1/)
 assert.deepEqual(calls,[['approved','admin'],['pending','admin'],['failed','admin']]);assert.deepEqual(updates,['approved','pending','failed'])
 assert.ok(filters.some(([key,value])=>key==='environment' && value==='production'))
 assert.ok(filters.some(([key,value])=>key==='created_at' && new Date(value).getTime()>Date.now()-73*60*60*1000))
})
test('admin batch never accesses payments when admin authorization fails',async()=>{
 let queried=false
 const actions=load('src/app/admin/pagamentos/actions.ts',{'@/lib/admin-auth':{adminDatabase:async()=>{throw Error('ADMIN_LOGIN')}},'next/navigation':{redirect(){queried=true}},'@/lib/payment-processing-server':{reconcilePaymentAttempt(){queried=true},paymentFailureCode(){}}})
 await assert.rejects(actions.reconcileRecentAdminPayments(),/ADMIN_LOGIN/);assert.equal(queried,false)
})
