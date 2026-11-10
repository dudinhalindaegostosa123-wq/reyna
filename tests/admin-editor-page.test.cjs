const {test}=require('node:test'),assert=require('node:assert/strict')
const {renderer,nodes}=require('./helpers/render.cjs')
const id='04ee1f10-9cca-4b01-9cef-d152374bc0b3'
function fixture({rpcError=null,data={product:{id,name:'Argola'},variants:[],media:[],version:'version'},inventoryError=null}={}){
 const calls=[]
 const view=renderer('src/app/admin/produtos/[id]/page.tsx',{
  'next/link':{default:'Link'},'next/navigation':{notFound(){throw new Error('NOT_FOUND')}},
  '@/lib/admin-auth':{adminDatabase:async()=>{calls.push('authenticate');return {db:{rpc:async(name,args)=>{assert.equal(name,'serenity_admin_read_editor');assert.equal(args.p_product_id,id);return {error:rpcError,data}}}}}},
  '@/lib/admin-classification':{getAdminClassification:async()=>({categoryLabels:{},groups:[],materials:[],tags:[]})},
  '@/lib/admin-inventory':{getAdminInventory:async()=>{if(inventoryError)throw new Error(inventoryError);return new Map()}},
  './UnifiedProductEditor':{default:'Editor'},'@/components/admin/AdminCatalogSetupNotice':{default:'SetupNotice'},
 },{Error})
 // renderer uses a deliberately empty env; storage URL is checked only after authentication.
 return {calls,view}
}
test('a missing editor RPC shows installation guidance rather than a not-found page',async()=>{
 const {view,calls}=fixture({rpcError:{code:'PGRST202'}})
 const tree=await view.render({params:{id}})
 assert.equal(calls[0],'authenticate')
 assert.equal(nodes(tree,n=>n.type==='SetupNotice').length,1)
})
test('only a missing product is treated as a not-found record',async()=>{
 await assert.rejects(fixture({data:null}).view.render({params:{id}}),/NOT_FOUND/)
 await assert.rejects(fixture({rpcError:{code:'42501'}}).view.render({params:{id}}),/ADMIN_EDITOR_READ/)
})
