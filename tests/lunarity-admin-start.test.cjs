const {test}=require('node:test')
const assert=require('node:assert/strict')
const {load}=require('./helpers/load.cjs')
const React=require('react')
const {renderToStaticMarkup}=require('react-dom/server')
const id='11111111-1111-4111-8111-111111111111'

function details(errorCode='PGRST205'){
 const order={id,number:1,status:'paid',total:125,created_at:new Date().toISOString(),stock_state:'debited',
  customer_snapshot:{name:'Cliente Lunarity',email:'cliente@example.test',phone:'11999999999'},
  delivery_address:{street:'Rua de Teste',number:'1'},items:[{name:'Labret',quantity:1,unit_price:125}]}
 const queried=[]
 const db={from(table){queried.push(table);const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:order,error:null}),limit:async()=>({error:{code:errorCode}})};return q}}
 const component=load('src/app/admin/pedidos/[id]/page.tsx',{
  'react/jsx-runtime':require('react/jsx-runtime'),
  'next/link':{default:({children,...props})=>React.createElement('a',props,children)},
  'next/navigation':{notFound:()=>{throw Error('not found')}},
  '@/lib/admin-auth':{adminDatabase:async()=>({db})},
  '@/lib/checkout-contact':{},'@/components/admin/OrderItemDetails':{default:({item})=>React.createElement('p',null,item.name)},
  '@/components/admin/QuickLabelFlow':{},'@/components/admin/LabelPreparation':{},'@/components/admin/OrderStock':{},
  '@/components/admin/OrderOrigin':{},'@/components/admin/OrderDispatch':{},
  '@/lib/label-cart-server':{loadLabelJobView:async()=>{throw Error('must not load absent logistics')}},
  '@/lib/label-draft-server':{loadLabelPreparation:async()=>{throw Error('must not load absent logistics')}},
  '@/lib/order-workflow':{},'@/lib/admin-sales':{SALE_STATUS:{paid:'Pago'},saleUuid:s=>s===id,saleMoney:n=>String(n),saleDate:()=> 'Hoje'},
  '../OrderStatus':{},
 }).default
 return {component,queried}
}

test('new Lunarity store displays paid order and items before optional label installation',async()=>{
 const {component,queried}=details()
 const html=renderToStaticMarkup(await component({params:{id}}))
 assert.match(html,/Pedido #1/);assert.match(html,/Pago/);assert.match(html,/Cliente Lunarity/);assert.match(html,/Labret/)
 assert.match(html,/baixa registrada/);assert.match(html,/emissão de etiquetas ainda precisa ser configurada/)
 assert.deepEqual(queried,['serenity_orders','serenity_label_jobs'])
})
test('authorization and network failures are not disguised as missing label installation',async()=>{
 const {component}=details('42501')
 await assert.rejects(component({params:{id}}),/LABEL_JOB_QUERY/)
})
test('missing sender table permits shipping settings setup but other errors remain visible',async()=>{
 const api=load('src/lib/label-draft-server.ts',{
  './shipping-phone':{},'./legacy-contacts':{},'@/lib/order-item-options':{},'@/lib/label-draft':{},'@/lib/label-preparation-validation':{},
 })
 const db=code=>({from(){const q={select(){return q},eq(){return q},single:async()=>({error:{code}})};return q}})
 const result=await api.loadLabelSender(db('PGRST205'),'18053350')
 assert.equal(result.version,0);assert.equal(result.fields.cep,'18053350')
 await assert.rejects(api.loadLabelSender(db('42501'),'18053350'),/LABEL_QUERY/)
})
