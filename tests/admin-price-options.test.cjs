const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const {readAdminPriceOptions}=load('src/lib/admin-price-options.ts')
test('price panel reads actual categories without requiring catalog view columns and handles failures',async()=>{
 function db(result){return {from(){return {select(columns){assert.equal(columns,'id,material,categories');return this},eq(){return this},neq(){return this},order(){return this},async range(){return result}}}}}
 const result=await readAdminPriceOptions(db({data:[{material:'Titânio',categories:['Joias para Orelha',null]}],error:null}))
 assert.equal(result.error,null);assert.equal(result.categories[0].slug,'joias-para-orelha')
 const failed=await readAdminPriceOptions(db({data:null,error:{message:'offline'}}))
 assert.ok(failed.error);assert.equal(failed.categories.length,0)
})
