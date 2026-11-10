const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const provider=load('src/lib/label-provider-errors.ts')
function cart(fetchImpl) {
  return load('src/lib/label-cart-server.ts', {
    './shipping-phone':load('src/lib/shipping-phone.ts'),
    './label-declared-values':load('src/lib/label-declared-values.ts'),
    'node:crypto':require('node:crypto'),
    '@/lib/label-provider-errors':provider,
    '@/lib/label-draft':{},
    '@/lib/label-draft-server':{},
    '@/lib/melhor-envio':{},
    '@/lib/admin-sales':{saleUuid:()=>true},
  }, {MELHOR_ENVIO_TOKEN:'fake-test-token'}, {fetch:fetchImpl})
}

test('provider validation identifies the refused field without leaking raw personal data or credentials', () => {
  const code=provider.labelProviderFailure(422,{message:'private@example.com secret-value',errors:{'to.document':['private data'],'to.postal_code':['11000000']}})
  const message=provider.labelProviderMessage(code)
  assert.match(message,/CPF\/CNPJ do destinatário/)
  assert.match(message,/Endereço do destinatário/)
  assert.ok(!message.includes('private@example.com'));assert.ok(!message.includes('secret-value'));assert.ok(!message.includes('11000000'))
  assert.equal(provider.isLabelProviderRejection(new Error(code)),true)
  assert.equal(provider.isLabelProviderRejection(new Error('LABEL_REMOTE_UNKNOWN')),false)
  assert.match(provider.labelProviderMessage(provider.labelProviderFailure(403,{})),/permissão/)
  assert.match(provider.labelProviderMessage(provider.labelProviderFailure(401,{})),/token de acesso/)
})

test('a rejected cart request keeps its field diagnosis while transport failures remain uncertain', async () => {
  const api=cart(async()=>new Response(JSON.stringify({errors:{'to.document':['required']}}),{status:422}))
  await assert.rejects(api.labelCartRequest('POST','admin@example.com',undefined,{}), error=>{
    assert.equal(provider.isLabelProviderRejection(error),true)
    assert.match(api.labelJobError(error),/CPF\/CNPJ do destinatário/)
    return true
  })
  const broken=cart(async()=>new Response('upstream failed',{status:502}))
  await assert.rejects(broken.labelCartRequest('POST','admin@example.com',undefined,{}),error=>{
    assert.equal(provider.isLabelProviderRejection(error),false)
    assert.equal(error.message,'LABEL_REMOTE_UNKNOWN');return true
  })
  const nonJson=cart(async()=>new Response('bad request',{status:422}))
  await assert.rejects(nonJson.labelCartRequest('POST','admin@example.com',undefined,{}),error=>provider.isLabelProviderRejection(error))
})

test('legacy draft chooses its carrier during preparation while current orders retain checkout service validation', async()=>{
  const doc=load('src/lib/checkout-document.ts')
  const fields=load('src/lib/label-draft.ts',{'./shipping-phone':load('src/lib/shipping-phone.ts'),'@/lib/checkout':{CHECKOUT_STATES:['SP']},'@/lib/checkout-document':doc})
  const api=load('src/lib/label-draft-server.ts',{'./legacy-contacts':load('src/lib/legacy-contacts.ts',{'./legacy-import':load('src/lib/legacy-import.ts'),'./shipping-phone':load('src/lib/shipping-phone.ts')}),
    './shipping-phone':load('src/lib/shipping-phone.ts'),
    '@/lib/order-item-options':load('src/lib/order-item-options.ts'),
    '@/lib/label-draft':fields,
    '@/lib/label-preparation-validation':load('src/lib/label-preparation-validation.ts'),
  })
  const address={name:'Ana',email:'ana@example.com',phone:'11999999999',document:'52998224725',cep:'01000000',street:'Rua A',number:'1',district:'Centro',city:'São Paulo',state:'SP'}
  const db={from(table){const q={select(){return q},eq(){return q},single:async()=>({data:table==='serenity_label_sender'?{fields:address,version:1}:{origin:'01000000'},error:null}),maybeSingle:async()=>({data:null,error:null})};return q}}
  const order={id:'order',source:'legacy',status:'paid',shipping_pending:false,customer_snapshot:address,delivery_address:address,shipping_details:{manual:false,volume:{height:6,width:15,length:15,weight:0.1}},items:[]}
  const legacy=await api.loadLabelPreparation(db,order)
  assert.ok(!legacy.issues.some(issue=>issue.includes('transportadora')))
  const current=await api.loadLabelPreparation(db,{...order,source:'site'})
  assert.ok(current.issues.some(issue=>issue.includes('transportadora')))
})


test('message-only provider errors remain visible with HTTP code and redacted request secrets', async () => {
  const api=cart(async()=>new Response(JSON.stringify({error:'O campo document é obrigatório para esta transportadora. CPF 52998224725; token fake-test-token'}),{status:422}))
  await assert.rejects(api.labelCartRequest('POST','admin@example.com',undefined,{to:{document:'52998224725'}}),error=>{
    const message=api.labelJobError(error)
    assert.match(message,/ME-422/)
    assert.match(message,/document é obrigatório/)
    assert.ok(!message.includes('52998224725'));assert.ok(!message.includes('fake-test-token'))
    assert.equal(provider.isLabelProviderRejection(error),true)
    return true
  })
  const text=cart(async()=>new Response('Documento do destinatário inválido.',{status:422}))
  await assert.rejects(text.labelCartRequest('POST','admin@example.com',undefined,{}),error=>{
    assert.match(text.labelJobError(error),/Documento do destinatário inválido/)
    return true
  })
  const unreadable=cart(async()=>({status:422,ok:false,text:async()=>{throw new Error('stream disconnected')}}))
  await assert.rejects(unreadable.labelCartRequest('POST','admin@example.com',undefined,{}),error=>{
    assert.equal(provider.isLabelProviderRejection(error),true)
    assert.match(unreadable.labelJobError(error),/ME-422/)
    return true
  })
})

test('persisted rejection is scoped to the same failed preparation and preserves its shipping context',async()=>{
  const calls=[]
  const db={from(table){assert.equal(table,'serenity_label_jobs');const q={update(value){calls.push(['update',value]);return q},eq(...args){calls.push(['eq',...args]);return q},then(resolve){return Promise.resolve({error:null}).then(resolve)}};return q}}
  const api=cart(()=>{throw new Error('PROVIDER_MUST_NOT_BE_CALLED')})
  await api.rememberLabelRejection(db,'order','operation',{checkoutServiceId:'2',agency:'123'},'Provider diagnosis [ME-422]')
  assert.equal(calls[0][1].context.checkoutServiceId,'2');assert.equal(calls[0][1].context.agency,'123')
  assert.equal(calls[0][1].context.lastProviderError,'Provider diagnosis [ME-422]')
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='order_id'&&c[2]==='order'))
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='operation'&&c[2]==='operation'))
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='state'&&c[2]==='rejected'))
})
