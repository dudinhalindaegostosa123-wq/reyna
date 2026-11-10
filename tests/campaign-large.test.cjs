const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./helpers/load.cjs')
const pagination=load('src/lib/campaign-pagination.ts'),ui=load('src/lib/promotion-ui.ts')
function actions(db){return load('src/app/admin/campanhas/actions.ts',{
 '@/lib/campaign-pagination':pagination,'@/lib/campaign-material':{},'@/lib/admin-auth':{adminDatabase:async()=>({db,user:{id:randomUUID()}})},'@/lib/promotion-ui':ui,'next/cache':{revalidatePath(){},revalidateTag(){}}
})}
test('save accepts 1201 participants in one atomic RPC and still rejects empty and duplicate entries',async()=>{
 const calls=[],api=actions({rpc:async(...args)=>{calls.push(args);return {error:null}}})
 const items=Array.from({length:1201},()=>({productId:randomUUID(),variantId:null,discountType:'percent',discountValue:'10'}))
 const input={id:randomUUID(),version:0,name:'Material completo',startsNow:true,startsLocal:'',endsLocal:'2099-01-01T00:00',items}
 assert.equal((await api.saveCampaign(input)).error,'');assert.equal(calls.length,1);assert.equal(calls[0][1].p_items.length,1201)
 assert.ok((await api.saveCampaign({...input,items:[]})).error)
 assert.match((await api.saveCampaign({...input,items:[items[0],items[0]]})).error,/repetido/);assert.equal(calls.length,1)
})
test('reload retrieves every participant and all product/variant names using bounded request chunks',async()=>{
 const records=Array.from({length:1201},(_,i)=>({product_id:'p'+i,variant_id:i%2?'v'+i:null,discount_type:'percent',discount_value:10,applied_sale_price:null}))
 const chunks=[],pages=[]
 const db={from(table){let ids=[]
  const q={select(){return q},eq(){return q},order(){return q},in(key,values){ids=values;chunks.push(values.length);return q},async single(){return {data:{id:randomUUID(),name:'Completa',status:'draft',version:1,starts_at:'2099-01-01',ends_at:'2099-01-02'}}},async range(from,to){if(table==='serenity_promotion_items'){pages.push(from);return {data:records.slice(from,to+1)}}return {data:ids.map(id=>({id,name:'Nome '+id,sku:'SKU-'+id,regular_price:100})).slice(from,to+1)}}};return q
 }}
 const result=await actions(db).loadCampaign(randomUUID())
 assert.equal(result.error,'');assert.equal(result.campaign.items.length,1201)
 assert.deepEqual(pages,[0,500,1000]);assert.ok(chunks.every(n=>n<=100))
 assert.equal(result.campaign.items[1200].productName,'Nome p1200');assert.equal(result.campaign.items[1199].variantName,'Nome v1199');assert.equal(result.campaign.items[1200].productSku,'SKU-p1200');assert.equal(result.campaign.items[1199].variantSku,'SKU-v1199')
})
test('pagination never returns earlier pages after a later read fails',async()=>{
 const result=await pagination.readCampaignPages(async from=>from===0?{data:Array(500).fill({id:'a'}),error:null}:{data:null,error:{message:'offline'}})
 assert.equal(result.data.length,0);assert.equal(result.error.message,'offline')
})
test('updated material draft retains existing participants and discount/period, adds missing targets, and never publishes or cancels',async()=>{
 const sourceId=randomUUID(),nextId=randomUUID(),currentId=randomUUID(),missingId=randomUUID(),calls=[]
 const source={id:sourceId,name:'Titânio 20% OFF',status:'published',version:1,starts_at:'2026-01-01T18:00:00-03:00',ends_at:'2099-11-07T00:00:00-03:00'}
 const records=[{product_id:currentId,variant_id:null,discount_type:'percent',discount_value:20,original_regular_price:187,applied_sale_price:149.60}]
 const db={from(table){let ids=[];const q={select(){return q},eq(){return q},order(){return q},in(key,value){ids=value;return q},async single(){return {data:source}},async range(from,to){return {data:table==='serenity_promotion_items'?records.slice(from,to+1):ids.map(id=>({id,name:'Peça',regular_price:187})).slice(from,to+1)}}};return q},async rpc(...args){calls.push(args);return {error:null}}}
 const api=load('src/app/admin/campanhas/actions.ts',{
  '@/lib/campaign-pagination':pagination,'@/lib/campaign-material':{readMaterialCampaignTargets:async()=>({error:'',targets:[{productId:currentId,variantId:null},{productId:missingId,variantId:null}]})},
  '@/lib/admin-auth':{adminDatabase:async()=>({db,user:{id:randomUUID()}})},'@/lib/promotion-ui':ui,'next/cache':{revalidatePath(){},revalidateTag(){}}
 })
 const result=await api.prepareMaterialCampaign(sourceId,'Titânio Natural',nextId)
 assert.equal(result.error,'');assert.equal(result.added,1)
 assert.equal(calls.length,1);assert.equal(calls[0][0],'serenity_promotion_save_draft')
 const saved=calls[0][1]
 assert.equal(saved.p_items.length,2);assert.ok(saved.p_items.every(item=>item.discount_type==='percent' && item.discount_value==='20'))
 assert.equal(saved.p_ends,'2099-11-07T03:00:00.000Z')
 source.status='cancelled';assert.ok((await api.prepareMaterialCampaign(sourceId,'Titânio',randomUUID())).error);assert.equal(calls.length,1)
})

