const {test}=require('node:test'),assert=require('node:assert/strict')
const {renderer,nodes}=require('./helpers/render.cjs'),{load}=require('./helpers/load.cjs')
test('material selector previews targets, applies a shared discount and deduplicates campaign participants',async()=>{
 const calls=[],target={productId:'p',variantId:null,productName:'Argola',variantName:'',regularPrice:100}
 const view=renderer('src/app/admin/campanhas/CampaignEditor.tsx',{
  'next/navigation':{useRouter:()=>({refresh(){}})},'next/link':{default:'Link'},
  '@/lib/promotion-ui':load('src/lib/promotion-ui.ts'),
  './actions':{campaignMaterialTargets:async material=>{calls.push(material);return {error:'',targets:[target]}}}
 })
 const props={materials:['Titânio','Ouro']}
 let tree=view.render(props)
 const material=nodes(tree,n=>n.type==='select')[0]
 material.props.onChange({target:{value:'Titânio'}})
 const button=(tree,text)=>nodes(tree,n=>n.type==='button' && n.props.children===text)[0]
 tree=view.render(props);await button(tree,'Carregar peças do material').props.onClick()
 tree=view.render(props);assert.deepEqual(calls,['Titânio']);assert.match(JSON.stringify(tree),/Material: Titânio · 1 participantes/)
 button(tree,'Adicionar selecionados').props.onClick()
 tree=view.render(props);assert.match(JSON.stringify(tree),/90,00/)
 await button(tree,'Carregar peças do material').props.onClick()
 tree=view.render(props);button(tree,'Adicionar selecionados').props.onClick()
 tree=view.render(props);assert.match(JSON.stringify(tree),/ainda não foram adicionados/)
})
test('large campaigns keep every participant while rendering 50 at a time and edit the correct item after paging',async()=>{
 const {randomUUID}=require('node:crypto'),items=Array.from({length:1201},(_,i)=>({productId:randomUUID(),variantId:null,productName:'Peça '+i,variantName:'',regularPrice:100,discountType:'percent',discountValue:'10',appliedSalePrice:null}))
 let saved
 const initial={id:randomUUID(),name:'Grande',status:'draft',version:1,startsAt:'2099-01-01T00:00:00Z',endsAt:'2099-01-02T00:00:00Z',items}
 const view=renderer('src/app/admin/campanhas/CampaignEditor.tsx',{
  'next/navigation':{useRouter:()=>({refresh(){},replace(){}})},'next/link':{default:'Link'},'@/lib/promotion-ui':load('src/lib/promotion-ui.ts'),
  './actions':{saveCampaign:async input=>{saved=input;return {error:'saved-for-test'}}}
 })
 let tree=view.render({initial})
 assert.equal(nodes(tree,n=>n.type==='input' && n.props.maxLength===30).length,50)
 const pager=nodes(tree,n=>typeof n.type==='function' && n.type.name==='CampaignPager' && n.props.total===1201)[0]
 pager.props.onPage(24)
 tree=view.render({initial})
 const fields=nodes(tree,n=>n.type==='input' && n.props.maxLength===30)
 assert.equal(fields.length,1);fields[0].props.onChange({target:{value:'20'}})
 tree=view.render({initial});nodes(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}})
 await Promise.resolve()
 assert.equal(saved.items.length,1201);assert.equal(saved.items[0].discountValue,'10');assert.equal(saved.items[1200].discountValue,'20')
})
test('participant search finds SKU beyond the first page and edits/removes the original item without changing other participants',async()=>{
 const {randomUUID}=require('node:crypto')
 const items=Array.from({length:130},(_,i)=>({productId:randomUUID(),variantId:null,productName:i===129?'Lua Crescente':'Outra peça '+i,productSku:i===129?'TN1057':'OUT'+i,variantName:'',regularPrice:100,discountType:'percent',discountValue:'10',appliedSalePrice:null}))
 const saved=[]
 const initial={id:randomUUID(),name:'Titânio',status:'draft',version:1,startsAt:'2099-01-01T00:00:00Z',endsAt:'2099-01-02T00:00:00Z',items}
 const view=renderer('src/app/admin/campanhas/CampaignEditor.tsx',{
  'next/navigation':{useRouter:()=>({refresh(){},replace(){}})},'next/link':{default:'Link'},'@/lib/promotion-ui':load('src/lib/promotion-ui.ts'),
  './actions':{saveCampaign:async input=>{saved.push(input);return {error:'test'}}}
 })
 let tree=view.render({initial})
 const search=()=>nodes(tree,n=>n.props['aria-label']==='Buscar nos participantes')[0]
 search().props.onChange({target:{value:'tn1057'}})
 tree=view.render({initial})
 assert.match(JSON.stringify(tree),/Lua Crescente/)
 assert.equal(nodes(tree,n=>n.type==='input' && n.props.maxLength===30).length,1)
 let prevented=false;search().props.onKeyDown({key:'Enter',preventDefault(){prevented=true}});assert.ok(prevented)
 nodes(tree,n=>n.type==='input' && n.props.maxLength===30)[0].props.onChange({target:{value:'20'}})
 tree=view.render({initial});nodes(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});await new Promise(setImmediate)
 assert.equal(saved[0].items.length,130);assert.equal(saved[0].items[129].discountValue,'20');assert.equal(saved[0].items[0].discountValue,'10')
 tree=view.render({initial});nodes(tree,n=>n.type==='button' && n.props.children==='Remover')[0].props.onClick()
 tree=view.render({initial});assert.match(JSON.stringify(tree),/Nenhum participante encontrado/)
 nodes(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});await new Promise(setImmediate)
 assert.equal(saved[1].items.length,129);assert.ok(!saved[1].items.some(item=>item.productId===items[129].productId))
 search().props.onChange({target:{value:''}});tree=view.render({initial})
 assert.equal(nodes(tree,n=>n.type==='input' && n.props.maxLength===30).length,50)
})
test('participant search remains available for published campaigns',()=>{
 const initial={id:'campaign',name:'Publicada',status:'published',version:1,startsAt:'2099-01-01T00:00:00Z',endsAt:'2099-01-02T00:00:00Z',items:[{productId:'p',productName:'Lua Crescente',productSku:'TN1057',variantName:'',regularPrice:100,discountType:'percent',discountValue:'20',appliedSalePrice:80}]}
 const view=renderer('src/app/admin/campanhas/CampaignEditor.tsx',{'next/navigation':{useRouter:()=>({})},'next/link':{default:'Link'},'@/lib/promotion-ui':load('src/lib/promotion-ui.ts'),'./actions':{}})
 let tree=view.render({initial});nodes(tree,n=>n.props['aria-label']==='Buscar nos participantes')[0].props.onChange({target:{value:'inexistente'}})
 tree=view.render({initial});assert.match(JSON.stringify(tree),/Nenhum participante encontrado/)
 assert.equal(nodes(tree,n=>n.type==='button' && n.props.children==='Remover').length,0)
})
test('published campaign can prepare a replacement draft with missing natural titanium pieces without changing the active campaign',async()=>{
 const {randomUUID}=require('node:crypto'),calls=[],paths=[],nextId=randomUUID()
 const initial={id:randomUUID(),name:'Titânio 20% OFF',status:'published',version:1,startsAt:'2026-01-01T00:00:00Z',endsAt:'2099-01-02T00:00:00Z',items:[{productId:'p',productName:'Labret',variantName:'',regularPrice:100,discountType:'percent',discountValue:'20',appliedSalePrice:80}]}
 const view=renderer('src/app/admin/campanhas/CampaignEditor.tsx',{
  'next/navigation':{useRouter:()=>({push:path=>paths.push(path)})},'next/link':{default:'Link'},'@/lib/promotion-ui':load('src/lib/promotion-ui.ts'),
  './actions':{prepareMaterialCampaign:async(...args)=>{calls.push(args);return {error:'',id:nextId,added:2}}}
 },{crypto:{randomUUID:()=>nextId}})
 const props={initial,materials:['Titânio Cor Natural']}
 let tree=view.render(props)
 nodes(tree,n=>n.props['aria-label']==='Material para completar a campanha')[0].props.onChange({target:{value:'Titânio Cor Natural'}})
 tree=view.render(props)
 await nodes(tree,n=>n.type==='button' && n.props.children==='Criar versão com as peças faltantes')[0].props.onClick()
 assert.deepEqual(calls,[[initial.id,'Titânio Cor Natural',nextId]])
 assert.deepEqual(paths,['/admin/campanhas?edit='+nextId])
})

