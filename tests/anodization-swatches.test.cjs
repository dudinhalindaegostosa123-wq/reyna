const {test}=require('node:test')
const assert=require('node:assert/strict')
const {load}=require('./helpers/load.cjs')
const {renderer,nodes}=require('./helpers/render.cjs')
const anodization=load('src/lib/anodization.ts')
const view=()=>renderer('src/components/product/AnodizationOptions.tsx',{'@/lib/anodization':anodization,'@/lib/data':{formatPrice:value=>String(value)},'lucide-react':{ChevronDown:'ChevronDown',X:'X'}})
test('every existing color has a swatch, preserves its code and displays its name and voltage',()=>{
 let selection
 const component=view()
 const props={tags:['anodizavel'],enabled:true,color:'',fee:0,onChange:(...value)=>{selection=value}}
 let tree=component.render(props)
 const radios=nodes(tree,node=>node.type==='input' && node.props.type==='radio')
 assert.equal(radios.length,26);assert.equal(nodes(tree,node=>node.type==='select').length,0)
 assert.equal(radios.filter(node=>node.props.checked).length,0)
 const swatches=nodes(tree,node=>node.props?.style?.backgroundColor)
 assert.equal(swatches.length,26)
 anodization.ANODIZATION_COLORS.forEach((color,index)=>{
  assert.match(color.swatch,/^#[0-9a-f]{6}$/i)
  assert.equal(swatches[index].props.style.backgroundColor,color.swatch)
  assert.equal(radios[index].props.value,color.code)
 })
 radios.find(node=>node.props.value==='28').props.onChange()
 assert.deepEqual(selection,[true,'28'])
 tree=component.render({...props,color:selection[1]})
 assert.equal(nodes(tree,node=>node.type==='input' && node.props.type==='radio' && node.props.checked)[0].props.value,'28')
 assert.match(JSON.stringify(tree),/Selecionada/)
 assert.equal(anodization.getAnodization(['anodizavel'],'28',0).label,'Azul 28 V')
})
test('swatches remain hidden until enabled, ineligible products render nothing, disabled fieldset blocks inputs',()=>{
 const component=view(),props={tags:['anodizavel'],enabled:false,color:'',onChange:()=>{}}
 assert.equal(nodes(component.render(props),node=>node.props.type==='radio').length,0)
 assert.equal(component.render({...props,tags:[]}),null)
 assert.equal(nodes(component.render({...props,enabled:true,disabled:true}),node=>node.type==='fieldset')[0].props.disabled,true)
})

test('palette opens in a modal without expanding the page and closes after choosing a color',()=>{
 const component=view();let chosen;let opens=0,closes=0
 let tree=component.render({tags:['anodizavel'],enabled:true,color:'',fee:0,onChange:(enabled,color)=>{chosen=color}})
 const dialog=nodes(tree,node=>node.type==='dialog')[0]
 assert.equal(dialog.props.open,undefined)
 dialog.props.ref.current={showModal(){opens++},close(){closes++}}
 nodes(tree,node=>node.type==='button' && node.props['aria-haspopup']==='dialog')[0].props.onClick()
 assert.equal(opens,1)
 nodes(tree,node=>node.type==='input' && node.props.value==='75')[0].props.onChange()
 assert.equal(chosen,'75');assert.equal(closes,1)
 tree=component.render({tags:['anodizavel'],enabled:true,color:chosen,fee:0,onChange:()=>{}})
 const trigger=nodes(tree,node=>node.type==='button' && node.props['aria-haspopup']==='dialog')[0]
 assert.match(JSON.stringify(trigger),/Rosa · 75 V/)
 const updatedDialog=nodes(tree,node=>node.type==='dialog')[0]
 updatedDialog.props.onClick({target:{},currentTarget:{}});assert.equal(closes,1)
 nodes(tree,node=>node.type==='button' && node.props['aria-label']==='Fechar escolha de cor')[0].props.onClick()
 assert.equal(closes,2)
})
