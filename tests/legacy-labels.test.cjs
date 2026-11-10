const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const scope = load('src/lib/label-scope.ts')
const binding = load('src/lib/legacy-label-binding.ts')
const remoteId = '20000000-0000-4000-8000-000000000001'

test('legacy shipping scope isolates mutations while normal shipping keeps its original database', () => {
  const { scopedLabelDatabase } = load('src/lib/label-scope-server.ts', { './label-scope': scope })
  const calls = []
  const db = { from: name => calls.push(name), rpc: name => calls.push(name) }
  assert.equal(scopedLabelDatabase(db), db)
  const legacy = scopedLabelDatabase(db, 'legacy')
  legacy.from('serenity_orders'); legacy.from('serenity_label_jobs'); legacy.from('serenity_label_sender')
  legacy.rpc('serenity_label_purchase_claim', {})
  assert.deepEqual(calls, ['serenity_legacy_shipping_orders_v1','serenity_legacy_label_jobs_v1','serenity_label_sender','serenity_legacy_label_purchase_claim_v1'])
  assert.throws(() => legacy.rpc('serenity_admin_create_order', {}), /LABEL_SCOPE_RPC/)
  assert.throws(() => scopedLabelDatabase(db, 'invalid'), /LABEL_SCOPE/)
})

test('existing label must match historical recipient and remains bound by remote ID, document and postal code', () => {
  const remote = { id: remoteId, to: { name:'Ána Silva', email:'ana@example.com', postal_code:'01000-000', document:'123.456.789-01' } }
  const old = { primeiro_nome:'Ana', sobrenome:'Silva', email:'ana@example.com', cep:'01000000' }
  assert.equal(binding.matchLegacyRecipient(remote, old).name, 'Ána Silva')
  const identity = { postalCode:'01000000', document:'12345678901' }
  assert.equal(binding.verifyLegacyBinding(remote,remoteId,identity).id,remoteId)
  for (const changed of [{...remote,id:'other'},{...remote,to:{...remote.to,document:'000'}},{...remote,to:{...remote.to,postal_code:'99999999'}}]) {
    assert.throws(() => binding.verifyLegacyBinding(changed,remoteId,identity), /LEGACY_LABEL_RECIPIENT/)
  }
  assert.throws(() => binding.matchLegacyRecipient(remote,{...old,cep:'99999999'}),/LEGACY_LABEL_RECIPIENT/)
  assert.throws(() => binding.matchLegacyRecipient(remote,{...old,primeiro_nome:'Bia',sobrenome:'Other',email:'other@example.com'}),/LEGACY_LABEL_RECIPIENT/)
})

test('ordinary shipments keep operation tag verification; imported labels use their saved recipient binding', () => {
  let tagChecks=0
  const api=load('src/lib/label-purchase-server.ts',{
    '@/lib/legacy-label-binding':binding,
    '@/lib/admin-sales':{saleUuid:()=>true},
    '@/lib/label-cart-server':{
      remoteCart:v=>v,remotePrice:v=>v.price,
      verifyRemote:(v,id,op)=>{tagChecks++;assert.equal(op,'operation');if(!v.tag)throw new Error('TAG_REQUIRED');return v},
    },
  })
  const response={id:remoteId,service_id:2,status:'generated',price:15,to:{postal_code:'01000000',document:'12345678901'}}
  const job={remote_id:remoteId,operation:'operation',selected:{provider:{id:2}},context:{}}
  assert.throws(()=>api.inspectShipment(response,job),/TAG_REQUIRED/)
  const result=api.inspectShipment(response,{...job,context:{external_binding:{postalCode:'01000000',document:'12345678901'}}})
  assert.equal(result.paid,true);assert.equal(result.generated,true);assert.equal(tagChecks,1)
})

test('linking a paid legacy label only reads the provider and records the existing shipment', async () => {
  const calls=[]
  const shipmentId='10000000-0000-4000-8000-000000000002'
  const db={from(table){
    const query={select(){return query},eq(){return query},single:async()=>({data:table==='serenity_legacy_orders_v1'?{payload:{primeiro_nome:'Ana',sobrenome:'Silva',email:'ana@example.com',cep:'01000000'}}:{operation:'operation'},error:null})}
    return query
  },rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='serenity_legacy_label_start_v1'?shipmentId:null,error:null}}}
  const api=load('src/app/admin/historico/label-actions.ts',{
    'next/cache':{revalidatePath(){}},
    '@/lib/admin-auth':{adminDatabase:async()=>({db,user:{id:'actor',email:'admin@example.com'}})},
    '@/lib/admin-sales':{saleUuid:v=>[remoteId,shipmentId].includes(v)},
    '@/lib/legacy-label-binding':binding,
    '@/lib/label-cart-server':{remotePrice:()=>15},
    '@/lib/label-purchase-server':{
      labelShipmentRequest:async(command)=>{assert.equal(command,'info');return {id:remoteId,service_id:2,to:{name:'Ana Silva',email:'ana@example.com',postal_code:'01000000',document:'12345678901'}}},
      inspectShipment:()=>({paid:true,generated:true,blocked:false,status:'generated',cents:1500}),
    },
  })
  assert.ok((await api.linkLegacyLabel('10',remoteId,false)).error)
  assert.equal(calls.length,0)
  const result=await api.linkLegacyLabel('10',remoteId,true)
  assert.equal(result.error,'');assert.equal(result.id,shipmentId)
  assert.deepEqual(calls.map(c=>c[0]),['serenity_legacy_label_start_v1','serenity_legacy_label_bind_v1','serenity_legacy_label_purchase_observe_v1'])
  assert.equal(calls[2][1].p_paid,true)
})

test('label diagnostics distinguish provider access and database failures without exposing personal data',()=>{
 const api=load('src/lib/label-purchase-server.ts',{
  '@/lib/legacy-label-binding':binding,'@/lib/admin-sales':{},'@/lib/label-cart-server':{},
 })
 assert.match(api.purchaseError(new Error('PURCHASE_PROVIDER_403')),/ETIQUETA-ME-403/)
 assert.match(api.purchaseError(new Error('PURCHASE_PROVIDER_404')),/não foi encontrado/)
 assert.match(api.purchaseError({code:'42883',message:'private@example.com token secret'}),/ETIQUETA-BANCO-42883/)
 assert.doesNotMatch(api.purchaseError({code:'42883',message:'private@example.com token secret'}),/private|secret/)
 assert.match(api.purchaseError(new Error('PURCHASE_QUERY')),/banco/)
})
