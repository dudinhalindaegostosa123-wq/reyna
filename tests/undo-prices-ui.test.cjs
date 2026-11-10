const {test}=require('node:test'),assert=require('node:assert/strict')
const {renderer,nodes}=require('./helpers/render.cjs')
test('undo requires confirmation, supports cancellation, reports conflicts and refreshes history after success',async()=>{
 const calls=[];let refreshes=0,error='Os preços mudaram depois deste reajuste.'
 const view=renderer('src/app/admin/precos/UndoPrices.tsx',{'next/navigation':{useRouter:()=>({refresh(){refreshes++}})},'./actions':{undoPrices:async(...args)=>{calls.push(args);return error?{error}:{}}}})
 const props={kind:'material',batch:'batch'}
 let tree=view.render(props)
 nodes(tree,n=>n.type==='button')[0].props.onClick()
 tree=view.render(props);assert.equal(calls.length,0)
 nodes(tree,n=>n.type==='button')[1].props.onClick()
 tree=view.render(props);assert.equal(nodes(tree,n=>n.type==='button').length,1)
 nodes(tree,n=>n.type==='button')[0].props.onClick()
 tree=view.render(props);await nodes(tree,n=>n.type==='button')[0].props.onClick()
 tree=view.render(props);assert.match(JSON.stringify(tree),/Os preços mudaram/);assert.equal(refreshes,0)
 error='';await nodes(tree,n=>n.type==='button')[0].props.onClick()
 tree=view.render(props);assert.match(JSON.stringify(tree),/Desfeito/);assert.equal(nodes(tree,n=>n.type==='button').length,0)
 assert.equal(refreshes,1);assert.deepEqual(calls,[['material','batch'],['material','batch']])
})
