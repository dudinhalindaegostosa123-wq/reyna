const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const {readFetch}=load('src/lib/read-fetch.ts')
test('transient reads recover once, forwarding headers and cache settings',async()=>{
 let calls=0
 const response=await readFetch('https://fixture.example',{headers:{apikey:'fixture'},cache:'no-store'},async(_url,init)=>{
  calls++;assert.equal(init.headers.apikey,'fixture');assert.equal(init.cache,'no-store')
  if(calls===1)throw Object.assign(new Error('fetch failed'),{cause:{code:'UND_ERR_SOCKET'}})
  return new Response('ok')
 })
 assert.equal(await response.text(),'ok');assert.equal(calls,2)
})
test('writes, authentication errors and caller cancellation never retry',async()=>{
 let calls=0;const failure=async()=>{calls++;throw new Error('fetch failed')}
 await assert.rejects(readFetch('https://fixture.example',{method:'POST'},failure));assert.equal(calls,1)
 calls=0;await readFetch('https://fixture.example',{},async()=>{calls++;return new Response('',{status:401})});assert.equal(calls,1)
 calls=0;const controller=new AbortController();controller.abort()
 await assert.rejects(readFetch('https://fixture.example',{signal:controller.signal},failure));assert.equal(calls,1)
})
test('upstream read failures retry only once and never hide a persistent failure',async()=>{
 let calls=0;const response=await readFetch('https://fixture.example',{},async()=>{calls++;return new Response('',{status:503})})
 assert.equal(response.status,503);assert.equal(calls,2)
 calls=0;await assert.rejects(readFetch('https://fixture.example',{},async()=>{calls++;throw new Error('fetch failed')}));assert.equal(calls,2)
})
