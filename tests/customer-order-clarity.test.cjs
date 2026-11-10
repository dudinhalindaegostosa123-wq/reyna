const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs'),{renderer,nodes}=require('./helpers/render.cjs')
const status=load('src/lib/customer-order-status.ts')
test('customer status requires actual shipment evidence, preserves financial exceptions and does not confuse completion with delivery',()=>{
 for(const carrier of ['','generated','released','received'])assert.equal(status.customerOrderStatus({status:'paid',carrier,trackingCode:'BR123'}).title,'Pedido recebido e em preparação')
 assert.equal(status.customerOrderStatus({status:'wc-processing',carrier:'posted',trackingCode:'BR123'}).title,'Pedido enviado')
 assert.equal(status.customerOrderStatus({status:'paid',workflow:'completed'}).title,'Pedido enviado')
 assert.equal(status.customerOrderStatus({status:'wc-completed'}).title,'Pedido concluído')
 assert.equal(status.customerOrderStatus({status:'paid',carrier:'delivered'}).title,'Pedido entregue')
 for(const payment of ['wc-pending','wc-cancelled','wc-failed','wc-refunded'])assert.equal(status.customerOrderStatus({status:payment,carrier:'posted',trackingCode:'BR123'}).code,'')
 assert.equal(status.customerOrderStatus({status:'paid',carrier:'posted',trackingCode:'<unsafe>'}).code,'')
})
test('tracking code is copyable and links to the tracking service; preparation does not expose a code prematurely',async()=>{
 let copied=''
 const view=renderer('src/components/account/CustomerShipmentStatus.tsx',{'@/lib/customer-order-status':status},{navigator:{clipboard:{writeText:async value=>{copied=value}}}})
 let tree=view.render({status:'paid',carrier:'posted',trackingCode:'BR123'})
 const button=nodes(tree,n=>n.type==='button')[0];await button.props.onClick()
 assert.equal(copied,'BR123');tree=view.render({status:'paid',carrier:'posted',trackingCode:'BR123'});assert.ok(JSON.stringify(tree).includes('Copiado'))
 assert.equal(nodes(tree,n=>n.type==='a')[0].props.href,'https://www.melhorrastreio.com.br/')
 tree=view.render({status:'paid',carrier:'generated',trackingCode:'BR123'});assert.equal(nodes(tree,n=>n.type==='button').length,0)
})
test('historical purchases use concise cards with collapsed details, one delivery address and the same customer status component',async()=>{
 const order={old_id:24431,original_status:'wc-processing',created_at:'2026-10-19T21:04:00Z',total:148.9,payload:{entrega_endereco:'Rua fixture',entrega_cidade:'São Paulo',entrega_pais:'BR',endereco:'Rua cobrança fixture'}}
 const chain=data=>({select(){return this},eq(){return this},order(){return this},in(){return this},range:async()=>({data,count:data.length,error:null}),then(resolve){return Promise.resolve({data,error:null}).then(resolve)}})
 const auth={rpc:async name=>name.includes('link')?{error:null}:{data:[{legacy_id:24431,carrier_status:'posted',tracking_code:'BR123'}]},from:table=>chain(table.includes('items')?[{order_id:24431,kind:'line_item',name:'Joia fixture',payload:{quantidade:'1',total:'148.90'}}]:[order])}
 const view=renderer('src/components/account/LegacyHistory.tsx',{'./CustomerShipmentStatus':{default:'CustomerShipmentStatus'},'next/link':{default:'Link'},'@/lib/order-item-options':load('src/lib/order-item-options.ts'),'@/lib/legacy-order-display':load('src/lib/legacy-order-display.ts'),'next/navigation':{redirect:()=>{throw Error('unexpected redirect')}},'@/lib/customer-auth':{customerAuth:()=>auth}})
 const tree=await view.render({userId:'10000000-0000-4000-8000-000000000001',primary:true}),content=JSON.stringify(tree)
 assert.ok(content.includes('Meus pedidos'));assert.ok(!content.includes('migração'));assert.ok(!content.includes('Endereço de cobrança'));assert.ok(!content.includes('Rua cobrança fixture'));assert.ok(!content.includes('Pedido antigo'))
 assert.equal(nodes(tree,n=>n.type==='details')[0].props.open,undefined)
 assert.equal(nodes(tree,n=>n.type==='CustomerShipmentStatus')[0].props.carrier,'posted')
})
test('email action remains enabled at rest and shows a clear pending state during submission',()=>{
 let pending=false
 const view=renderer('src/components/admin/EmailActionButton.tsx',{'react-dom':{useFormStatus:()=>({pending})}})
 let tree=view.render({children:'Atualizar rastreio e avisos',pendingLabel:'Atualizando rastreio…'})
 assert.equal(tree.props.type,'submit');assert.equal(tree.props.disabled,false)
 pending=true;tree=view.render({children:'Atualizar rastreio e avisos',pendingLabel:'Atualizando rastreio…'});assert.equal(tree.props.disabled,true);assert.ok(JSON.stringify(tree).includes('Atualizando rastreio…'))
})
