const { test } = require('node:test')
const assert = require('node:assert/strict')
const { renderer,nodes,storage } = require('./helpers/render.cjs')
const { load } = require('./helpers/load.cjs')
const { randomUUID } = require('node:crypto')
const tick = () => new Promise(resolve => setImmediate(resolve))
const initial = () => ({ id:'11111111-1111-1111-1111-111111111111',state:'pending',environment:'production',pricingMode:'retail',totalCents:11000,
  shippingPending:false,reservedUntil:new Date(Date.now()+30*60000).toISOString(),orderId:null,orderNumber:null,needsReview:false,testApproved:false,attempts:[],
  paymentOptions:{cardTotalCents:11000,pixTotalCents:10500,pixDiscountCents:500,appliedDiscountCents:0,selectedMethod:null} })

test('Pix is generated only after the server confirms the discounted amount; card returns to its own price', async () => {
  let finish, generated=0, current=initial()
  const changes=[]
  const view=renderer('src/app/pagamento/[id]/PixCheckoutV2.tsx',{
    '@/components/analytics/GoogleAdsProvider': { GoogleAdsPurchase: () => null },
    'next/link':{default:'Link'},'next/dynamic':{default:()=> 'SecureCard'},'@/lib/cart':{useCartStore:()=>()=>{}},
    './actions-v2':{
      selectPaymentMethodV4: async(id,method)=> { changes.push(method); await new Promise(resolve=>{finish=resolve}); current={...current,totalCents:method==='pix'?10500:11000,
        paymentOptions:{...current.paymentOptions,selectedMethod:method,appliedDiscountCents:method==='pix'?500:0}}; return {error:'',session:current} },
      startPixV2:async(id,attempt,expected)=>{generated++;assert.equal(expected,10500);assert.equal(current.totalCents,10500);return {error:'',session:{...current,state:'payment_pending',attempts:[{id:randomUUID(),method:'pix',state:'pending',blocksNewAttempt:true,applicationState:'applied'}]}}},
      refreshCheckoutPaymentV2:async()=>({error:''}),
    },
  },{sessionStorage:storage(),crypto:{randomUUID},document:{visibilityState:'visible'}})
  const props={initial:current,enabled:true,publicKey:'APP_USR-fixture',cardReady:true}
  let tree=view.render(props);view.flush()
  nodes(tree,node=>node.props['aria-label']==='Cartão de crédito')[0].props.onClick()
  tree=view.render(props);view.flush();assert.equal(generated,0)
  finish();await tick();tree=view.render(props);view.flush()
  assert.equal(nodes(tree,node=>node.type==='SecureCard')[0].props.totalCents,11000)
  nodes(tree,node=>node.type==='button'&&node.props.children==='Alterar forma de pagamento')[0].props.onClick()
  tree=view.render(props);view.flush()
  nodes(tree,node=>node.props['aria-label']==='Pix')[0].props.onClick()
  tree=view.render(props);view.flush();assert.equal(generated,0)
  finish();await tick();tree=view.render(props);view.flush();await tick()
  view.render(props);view.flush()
  assert.equal(generated,1)
  assert.deepEqual(changes,['card','pix'])
})

test('four mini banners follow the ear banner once without duplicating the other category banners', () => {
  const view=renderer('src/components/home/CategoryBanners.tsx',{'next/link':{default:'Link'},'next/image':{default:'Image'}})
  const tree=view.render({items:[{name:'Orelha',href:'/orelha'},{name:'Nariz',href:'/nariz'}],afterEar:{type:'MiniGrid',props:{}}})
  const sequence=nodes(tree,node=>node.type==='Link'||node.type==='MiniGrid').map(node=>node.props.href||node.type)
  assert.deepEqual(sequence,['/orelha','MiniGrid','/nariz'])
})

test('mini banners expose the four requested destinations', async () => {
  const element=(type,props)=>({type,props:props||{}})
  const api=load('src/components/home/EarMiniBanners.tsx',{
    'react/jsx-runtime':{jsx:element,jsxs:element},'next/link':{default:'Link'},'next/image':{default:'Image'},
    '@/lib/catalog-server':{getStoreCategory:async()=>({image:'/fixture.webp'})},
  })
  const tree=await api.default()
  assert.deepEqual(nodes(tree,node=>node.type==='Link').map(node=>node.props.href),[
    '/categoria/hastes-e-conectores','/categoria/correntes-e-pingentes','/categoria/argolas','/categoria/labret'])
  assert.equal(nodes(tree,node=>node.type==='Image'&&node.props.src.startsWith('/banners/lunarity-detalhes/')).length,4)
  assert.equal(nodes(tree,node=>node.type==='source'&&node.props.srcSet.endsWith('-mobile.webp')).length,4)
  const custom=await api.default({images:{'/categoria/argolas':'/custom-ring.webp'}})
  assert.ok(nodes(custom,node=>node.type==='Image'&&node.props.src==='/custom-ring.webp').length)
})