test('published campaign audit identifies missing category references and prepares a separate draft',async()=>{
 const {randomUUID}=require('node:crypto'),sourceId=randomUUID(),present=randomUUID(),missing=randomUUID(),draft=randomUUID(),calls=[]
 const initial={id:sourceId,name:'Argolas 20%',status:'published',version:2,startsAt:'2020-01-01T00:00:00Z',endsAt:'2099-01-02T00:00:00Z',items:[{productId:present,variantId:null,productName:'Atual',regularPrice:100,discountType:'percent',discountValue:'20',appliedSalePrice:80}]}
 const view=renderer('src/app/admin/campanhas/CampaignEditor.tsx',{
  'next/navigation':{useRouter:()=>({push:url=>calls.push(url)})},'next/link':{default:'Link'},'@/lib/promotion-ui':load('src/lib/promotion-ui.ts'),
  './actions':{campaignCategoryTargets:async category=>{assert.equal(category,'argolas');return {error:'',targets:[{productId:present,variantId:null,productName:'Atual'},{productId:missing,variantId:null,productName:'Peça nova',productSku:'PVD1228'}]}},prepareCategoryCampaign:async(id,category)=>{calls.push([id,category]);return {error:'',id:draft}}}
 },{crypto:{randomUUID}})
 const props={initial,categories:[{slug:'argolas',name:'Argolas'}]}
 let tree=view.render(props)
 nodes(tree,n=>n.type==='select' && n.props['aria-label']==='Categoria para completar a campanha')[0].props.onChange({target:{value:'argolas'}})
 tree=view.render(props)
 await nodes(tree,n=>n.type==='button' && n.props.children==='Conferir peças faltantes por categoria')[0].props.onClick()
 tree=view.render(props)
 const report=nodes(tree,n=>n.props.role==='status').find(n=>JSON.stringify(n).includes('participantes elegíveis'))
 assert.match(JSON.stringify(report),/PVD1228/);assert.match(JSON.stringify(report),/Peça nova/)
 await nodes(tree,n=>n.type==='button' && n.props.children==='Criar versão com as peças da categoria que faltam')[0].props.onClick()
 assert.deepEqual(calls,[[sourceId,'argolas'],'/admin/campanhas?edit='+draft])
})
