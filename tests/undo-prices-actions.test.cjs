const {test}=require('node:test'),assert=require('node:assert/strict')
const {randomUUID}=require('node:crypto'),{load}=require('./helpers/load.cjs')
test('undo action authenticates, validates inputs, attributes actor on server and invalidates prices only on success',async()=>{
 const calls=[],invalidations=[],actor=randomUUID(),batch=randomUUID();let authorized=true,error=null
 const {undoPrices}=load('src/app/admin/precos/actions.ts',{
  '@/lib/admin-auth':{adminDatabase:async()=>{if(!authorized)throw Error('denied');return {user:{id:actor},db:{rpc:async(...args)=>{calls.push(args);return {error}}}}}},
  'next/cache':{revalidateTag:value=>invalidations.push(value),revalidatePath:value=>invalidations.push(value)}
 })
 authorized=false;await assert.rejects(undoPrices('material',batch),/denied/);assert.equal(calls.length,0)
 authorized=true;assert.ok((await undoPrices('other',batch)).error);assert.ok((await undoPrices('category','bad')).error);assert.equal(calls.length,0)
 error={message:'PRICE_UNDO_CHANGED'};assert.match((await undoPrices('category',batch)).error,/preços mudaram/);assert.equal(invalidations.length,0)
 error=null;assert.equal((await undoPrices('material',batch)).error,undefined)
 assert.equal(calls[1][0],'serenity_undo_prices_v1');assert.equal(calls[1][1].p_actor,actor);assert.equal(calls[1][1].p_batch,batch)
 assert.deepEqual(invalidations,['catalog','/google-merchant.xml','/admin/precos'])
})
