const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const api=load('src/lib/checkout-related-orders.ts')
const old={id:'old',token_hash:'a'.repeat(64),email:'cliente@example.com',environment:'production',created_at:'2026-11-09T22:57:00Z',updated_at:'2026-11-09T22:57:23Z',items:[{slug:'nipple',name:'Nipple',quantity:2}]}
const next={...old,id:'new',created_at:'2026-11-09T23:01:36Z',updated_at:'2026-11-09T23:02:15Z'}
const session={id:'new',order_id:'order',state:'converted',environment:'production',created_at:'2026-11-09T23:02:20Z',customer_snapshot:{email:'cliente@example.com'},cart_items:old.items}
const order={id:'order',number:88,status:'paid'}
test('the confirmed two-attempt case is labeled as related without modifying either record',()=>{
 const original=JSON.stringify({old,next,session,order})
 assert.deepEqual(JSON.parse(JSON.stringify(api.matchRelatedPurchase(old,next,session,order))),{orderId:'order',number:88})
 assert.equal(JSON.stringify({old,next,session,order}),original)
 assert.ok(api.matchRelatedPurchase({...old,email:' CLIENTE@example.com '},next,session,order))
 assert.ok(api.matchRelatedPurchase(old,{...next,items:[{slug:'nipple',quantity:1},{slug:'nipple',quantity:1}]},session,order))
})
test('same email alone never links a different visitor, cart, environment, old purchase or non-paid order',()=>{
 for(const candidate of [
  {...next,token_hash:'b'.repeat(64)},
  {...next,email:'outro@example.com'},
  {...next,items:[{slug:'argola',quantity:2}]},
  {...next,items:[{slug:'nipple',quantity:1}]},
  {...next,environment:'test'},
  {...next,created_at:'2026-11-09T21:00:00Z'},
  {...next,created_at:'2026-11-11T23:01:36Z'},
 ])assert.equal(api.matchRelatedPurchase(old,candidate,session,order),null)
 for(const bad of [
  {...session,state:'pending'},
  {...session,environment:'test'},
  {...session,created_at:'2026-11-09T22:56:00Z'},
  {...session,order_id:'other'},
  {...session,customer_snapshot:{email:'different@example.com'}},
  {...session,cart_items:[{slug:'other',quantity:2}]},
 ])assert.equal(api.matchRelatedPurchase(old,next,bad,order),null)
 for(const status of ['pending','cancelled','refunded'])assert.equal(api.matchRelatedPurchase(old,next,session,{...order,status}),null)
 assert.equal(api.matchRelatedPurchase({...old,token_hash:undefined},next,session,order),null)
 assert.equal(api.matchRelatedPurchase({...old,updated_at:'2026-11-09T23:30:00Z'},next,session,order),null)
})
function database(records,errorTable){
 const reads=[]
 return {reads,from(table){let rows=[...(records[table] || [])];const q={
  select(){return q},in(key,values){rows=rows.filter(row=>values.includes(key==='customer_snapshot->>email'?row.customer_snapshot?.email:row[key]));return q},eq(key,value){rows=rows.filter(row=>row[key]===value);return q},
  gte(key,value){rows=rows.filter(row=>row[key]>=value);return q},lte(key,value){rows=rows.filter(row=>row[key]<=value);return q},order(){return q},
  async range(from,to){reads.push({table,from,to});return table===errorTable?{data:null,error:{message:'offline'}}:{data:rows.slice(from,to+1),error:null}},
 };return q}}
}
test('the lookup finds the paid order beyond 500 session rows and fails without partial matches',async()=>{
 const candidates=[...Array.from({length:501},(_,i)=>({...next,id:'unpaid-'+i})),next]
 const data={serenity_checkout_contacts_v1:candidates,serenity_checkout_sessions_v2:[...candidates.slice(0,501).map(row=>({...session,id:row.id,order_id:'unpaid-'+row.id})),session],serenity_orders:[order]}
 const db=database(data),result=await api.readRelatedPurchases(db,[old])
 assert.equal(result.error,false);assert.equal(result.purchases.get('old').number,88)
 assert.ok(db.reads.some(row=>row.table==='serenity_checkout_sessions_v2' && row.from===500))
 for(const table of Object.keys(data)){
  const failed=await api.readRelatedPurchases(database(data,table),[old]);assert.equal(failed.error,true);assert.equal(failed.purchases.size,0)
 }
})

test('a paid order for the same email gets a qualified notice even when browser/cart matching is unavailable',async()=>{
 const different={...next,token_hash:'b'.repeat(64),items:[{slug:'changed',quantity:1}]}
 const data={serenity_checkout_contacts_v1:[different],serenity_checkout_sessions_v2:[{...session,cart_items:different.items}],serenity_orders:[order]}
 const result=await api.readRelatedPurchases(database(data),[{...old,token_hash:undefined}])
 assert.equal(result.error,false);assert.equal(result.purchases.get('old').number,88);assert.equal(result.purchases.get('old').confidence,'email')
 assert.equal(api.matchRelatedPurchase(old,different,{...session,cart_items:different.items},order),null)
 assert.equal(api.matchSameEmailPurchase(old,session,{...order,status:'refunded'}),null)
 assert.equal(api.matchSameEmailPurchase(old,{...session,customer_snapshot:{email:'other@example.com'}},order),null)
 assert.equal(api.matchSameEmailPurchase(old,{...session,environment:'test'},order),null)
})