test('category recovery: updated material draft retains existing participants and discount/period, adds missing targets, and never publishes or cancels',async()=>{
 const sourceId=randomUUID(),nextId=randomUUID(),currentId=randomUUID(),missingId=randomUUID(),calls=[]
 const source={id:sourceId,name:'Titânio 20% OFF',status:'published',version:1,starts_at:'2026-01-01T18:00:00-03:00',ends_at:'2099-11-07T00:00:00-03:00'}
 const records=[{product_id:currentId,variant_id:null,discount_type:'percent',discount_value:20,original_regular_price:187,applied_sale_price:149.60}]
 const db={from(table){let ids=[];const q={select(){return q},eq(){return q},order(){return q},in(key,value){ids=value;return q},async single(){return {data:source}},async range(from,to){return {data:table==='serenity_promotion_items'?records.slice(from,to+1):ids.map(id=>({id,name:'Peça',regular_price:187})).slice(from,to+1)}}};return q},async rpc(...args){calls.push(args);return {error:null}}}
 const api=load('src/app/admin/campanhas/actions.ts',{
  '@/lib/campaign-pagination':pagination,'@/lib/campaign-material':{readCategoryCampaignTargets:async()=>({error:'',targets:[{productId:currentId,variantId:null},{productId:missingId,variantId:null}]})},
  '@/lib/admin-auth':{adminDatabase:async()=>({db,user:{id:randomUUID()}})},'@/lib/promotion-ui':ui,'next/cache':{revalidatePath(){},revalidateTag(){}}
 })
 const result=await api.prepareCategoryCampaign(sourceId,'argolas',nextId)
 assert.equal(result.error,'');assert.equal(result.added,1)
 assert.equal(calls.length,1);assert.equal(calls[0][0],'serenity_promotion_save_draft')
 const saved=calls[0][1]
 assert.equal(saved.p_items.length,2);assert.ok(saved.p_items.every(item=>item.discount_type==='percent' && item.discount_value==='20'))
 assert.equal(saved.p_ends,'2099-11-07T03:00:00.000Z')
 source.status='cancelled';assert.ok((await api.prepareCategoryCampaign(sourceId,'argolas',randomUUID())).error);assert.equal(calls.length,1)
})
