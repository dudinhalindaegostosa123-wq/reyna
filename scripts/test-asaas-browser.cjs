// Browser interaction test for the real checkout component with simulated server actions.
// No API calls or credentials. Requires Playwright and Chromium in the test environment.
const fs=require('node:fs'), http=require('node:http'), assert=require('node:assert/strict')
const ts=require('typescript'), {chromium}=require('playwright')
const component=ts.transpileModule(fs.readFileSync('src/app/pagamento/[id]/AsaasCheckout.tsx','utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2019,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
}).outputText
const initial={id:'11111111-1111-4111-8111-111111111111',state:'pending',environment:'test',pricingMode:'retail',totalCents:10000,
 shippingPending:false,reservedUntil:new Date(Date.now()+10*60000).toISOString(),orderId:null,orderNumber:null,needsReview:false,testApproved:false,attempts:[],
 paymentOptions:{pixTotalCents:9500,cardTotalCents:10000,pixDiscountCents:500,appliedDiscountCents:0,selectedMethod:null}}
const bootstrap=`
window.events=[];window.session=${JSON.stringify(initial)};
const cart=()=>({clearCart:()=>{}});cart.getState=()=>({items:[]});
const mocks={
 'react':React,
 'react/jsx-runtime':{Fragment:React.Fragment,jsx:(type,props,key)=>React.createElement(type,{...props,key}),jsxs:(type,props,key)=>React.createElement(type,{...props,key})},
 'next/link':{__esModule:true,default:({href,children,...props})=>React.createElement('a',{href,...props},children)},
 '@/lib/cart':{useCartStore:selector=>selector(cart())},
 './actions-v2':{selectPaymentMethodV4:async(id,method)=>{
  window.session={...window.session,totalCents:method==='pix'?9500:10000,paymentOptions:{...window.session.paymentOptions,selectedMethod:method}};
  return {error:'',session:window.session};
 }},
 './actions-asaas':{
  startAsaasCheckoutPayment:async(id,attempt,method,total,card)=>{
   window.events.push({method,total,cardProvided:Boolean(card?.number&&card?.ccv),clearedBeforeSend:!document.querySelector('[name=number]')?.value});
   window.session=method==='card'?{...window.session,state:'converted',orderId:id,orderNumber:123}:
    {...window.session,state:'payment_pending',attempts:[{id:attempt,method,provider:'asaas',state:'pending',applicationState:'pending',blocksNewAttempt:true,pixCode:'pix-code-fixture',pixQr:null,expiresAt:null}]};
   return {error:'',session:window.session};
  },
  refreshAsaasCheckoutPayment:async()=>{window.session={...window.session,state:'converted',orderId:window.session.id,orderNumber:123};return {error:'',session:window.session};},
 },
};
mocks['@/lib/cart'].useCartStore.getState=cart.getState;
const exports={};const require=name=>{if(!(name in mocks))throw Error('Unexpected import '+name);return mocks[name]};
${component}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(exports.default,{initial:window.session,enabled:true,queryEnabled:true,configurationError:''}));
`
const assets={
 '/react.js':fs.readFileSync(require.resolve('react').replace(/index.js$/,'umd/react.production.min.js')),
 '/react-dom.js':fs.readFileSync(require.resolve('react-dom').replace(/index.js$/,'umd/react-dom.production.min.js')),
 '/app.js':bootstrap,
}
const server=http.createServer((req,res)=>{
 if(assets[req.url]){res.setHeader('content-type','application/javascript');res.end(assets[req.url]);return}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script src="/app.js"></script></body></html>')
})
;(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']})
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message)})
  const url=`http://127.0.0.1:${server.address().port}`
  await page.goto(url)
  if(errors.length)throw Error(errors.join('; '))
  await page.getByRole('button',{name:/^Pix/}).click()
  await page.getByRole('button',{name:'Gerar Pix'}).click()
  await page.getByLabel('Pix copia e cola').waitFor()
  assert.equal(await page.getByLabel('Pix copia e cola').inputValue(),'pix-code-fixture')
  assert.equal(await page.getByRole('button',{name:'Gerar Pix'}).count(),0)
  await page.getByRole('button',{name:'Atualizar situação do pagamento'}).click()
  await page.getByRole('heading',{name:'Pagamento confirmado'}).waitFor()
  assert.deepEqual(await page.evaluate(()=>window.events),[{method:'pix',total:9500,cardProvided:false,clearedBeforeSend:true}])
  await page.goto(url)
  await page.getByRole('button',{name:/Cartão de crédito/}).click()
  await page.getByLabel('Nome impresso no cartão').fill('Fixture')
  await page.getByLabel('Número do cartão').fill('4111111111111111')
  await page.getByLabel('Mês de validade').fill('12')
  await page.getByLabel('Ano de validade').fill('2035')
  await page.getByLabel('Código de segurança').fill('123')
  await page.getByLabel('CPF ou CNPJ do titular').fill('52998224725')
  await page.getByRole('checkbox').check()
  await page.getByRole('button',{name:/^Pagar /}).click()
  await page.getByRole('heading',{name:'Pagamento confirmado'}).waitFor()
  assert.deepEqual(await page.evaluate(()=>window.events),[{method:'card',total:10000,cardProvided:true,clearedBeforeSend:true}])
  assert.equal(page.url(),url+'/')
  assert.equal(await page.locator('a[href*="asaas.com"]').count(),0)
  assert.deepEqual(errors,[])
  console.log('PASS: Chromium: Pix selection, authoritative discount, inline code, duplicate button blocked, refresh confirmation; card fields, clearing before submit, inline approval, no redirect. Server actions simulated; no charge created.')
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);server.close();process.exitCode=1})
