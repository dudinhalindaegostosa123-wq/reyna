const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const model=load('src/lib/analytics-model.ts')
test('cart events count additions only, not hydration, service repricing or variant option changes',()=>{
 const item={productId:'3429',variationId:'3431',name:'Labret',quantity:1,price:100,variantKey:'old'}
 assert.equal(model.addedCartItems([item],[{...item,price:115}]).length,0)
 assert.equal(model.addedCartItems([item],[{...item,variantKey:'stem8'}]).length,0)
 assert.equal(model.addedCartItems([item],[{...item,quantity:3}])[0].quantity,2)
 assert.equal(model.addedCartItems([item],[]).length,0)
})
test('attribution validation drops unknown fields and rejects personal data or stale identifiers',()=>{
 const data={measurementId:'G-ZR73XP32BW',clientId:'123.456',sessionId:'1762180000',capturedAt:Date.now(),email:'private@example.com',gclid:'click-test',adUserData:'denied'}
 const value=model.analyticsContext(data);assert.ok(value);assert.equal(value.email,undefined);assert.equal(value.adUserData,'denied')
 assert.equal(model.analyticsContext({...data,clientId:'private@example.com'}),null)
 assert.equal(model.analyticsContext({...data,capturedAt:Date.now()-2*86400000}),null)
 const url=model.safeAnalyticsLocation('https://serenitypiercings.com.br/pagamento/secret-id?token=private&email=private@example.com&gclid=valid-click#secret')
 assert.equal(url,'https://serenitypiercings.com.br/pagamento?gclid=valid-click')
})
test('GA4 is configured once and ecommerce events target the correct property with quantities and values',async()=>{
 const messages=[],storage=new Map()
 const window={location:{href:'https://serenitypiercings.com.br/carrinho?gclid=click'},dataLayer:[],sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},gtag:(...args)=>{messages.push(args);if(args[0]==='get')args[3](args[2]==='client_id'?'123.456':'1762180000')}}
 const api=load('src/lib/google-analytics.ts',{'./google-ads':{initializeGoogleAds(){}},'./analytics-model':model},{},{window})
 api.configureGoogleAnalytics('G-ZR73XP32BW',true);api.configureGoogleAnalytics('G-ZR73XP32BW',true)
 assert.equal(messages.filter(row=>row[0]==='config').length,1)
 assert.equal(api.trackCartEvent('add_to_cart',[{productId:'3431',name:'Labret',price:100,quantity:2}]),true)
 const event=messages.find(row=>row[1]==='add_to_cart');assert.equal(event[2].value,200);assert.equal(event[2].send_to,'G-ZR73XP32BW')
 api.rememberAdClick();const context=await api.checkoutAnalyticsContext();assert.equal(context.gclid,'click');assert.equal(context.clientId,'123.456')
 window.dataLayer.push(['consent','update',{analytics_storage:'denied'}]);assert.equal(await api.checkoutAnalyticsContext(),null)
 api.configureGoogleAnalytics(null,false);assert.equal(api.trackCartEvent('view_cart',[]),false)
})
test('server purchase allocates discounts exactly and excludes shipping without leaking customer fields',()=>{
 const api=load('src/lib/analytics-server.ts',{'./analytics-model':model})
 const job={order_id:'order-id',measurement_id:'G-ZR73XP32BW',context:{clientId:'123.456',sessionId:'1762180000'},occurred_at:new Date().toISOString(),payload:{subtotal:30,discount:0.01,shipping:10,total:39.99,items:[{item_id:'3431',name:'Labret',unit_price:10,quantity:3}]}}
 const body=api.measurementPayload(job),event=body.events[0]
 assert.equal(event.name,'purchase');assert.equal(event.params.value,29.99);assert.equal(event.params.shipping,10)
 assert.equal(event.params.items.reduce((sum,item)=>sum+Math.round(item.price*100)*item.quantity,0),2999)
 assert.equal(event.params.transaction_id,'order-id');assert.equal(body.client_id,'123.456')
 assert.throws(()=>api.measurementPayload({...job,payload:{...job.payload,total:500}}),/ANALYTICS_AMOUNT/)
})
