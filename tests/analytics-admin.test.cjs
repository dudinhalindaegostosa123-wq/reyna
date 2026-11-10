const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs'),{nodes}=require('./helpers/render.cjs')
const jsx=(type,props)=>({type,props})
function page(installed=true){
 const orders=[{id:'paid-with-context',number:41},{id:'paid-without-context',number:42}]
 const db={from(table){return {select(){return this},eq(){return this},order(){return this},async limit(){return table==='serenity_orders'?{data:orders,error:null}:{data:[],error:installed?null:{message:'internal error'}}},async in(field,ids){assert.equal(field,'checkout_id');assert.deepEqual(Array.from(ids),orders.map(row=>row.id));return {data:[{checkout_id:'paid-with-context'}],error:null}}}}}
 const module=load('src/app/admin/mensuracao/page.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'next/link':{default:'Link'},'@/lib/admin-auth':{adminDatabase:async()=>({db})},'@/lib/analytics-server':{GA4_MEASUREMENT_ID:'G-ZR73XP32BW'},'./AnalyticsControls':{default:'Controls'}},{VERCEL_ENV:'production',SERENITY_GA4_API_SECRET:'test-private-value-never-render',SERENITY_GA4_SERVER_ENABLED:'true'})
 return module.default()
}
test('measurement diagnostics identify recent paid orders missing navigation context without exposing API secrets',async()=>{
 const tree=await page(),content=JSON.stringify(tree)
 assert.ok(content.includes('identificação de navegação'));assert.ok(!content.includes('test-private-value-never-render'))
 assert.equal(nodes(tree,n=>n.type==='Link' && n.props.href==='/admin/pedidos/paid-without-context').length,1)
 assert.equal(nodes(tree,n=>n.type==='Link' && n.props.href==='/admin/pedidos/paid-with-context').length,0)
})
test('missing analytics SQL shows setup guidance without crashing the admin page or exposing database errors',async()=>{
 const tree=await page(false),content=JSON.stringify(tree)
 assert.ok(content.includes('SERENITY_GA4_SERVER_ENABLED=true'))
 assert.ok(!content.includes('internal error'))
 assert.equal(nodes(tree,n=>n.props?.role==='alert').length,1)
})
