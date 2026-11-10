const {test}=require('node:test')
const assert=require('node:assert/strict')
const {renderer,nodes}=require('./helpers/render.cjs')
const flush=()=>new Promise(resolve=>setImmediate(resolve))
const token='a'.repeat(64)
function page(fail=false){
 const calls=[],history=[],order=[]
 const browser={location:{hash:'#'+token,pathname:'/acompanhar'},history:{replaceState:(...args)=>{history.push(args);order.push('scrub')}}}
 const view=renderer('src/app/acompanhar/GuestTrackingClient.tsx',{
  'next/link':{default:'Link'},'@/components/account/CustomerShipmentStatus':{default:'Status'},
  './actions':{openGuestTracking:async value=>{calls.push(value);order.push('request');return fail&&calls.length===1?{error:'Falha temporária'}:{error:'',tracking:{number:77,status:'paid',total:133.89,createdAt:'2026-11-02T13:00:00Z',environment:'production',carrier:null,trackingCode:null}}}},
 },{window:browser})
 return {view,calls,history,order}
}
test('tracking scrubs the fragment before requests and never renders a token or requires login',async()=>{
 const {view,calls,history,order}=page()
 view.render();view.flush();await flush()
 const tree=view.render()
 assert.deepEqual(order,['scrub','request']);assert.equal(history[0][2],'/acompanhar');assert.equal(calls[0],token)
 assert.ok(!JSON.stringify(tree).includes(token))
 assert.equal(nodes(tree,n=>n.type==='Status')[0].props.status,'paid')
 assert.equal(nodes(tree,n=>n.type==='Link'&&n.props.href==='/minha-conta').length,0)
 const refresh=nodes(tree,n=>n.type==='button')[0]
 await refresh.props.onClick();await flush();assert.equal(calls[1],undefined)
})
test('transient failure keeps capability only in memory for a safe retry',async()=>{
 const {view,calls}=page(true)
 view.render();view.flush();await flush()
 const tree=view.render()
 assert.equal(nodes(tree,n=>n.props.role==='alert').length,1)
 assert.ok(!JSON.stringify(tree).includes(token))
 await nodes(tree,n=>n.type==='button')[0].props.onClick();await flush()
 assert.equal(calls[1],token)
 assert.equal(nodes(view.render(),n=>n.type==='Status').length,1)
})

test('tracking page responses are private, non-indexable and never refresh an account session',async()=>{
 const {load}=require('./helpers/load.cjs')
 const api=load('src/middleware.ts',{
  '@supabase/ssr':{createServerClient:()=>{throw Error('must not touch account auth')}},
  'next/server':{NextResponse:{next:()=>({headers:new Headers()})}},
 },{SUPABASE_URL:'https://fixture.example',SUPABASE_PUBLISHABLE_KEY:'public-key'})
 const response=await api.middleware({nextUrl:{pathname:'/acompanhar'},cookies:{getAll:()=>[{name:'serenity-customer',value:'private'}]}})
 assert.match(response.headers.get('Cache-Control'),/private, no-store/)
 assert.equal(response.headers.get('Referrer-Policy'),'no-referrer')
 assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow')
})

test('guest tracking exchange requires a valid capability before writing its cookie',async()=>{
 const {load}=require('./helpers/load.cjs');let reads=0,writes=0,exists=true
 const api=load('src/app/acompanhar/actions.ts',{
  '@/lib/checkout-server':{checkoutDatabase:async()=>{reads++;return {}}},
  '@/lib/guest-tracking-server':{readGuestTracking:async()=>exists?{number:77,status:'paid'}:null,writeGuestCookie:()=>{writes++}},
 })
 assert.ok((await api.openGuestTracking('not-a-capability')).error);assert.equal(reads,0);assert.equal(writes,0)
 assert.equal((await api.openGuestTracking(token)).tracking.number,77);assert.equal(writes,1)
 exists=false;assert.ok((await api.openGuestTracking('b'.repeat(64))).error);assert.equal(writes,1)
})
