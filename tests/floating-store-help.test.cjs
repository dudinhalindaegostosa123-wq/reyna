const {test}=require('node:test'),assert=require('node:assert/strict')
const {renderer,nodes}=require('./helpers/render.cjs'),{load}=require('./helpers/load.cjs')
const nextTick=()=>new Promise(resolve=>setImmediate(resolve))
test('floating collection card can be minimized and reopened, uses eligible quote count, and hides for wholesale and open drawer',async()=>{
 let state={items:[{quantity:10}],isOpen:false},quote={progressive:{quantity:2},pricing_mode:'retail'}
 const view=renderer('src/components/cart/CollectionNotice.tsx',{
  'next/link':{default:'Link'},'next/navigation':{usePathname:()=>'/categoria/todos'},
  '@/lib/cart':{useCartStore:fn=>fn(state)},'./useCollectionQuote':{useCollectionQuote:()=>quote},
  '@/lib/collection-progress':load('src/lib/collection-progress.ts'),
 },{fetch:async()=>({ok:true,json:async()=>({enabled:true,pix:true})})})
 view.render({});view.flush();await nextTick()
 let tree=view.render({})
 assert.ok(tree.props.className.includes('fixed'))
 assert.ok(JSON.stringify(tree).includes('Falta 1 joia para alcançar 15%'))
 assert.equal(nodes(tree,n=>n.type==='Link')[0].props.href,'/carrinho')
 nodes(tree,n=>n.type==='button'&&n.props['aria-label']==='Minimizar aviso de desconto')[0].props.onClick()
 tree=view.render({});assert.equal(nodes(tree,n=>n.type==='Link').length,0)
 nodes(tree,n=>n.type==='button')[0].props.onClick();assert.equal(nodes(view.render({}),n=>n.type==='Link').length,1)
 state.isOpen=true;assert.equal(view.render({}),null)
 state.isOpen=false;quote={...quote,pricing_mode:'wholesale'};assert.equal(view.render({}),null)
})
test('floating WhatsApp uses the confirmed store contact and disappears when cart is open',()=>{
 let state={isOpen:false}
 const view=renderer('src/components/layout/WhatsAppButton.tsx',{'@/lib/cart':{useCartStore:fn=>fn(state)},'@/lib/store-information':load('src/lib/store-information.ts')})
 const button=view.render({});assert.equal(button.props.href,'https://wa.me/5515981679400');assert.equal(button.props.target,'_blank');assert.ok(button.props.className.includes('fixed'));assert.ok(button.props['aria-label'].includes('WhatsApp'))
 state.isOpen=true;assert.equal(view.render({}),null)
})
test('storefront floats stay out of administration, checkout and payment',()=>{
 let path='/'
 const view=renderer('src/components/layout/SiteChrome.tsx',{
  'next/navigation':{usePathname:()=>path},'next/link':{default:'Link'},'lucide-react':{UserRound:'UserRound'},
  '@/components/cart/CommerceSync':{default:'CommerceSync'},'@/components/layout/Header':{default:'Header'},'@/components/layout/Footer':{default:'Footer'},'@/components/cart/CartDrawer':{default:'CartDrawer'},'@/components/cart/CollectionNotice':{default:'CollectionNotice'},'@/components/layout/WhatsAppButton':{default:'WhatsAppButton'},
 })
 assert.equal(nodes(view.render({children:'fixture'}),n=>n.type==='WhatsAppButton'||n.type==='CollectionNotice').length,2)
 for(path of ['/admin','/admin/pedidos','/checkout','/pagamento/pedido'])assert.equal(nodes(view.render({children:'fixture'}),n=>n.type==='WhatsAppButton'||n.type==='CollectionNotice').length,0)
})
