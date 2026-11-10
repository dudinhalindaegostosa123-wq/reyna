const {test}=require('node:test'),assert=require('node:assert/strict')
const {load}=require('./helpers/load.cjs')
const {promotionPercent}=load('src/lib/promotion.ts')
test('promotion badge uses current and previous prices, matching the 25 to 16 example',()=>{
 assert.equal(promotionPercent(16,25),36)
 assert.equal(promotionPercent(86.63,100),13.3)
 assert.equal(promotionPercent(0,25),100)
 // Optional services added to both prices reduce the effective discount.
 assert.equal(promotionPercent(21,30),30)
 for(const [price,original,available] of [[25,25,true],[30,25,true],[16,undefined,true],[16,25,false],[-1,25,true],[NaN,25,true],[16,Infinity,true],[0,0,true]])assert.equal(promotionPercent(price,original,available),null)
})
