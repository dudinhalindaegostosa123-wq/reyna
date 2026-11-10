const {test}=require('node:test'),assert=require('node:assert/strict')
const {load}=require('./helpers/load.cjs')
const {readMaterialCampaignTargets,readCategoryCampaignTargets}=load('src/lib/campaign-material.ts',{'./campaign-pagination':load('src/lib/campaign-pagination.ts'),'./campaign-material-match':load('src/lib/campaign-material-match.ts')})
function database(pages,variants={data:[]}){
 const calls=[]
 return {calls,from(table){let ids
  const q={select(){return q},eq(key,value){calls.push([table,key,value]);return q},neq(key,value){calls.push([table,key,value]);return q},order(){return q},in(key,value){ids=value;calls.push([table,key,value]);return q},async range(start,end){calls.push([table,'range',start,end]);return table==='products'?(pages[start] || {data:[]}):(()=>{const result=typeof variants==='function'?variants(ids):variants;return {...result,data:result.data?.slice(start,end+1)}})()}}
  return q
 }}
}
const simple=(id,price=100)=>({id,name:id,material:'Titânio',product_type:'simple',regular_price:price})
test('material loads all pages, simple products and enabled variants with valid prices',async()=>{
 const db=database({0:{data:Array.from({length:100},(_,i)=>simple('p'+i))},100:{data:[{id:'parent',name:'Argola',material:'Titânio',product_type:'variable'},simple('no-price',null)]}}, {data:[{id:'v1',product_id:'parent',name:'Azul',sku:'SKU',regular_price:'50'},{id:'v2',product_id:'parent',regular_price:null}]})
 const result=await readMaterialCampaignTargets(db,'Titânio')
 assert.equal(result.error,'');assert.equal(result.targets.length,101)
 assert.equal(result.targets[100].variantId,'v1');assert.equal(result.targets[100].regularPrice,50)
 assert.equal(result.targets[100].productName,'Argola')
 assert.ok(!db.calls.some(c=>c[1]==='material'))
 assert.ok(db.calls.some(c=>c[1]==='status' && c[2]==='published'))
 assert.ok(db.calls.some(c=>c[1]==='visibility' && c[2]==='hidden'))
 assert.ok(db.calls.some(c=>c[0]==='product_variants' && c[1]==='enabled' && c[2]===true))
 assert.ok(db.calls.some(c=>c[1]==='range' && c[2]===100))
})
test('material loads more than 500 participants, paginates variants, and never returns partial data on errors',async()=>{
 const pages={};for(let offset=0;offset<600;offset+=100)pages[offset]={data:Array.from({length:100},(_,i)=>simple('p'+(offset+i)))}
 const many=await readMaterialCampaignTargets(database(pages),'Titânio');assert.equal(many.error,'');assert.equal(many.targets.length,600)
 const variants=await readMaterialCampaignTargets(database({0:{data:[{id:'p',name:'Argola',material:'Titânio',product_type:'variable'}]}},{data:Array.from({length:1201},(_,i)=>({id:'v'+i,product_id:'p',regular_price:50}))}),'Titânio')
 assert.equal(variants.error,'');assert.equal(variants.targets.length,1201)
 for(const db of [database({0:{error:{message:'offline'}}}),database({0:{data:[{id:'p',material:'Ouro',product_type:'variable'}]}},{error:{message:'offline'}})]){
  const result=await readMaterialCampaignTargets(db,'Ouro');assert.ok(result.error);assert.equal(result.targets.length,0)
 }
})
test('material campaign action requires an administrator and validates material before catalog reads',async()=>{
 let authorized=false,reads=0
 const {campaignMaterialTargets}=load('src/app/admin/campanhas/actions.ts',{
  '@/lib/campaign-pagination':load('src/lib/campaign-pagination.ts'),
  '@/lib/admin-auth':{adminDatabase:async()=>{if(!authorized)throw Error('denied');return {db:{}}}},
  '@/lib/campaign-material':{readMaterialCampaignTargets:async(db,material)=>{reads++;return {error:'',targets:[{productName:material}]}}},
  '@/lib/promotion-ui':{},'next/cache':{}
 })
 await assert.rejects(campaignMaterialTargets('Titânio'),/denied/)
 authorized=true
 assert.ok((await campaignMaterialTargets('')).error);assert.ok((await campaignMaterialTargets('a'.repeat(181))).error);assert.equal(reads,0)
 const result=await campaignMaterialTargets(' Titânio ');assert.equal(result.targets[0].productName,'Titânio');assert.equal(reads,1)
})
test('scan continues past pages of other materials and includes natural titanium variants without including gold coating',async()=>{
 const db=database({
  0:{data:Array.from({length:100},(_,i)=>({...simple('other'+i),material:'Ouro 18K'}))},
  100:{data:[{...simple('lua'),material:'',name:'TN1057 Lua Crescente — Titânio Grau Implante (ASTM F136)'},{id:'flor',name:'Flor Titânio Grau Implante',material:'',tags:['titanio'],product_type:'variable'}, {...simple('gold'),material:'Titânio Revestido Ouro 18K'}]},
 },{data:[{id:'flor-azul',product_id:'flor',name:'Azul',regular_price:187}]})
 const result=await readMaterialCampaignTargets(db,'Titânio Cor Natural')
 assert.equal(result.error,'');assert.deepEqual(Array.from(result.targets,target=>target.productId),['lua','flor'])
})

test('category selection includes every simple/active variation from the actual category, including new products',async()=>{
 const db=database({0:{data:[
  {...simple('new-tr'),categories:['Argólas','Novidades']},
  {...simple('old-pvd'),categories:['Argolas']},
  {...simple('not-argolas'),categories:['Conch']},
  {...simple('no-price',null),categories:['Argolas']},
  {id:'parent',name:'Argola nova',categories:['Argolas'],product_type:'variable'},
 ]}}, {data:[{id:'v1',product_id:'parent',name:'6mm',regular_price:150},{id:'v2',product_id:'parent',regular_price:null}]})
 const result=await readCategoryCampaignTargets(db,'argolas')
 assert.equal(result.error,'')
 assert.deepEqual(Array.from(result.targets,item=>item.productId),['new-tr','old-pvd','parent'])
 assert.equal(result.targets[2].variantId,'v1')
 assert.ok(db.calls.some(call=>call[0]==='product_variants' && call[1]==='enabled' && call[2]===true))
 const failed=await readCategoryCampaignTargets(database({0:{error:{message:'offline'}}}),'argolas')
 assert.ok(failed.error);assert.equal(failed.targets.length,0)
})

test('category campaign action authenticates first and validates the requested category',async()=>{
 let allowed=false,reads=0
 const {campaignCategoryTargets}=load('src/app/admin/campanhas/actions.ts',{
  '@/lib/campaign-pagination':load('src/lib/campaign-pagination.ts'),
  '@/lib/admin-auth':{adminDatabase:async()=>{if(!allowed)throw Error('denied');return {db:{}}}},
  '@/lib/campaign-material':{readCategoryCampaignTargets:async(db,category)=>{reads++;return {error:'',targets:[{productName:category}]}}},
  '@/lib/promotion-ui':{},'next/cache':{}
 })
 await assert.rejects(campaignCategoryTargets('argolas'),/denied/)
 allowed=true;assert.ok((await campaignCategoryTargets('')).error);assert.equal(reads,0)
 assert.equal((await campaignCategoryTargets(' argolas ')).targets[0].productName,'argolas')
})
