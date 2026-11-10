const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const doc = load('src/lib/checkout-document.ts')
const fields = load('src/lib/label-draft.ts', { './shipping-phone': load('src/lib/shipping-phone.ts'), '@/lib/checkout': { CHECKOUT_STATES: ['SP'] }, '@/lib/checkout-document': doc })
const binding = load('src/lib/legacy-label-binding.ts')
const id = '10000000-0000-4000-8000-000000000001'

test('recipient document may be absent without changing sender or checkout requirements', () => {
  assert.equal(fields.partyFieldError('document','',true),'')
  assert.ok(fields.partyFieldError('document',''))
  assert.ok(fields.partyFieldError('document','123',true))
  assert.throws(() => doc.normalizeCheckoutDocument(''))
})

test('legacy label without CPF matches recipient and can be verified later without a fictitious document', () => {
  const remote={id,to:{name:'Ana Silva',email:'ana@example.com',postal_code:'01000000'}}
  const old={primeiro_nome:'Ana',sobrenome:'Silva',cep:'01000000'}
  assert.equal(binding.matchLegacyRecipient(remote,old).name,'Ana Silva')
  const saved={postalCode:'01000000',name:'Ana Silva',email:'ana@example.com',document:''}
  assert.equal(binding.verifyLegacyBinding(remote,id,saved).id,id)
  assert.throws(()=>binding.verifyLegacyBinding({...remote,to:{...remote.to,name:'Other',email:'other@example.com'}},id,saved),/RECIPIENT/)
  assert.throws(()=>binding.verifyLegacyBinding(remote,id,{...saved,postalCode:'99999999'}),/RECIPIENT/)
})

test('label payload omits blank recipient document and permits the chosen historical service', () => {
  const api=load('src/lib/label-cart-server.ts',{
    './shipping-phone':load('src/lib/shipping-phone.ts'),
    './label-declared-values':load('src/lib/label-declared-values.ts'),
    'node:crypto':require('node:crypto'),
    '@/lib/label-provider-errors':load('src/lib/label-provider-errors.ts'),
    '@/lib/label-draft':fields,
    '@/lib/label-draft-server':{loadLabelPreparation(){}},
    '@/lib/melhor-envio':{},
    '@/lib/admin-sales':{saleUuid:()=>true},
  })
  const sender={name:'Loja',email:'store@example.com',phone:'11999999999',document:'52998224725',cep:'01000000',street:'Rua A',number:'1',district:'Centro',city:'São Paulo',state:'SP'}
  const recipient={...sender,name:'Ana',document:'',document_mode:'pending'}
  const context={sender,recipient,origin:'01000000',checkoutServiceId:'legacy-choice',products:[],insurance:100,orderNumber:10}
  const selected={provider:{id:2,packages:[{dimensions:{height:2,width:10,length:15},weight:0.1}]}}
  const payload=api.labelPayload(context,selected,id)
  assert.equal(payload.service,2)
  assert.equal(Object.hasOwn(payload.to,'document'),false)
  assert.equal(Object.hasOwn(payload.to,'company_document'),false)
  assert.equal(payload.from.document,sender.document)
  assert.throws(()=>api.labelPayload({...context,checkoutServiceId:'1'},selected,id),/Serviço inválido/)
})

test('historical option display preserves different attributes sharing a value and only uses saved values', () => {
  const { orderItemOptions }=load('src/lib/order-item-options.ts')
  const result=Array.from(orderItemOptions({opcoes_compra:{'pa_comprimento-da-haste':'6 mm','Espessura':'1,2 mm'}}))
  assert.ok(result.some(v=>v.includes('6 mm')))
  assert.ok(result.some(v=>v.includes('1,2 mm')))
  assert.equal(orderItemOptions({variacao_antiga:'123'}).length,0)
  assert.equal(orderItemOptions({stem_length_mm:'8'})[0],'Haste incluída: 8 mm')
})

test('supplemental CSV groups by historical item, rejects conflicts and internal financial fields', () => {
  const parser=load('src/lib/legacy-item-options.ts',{'./legacy-import':load('src/lib/legacy-import.ts')})
  const csv='pedido_antigo,item_antigo,atributo,valor\n10,20,Comprimento,6 mm\n10,20,Espessura,1.2 mm'
  const rows=parser.parseLegacyItemOptions(csv)
  assert.equal(rows.length,1);assert.equal(rows[0].options.Comprimento,'6 mm')
  assert.throws(()=>parser.parseLegacyItemOptions(csv+'\n10,20,Comprimento,8 mm'),/conflitantes/)
  assert.throws(()=>parser.parseLegacyItemOptions('pedido_antigo,item_antigo,atributo,valor\n10,20,_line_total,10'),/interno/)
})
