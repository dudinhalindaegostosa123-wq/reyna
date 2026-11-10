const {test}=require('node:test')
const assert=require('node:assert/strict')
const {load}=require('./helpers/load.cjs')
test('batch preparation uses saved data and one quoted service, checks cost, and never buys automatically',async()=>{
 let state='empty',calls=[],choices=[{id:'quote'}],issues=[],failed=false
 const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{state},error:null})}
 const api=load('src/app/admin/frete/bulk-purchase-actions.ts',{
  'next/cache':{revalidatePath(){}},'@/lib/admin-auth':{adminDatabase:async()=>({db:{from:()=>q}})},
  '@/lib/label-scope-server':{scopedLabelDatabase:db=>db},'@/lib/admin-sales':{saleUuid:()=>true},
  '@/lib/label-purchase-server':{purchaseSource:()=>{throw Error('unexpected purchase')},purchaseError:()=> 'error'},
  './quick-label-actions':{loadQuickLabel:async()=>({error:'',job:{state:'quoted',stale:false,operation:'op',choices,issues}})},
  './cart-actions':{labelJobAction:async(id,command,data,scope)=>{calls.push(command);assert.equal(data.get('selected'),'quote');assert.equal(scope,'legacy');return failed ? {error:'Recusado'} : {error:'',view:{state:'prepared'}}}},
  './purchase-actions':{labelPurchaseAction:async(id,command)=>{calls.push(command);assert.equal(command,'check');return {error:'',view:{phase:'review'}}}},
 },{},{FormData})
 assert.equal((await api.bulkLabelPurchaseAction('id','check','',undefined,'legacy')).view.phase,'review')
 assert.deepEqual(calls,['prepare','check'])
 calls=[];choices=[{id:'q1'},{id:'q2'}];assert.ok((await api.bulkLabelPurchaseAction('id','check')).error);assert.deepEqual(calls,[])
 choices=[{id:'quote'}];issues=['Falta telefone'];assert.match((await api.bulkLabelPurchaseAction('id','check')).error,/telefone/);assert.deepEqual(calls,[])
 issues=[];failed=true;assert.equal((await api.bulkLabelPurchaseAction('id','check','',undefined,'legacy')).error,'Recusado');assert.deepEqual(calls,['prepare'])
 calls=[];state='uncertain';assert.ok((await api.bulkLabelPurchaseAction('id','check')).error);assert.deepEqual(calls,[])
})
