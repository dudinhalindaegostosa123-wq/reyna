const {test}=require('node:test'),assert=require('node:assert/strict')
const {randomUUID}=require('node:crypto'),{load}=require('./helpers/load.cjs')
const colors=load('src/lib/stone-colors.ts')
test('admin color changes write membership only, preserve products and invalidate storefront caches',async()=>{
 const product=randomUUID(),actor=randomUUID(),writes=[],invalidations=[]
 let record={id:product,status:'published',visibility:'visible'},auth=0
 const db={from(table){
  if(table==='products')return {select(){return this},eq(){return this},async maybeSingle(){return {data:record,error:null}}}
  assert.equal(table,'serenity_stone_color_overrides_v1')
  return {async upsert(row){writes.push(row);return {error:null}},delete(){writes.push({mode:'auto'});return {error:null,eq(){return this}}}}
 }}
 const api=load('src/app/admin/cores/actions.ts',{'@/lib/admin-auth':{adminDatabase:async()=>{auth++;return {db,user:{id:actor}}}},'@/lib/stone-definitions-server':{getStoneDefinitions:async()=>colors.STONE_COLORS},'next/cache':{revalidateTag:value=>invalidations.push(value),revalidatePath:value=>invalidations.push(value)}})
 assert.deepEqual(JSON.parse(JSON.stringify(await api.setStoneMembership('verde',product,'exclude'))),{})
 assert.equal(writes[0].included,false);assert.equal(writes[0].updated_by,actor)
 await api.setStoneMembership('rosa',product,'include');assert.equal(writes[1].included,true)
 await api.setStoneMembership('verde',product,'auto');assert.equal(writes[2].mode,'auto')
 const count=writes.length;record={...record,visibility:'hidden'}
 assert.ok((await api.setStoneMembership('verde',product,'include')).error)
 assert.ok((await api.setStoneMembership('invalid',product,'exclude')).error)
 assert.equal(writes.length,count);assert.equal(auth,5)
 assert.ok(invalidations.includes('catalog'));assert.ok(invalidations.includes('/cores/verde'))
})

test('batch changes authenticate and save atomically, custom colors validate names and reject collisions',async()=>{
 const ids=[randomUUID(),randomUUID()],actor=randomUUID(),writes=[]
 const definitions=[...colors.STONE_COLORS,{id:'opala-branca',name:'Opala branca',color:'#ffffff'}]
 const db={from(table){return {select(){return this},async in(){return {data:ids.map(id=>({id,status:'published',visibility:'visible'})),error:null}},async upsert(rows){writes.push({table,rows});return {error:null}},async insert(row){writes.push({table,row});return {error:row.id==='verde'?{code:'23505'}:null}}}}}
 const api=load('src/app/admin/cores/actions.ts',{'@/lib/admin-auth':{adminDatabase:async()=>({db,user:{id:actor}})},'@/lib/stone-definitions-server':{getStoneDefinitions:async()=>definitions},'next/cache':{revalidateTag(){},revalidatePath(){}}})
 assert.ok(!(await api.setStoneMembershipBatch('opala-branca',ids,'include')).error)
 assert.equal(writes[0].rows.length,2);assert.ok(writes[0].rows.every(row=>row.updated_by===actor && row.included))
 assert.ok((await api.setStoneMembershipBatch('opala-branca',['bad'],'include')).error)
 assert.equal(writes.length,1)
 assert.equal((await api.createStoneColor('Opala branca','#ffffff')).id,'opala-branca')
 assert.ok((await api.createStoneColor('Verde','#ffffff')).error)
 assert.ok((await api.createStoneColor('x','invalid')).error)
})
