const {test}=require('node:test'),assert=require('node:assert/strict')
const {renderer}=require('./helpers/render.cjs'),{load}=require('./helpers/load.cjs')
const view=()=>renderer('src/components/admin/OrderItemDetails.tsx',{'@/lib/admin-sales':load('src/lib/admin-sales.ts'),'@/lib/order-item-options':load('src/lib/order-item-options.ts')})
const base={name:'Joia fixture',sku:'TN123',quantity:2,unit_price:100,variation:null,anodization:null,voltage:null,anodization_fee:0}
test('order details distinguish recorded false, true and missing sterilization without consulting current catalog',()=>{
 for(const [value,label] of [[true,'Sim — solicitada'],[false,'Não solicitada'],[undefined,'Não informado na compra']]){
  const result=JSON.stringify(view().render({item:{...base,stem_length_mm:'6',sterilized:value},index:0}))
  assert.ok(result.includes(label));assert.ok(result.includes('6 mm'));assert.ok(result.includes('TN123'))
 }
})
test('saved variation fallback retains sizes and preparation instructions for previous orders',()=>{
 const result=JSON.stringify(view().render({item:{...base,variation:'Pedra: 3 mm · Haste incluída: 8 mm · Esterilização solicitada: Sim (gratuita)',anodization:'Azul',voltage:'25'},index:1}))
 for(const label of ['Pedra: 3 mm','8 mm','Sim (gratuita)','Azul · 25 V','sem custo adicional','Peça '])assert.ok(result.includes(label))
 assert.ok(!result.includes('+ R$'))
})
