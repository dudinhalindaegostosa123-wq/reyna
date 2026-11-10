const {test}=require('node:test'),assert=require('node:assert/strict'),{renderer}=require('./helpers/render.cjs'),{load}=require('./helpers/load.cjs')
const model=load('src/lib/analytics-model.ts')
test('cart instrumentation does not count initial persisted contents, service changes or hydration as additions',()=>{
 let state={items:[{productId:'3431',name:'Labret',price:100,quantity:2}]},subscriber,hydrated,ready=true,path='/carrinho';const events=[]
 const store={getState:()=>state,subscribe:fn=>{subscriber=fn;return()=>{}},persist:{hasHydrated:()=>ready,onFinishHydration:fn=>{hydrated=fn;return()=>{}}}}
 const view=renderer('src/components/analytics/CommerceAnalytics.tsx',{'next/navigation':{usePathname:()=>path},'@/lib/cart':{useCartStore:store},'@/lib/analytics-model':model,'@/lib/google-analytics':{configureGoogleAnalytics(){},rememberAdClick(){},trackAnalyticsPage(){},trackCartEvent:(event,items)=>events.push({event,items})}})
 view.render({enabled:true,measurementId:'G-ZR73XP32BW'});view.flush();assert.deepEqual(events.map(e=>e.event),['view_cart'])
 state={items:[{...state.items[0],quantity:3}]};subscriber(state);assert.equal(events[1].event,'add_to_cart');assert.equal(events[1].items[0].quantity,1)
 state={items:[{...state.items[0],price:115}]};subscriber(state);assert.equal(events.length,2)
 ready=false;state={items:[{...state.items[0],quantity:5}]};subscriber(state);assert.equal(events.length,2)
 ready=true;hydrated(state);assert.equal(events[2].event,'view_cart');assert.equal(events.filter(e=>e.event==='add_to_cart').length,1)
 path='/checkout';view.render({enabled:true,measurementId:'G-ZR73XP32BW'});view.flush();assert.equal(events.at(-1).event,'begin_checkout')
})
