const {test}=require('node:test')
const assert=require('node:assert/strict')
const {load}=require('./helpers/load.cjs')
const documents=load('src/lib/legacy-documents.ts',{'./legacy-import':load('src/lib/legacy-import.ts'),'./checkout-document':load('src/lib/checkout-document.ts')})

test('document CSV validates checksum, preserves leading zeroes, and keeps conflicting sources for review',()=>{
 const result=documents.parseLegacyDocuments('pedido_antigo,campo,valor\n10,_billing_cpf,529.982.247-25\n10,_billing_document,11144477735\n11,_billing_cpf,00000000000\n12,_billing_cpf,01234567890')
 assert.equal(result[0].documents.length,2)
 assert.equal(result[0].invalid,false)
 assert.equal(result[1].invalid,true)
 assert.ok(result[2].invalid || result[2].documents[0].startsWith('0'))
 assert.throws(()=>documents.parseLegacyDocuments('pedido_antigo,campo,valor\n10,password,secret'),/CSV/)
})

test('recovered document only prefills its unchanged recipient and never replaces a saved manual document',async()=>{
 const normalizer=load('src/lib/checkout-document.ts')
 const api=load('src/lib/label-draft-server.ts',{'./legacy-contacts':load('src/lib/legacy-contacts.ts',{'./legacy-import':load('src/lib/legacy-import.ts'),'./shipping-phone':load('src/lib/shipping-phone.ts')}),
  './shipping-phone':load('src/lib/shipping-phone.ts'),
  '@/lib/order-item-options':load('src/lib/order-item-options.ts'),
  '@/lib/label-draft':load('src/lib/label-draft.ts',{'./shipping-phone':load('src/lib/shipping-phone.ts'),'@/lib/checkout':{CHECKOUT_STATES:['SP']},'@/lib/checkout-document':normalizer}),
  '@/lib/label-preparation-validation':load('src/lib/label-preparation-validation.ts'),
 })
 let draft=null
 const fields={name:'Ana Silva',email:'ana@example.com',phone:'11999999999',document:'52998224725',cep:'01000000',street:'Rua A',number:'1',district:'Centro',city:'São Paulo',state:'SP'}
 const db={from(table){const data=table==='serenity_legacy_documents_v1'?{document:'52998224725',state:'ready',recipient_key:'ana silva'}:table==='serenity_label_sender'?{fields,version:1}:table==='serenity_label_drafts'?draft:{origin:'01000000',height:6,width:15,length:15,weight_g:100}
  const q={select(){return q},eq(){return q},single:async()=>({data,error:null}),maybeSingle:async()=>({data,error:null})};return q}}
 const order={id:'order',legacy_id:10,source:'legacy',status:'paid',shipping_pending:false,customer_snapshot:{...fields,document:''},delivery_address:fields,shipping_details:{manual:false},items:[]}
 assert.equal((await api.loadLabelPreparation(db,order)).fields.document,'52998224725')
 draft={fields:{name:'Bia Silva',document:''},version:1}
 assert.equal((await api.loadLabelPreparation(db,order)).fields.document,'')
 draft={fields:{name:'Ana Silva',document:'11144477735'},version:1}
 assert.equal((await api.loadLabelPreparation(db,order)).fields.document,'11144477735')
})
