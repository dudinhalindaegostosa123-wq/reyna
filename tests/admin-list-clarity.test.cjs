const {test}=require('node:test'),assert=require('node:assert/strict'),{renderer,nodes}=require('./helpers/render.cjs'),{load}=require('./helpers/load.cjs')
const id='11111111-1111-4111-8111-111111111111'
const sales=load('src/lib/admin-sales.ts')
const financial=load('src/lib/admin-sales-summary.ts')
const unavailableSummary={salesPeriod:financial.salesPeriod,readSalesSummary:async()=>null}
const text=tree=>JSON.stringify(tree)
test('order list stays usable when the separate financial summary fails, preserving active filter pagination',async()=>{
 const row={id,number:13,created_at:'2026-10-26T12:00:00Z',status:'paid',workflow_stage:'paid',customer_snapshot:{name:'Cliente fixture'},total:100,source:'site',shipping_pending:false}
 const chain={select(){return chain},eq(){return chain},or(){return chain},gte(){return chain},lt(){return chain},order(){return chain},range:async()=>({data:[row],count:30,error:null})}
 const view=renderer('src/app/admin/pedidos/page.tsx',{'next/link':{default:'Link'},'next/navigation':{redirect:()=>{throw new Error('Unexpected redirect')}},'@/lib/admin-auth':{adminDatabase:async()=>({db:{from:()=>chain,rpc:async()=>({data:null,error:{code:'fixture'}})}})},'@/lib/admin-sales-summary':unavailableSummary,'@/lib/admin-sales':sales,'@/lib/order-workflow':load('src/lib/order-workflow.ts')})
 const tree=await view.render({searchParams:{q:'Cliente',stage:'paid',source:'site'}})
 assert.ok(text(tree).includes('Cliente fixture'));assert.ok(text(tree).includes('Resumo financeiro indisponível'))
 const next=nodes(tree,n=>n.type==='Link'&&typeof n.props.href==='string'&&n.props.href.includes('page=2'))[0]
 const url=new URL(next.props.href,'https://fixture.example');assert.equal(url.searchParams.get('q'),'Cliente');assert.equal(url.searchParams.get('stage'),'paid');assert.equal(url.searchParams.get('source'),'site')
})
test('customer creation is explicit instead of showing an empty editable form during every lookup',async()=>{
 const chain={select(){return chain},order(){return chain},range:async()=>({data:[],count:0,error:null})}
 const view=renderer('src/app/admin/clientes/page.tsx',{'next/link':{default:'Link'},'next/navigation':{redirect:()=>{throw new Error('Unexpected redirect')}},'@/lib/admin-auth':{adminDatabase:async()=>({db:{from:()=>chain}})},'@/lib/admin-sales-summary':unavailableSummary,'@/lib/admin-sales':sales,'./CustomerForm':{default:'CustomerForm'}})
 assert.equal(nodes(await view.render({}),n=>n.type==='CustomerForm').length,0)
 assert.equal(nodes(await view.render({searchParams:{novo:'1'}}),n=>n.type==='CustomerForm').length,1)
})

test('order search includes jewelry while preserving filters, pagination and a usable fallback before migration',async()=>{
 let table='',filters=[],missing=false
 const chain={select(){return chain},eq(){return chain},or(value){filters.push(value);return chain},gte(){return chain},lt(){return chain},order(){return chain},range:async()=>missing&&table==='serenity_admin_order_search_v1'?{data:null,error:{code:'PGRST205'}}:{data:[],count:0,error:null}}
 const view=renderer('src/app/admin/pedidos/page.tsx',{'next/link':{default:'Link'},'next/navigation':{redirect:()=>{throw new Error('Unexpected redirect')}},'@/lib/admin-auth':{adminDatabase:async()=>({db:{from:name=>(table=name,chain),rpc:async()=>({data:null,error:{code:'fixture'}})}})},'@/lib/admin-sales-summary':unavailableSummary,'@/lib/admin-sales':sales,'@/lib/order-workflow':load('src/lib/order-workflow.ts')})
 let tree=await view.render({searchParams:{q:'Argola',source:'manual'}})
 assert.equal(table,'serenity_admin_order_search_v1');assert.ok(filters[0].includes('jewelry_search.ilike.%Argola%'));assert.ok(filters[0].includes('source.neq.site'));assert.ok(filters[0].includes('customer_snapshot->>name'))
 assert.ok(text(tree).includes('nome ou código da joia'))
 missing=true;tree=await view.render({searchParams:{q:'Argola'}})
 assert.equal(table,'serenity_admin_order_workflow');assert.ok(text(tree).includes('aguarda a instalação'))
})
