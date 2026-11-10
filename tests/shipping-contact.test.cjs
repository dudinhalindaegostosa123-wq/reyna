const {test}=require('node:test')
const assert=require('node:assert/strict')
const {load}=require('./helpers/load.cjs')
const phone=load('src/lib/shipping-phone.ts')
const fields=load('src/lib/label-draft.ts',{'./shipping-phone':phone,'@/lib/checkout':{CHECKOUT_STATES:['SP']},'@/lib/checkout-document':load('src/lib/checkout-document.ts')})
test('shipping phones normalize country code without truncating domestic DDD 55 or accepting incomplete phones',()=>{
 assert.equal(phone.shippingPhone('+55 (11) 99999-9999'),'11999999999')
 assert.equal(phone.shippingPhone('55 99999-9999'),'55999999999')
 assert.equal(fields.partyFieldError('phone','+55 (11) 99999-9999'),'')
 assert.ok(fields.partyFieldError('phone','99999'))
 const form=new FormData();form.set('phone','+55 (11) 99999-9999');form.set('document_mode','pending')
 assert.equal(fields.readLabelFields(form,'draft').phone,'11999999999')
})
test('blank legacy drafts cannot hide known fields, and another street never receives the old house number or district',async()=>{
 const api=load('src/lib/label-draft-server.ts',{'./legacy-contacts':load('src/lib/legacy-contacts.ts',{'./legacy-import':load('src/lib/legacy-import.ts'),'./shipping-phone':load('src/lib/shipping-phone.ts')}),'./shipping-phone':phone,'@/lib/order-item-options':load('src/lib/order-item-options.ts'),'@/lib/label-draft':fields,'@/lib/label-preparation-validation':load('src/lib/label-preparation-validation.ts')})
 let draft={fields:{name:'Ana Silva',phone:'',number:'',district:'',complement:''},version:1}
 const sender={name:'Loja',email:'store@example.com',phone:'11999999999',document:'52998224725',cep:'01000000',street:'Rua A',number:'1',district:'Centro',city:'São Paulo',state:'SP'}
 const db={from(table){const data=table==='serenity_label_sender'?{fields:sender,version:1}:table==='serenity_label_drafts'?draft:table==='serenity_legacy_documents_v1'?null:{origin:'01000000',height:6,width:15,length:15,weight_g:100};const q={select(){return q},eq(){return q},single:async()=>({data,error:null}),maybeSingle:async()=>({data,error:null})};return q}}
 const order={id:'order',source:'legacy',legacy_id:10,status:'paid',customer_snapshot:{name:'Ana Silva',email:'ana@example.com',phone:'+55 (11) 99999-9999'},delivery_address:{cep:'01000000',street:'Rua A',number:'9',district:'Centro',complement:'Apto 2',city:'São Paulo',state:'SP'},shipping_details:{manual:false},items:[]}
 let view=await api.loadLabelPreparation(db,order)
 assert.equal(view.fields.phone,'11999999999');assert.equal(view.fields.number,'9');assert.equal(view.fields.district,'Centro');assert.equal(view.fields.complement,'')
 draft={fields:{name:'Ana Silva',phone:'21988888888',street:'Rua B',number:'',district:''},version:1}
 view=await api.loadLabelPreparation(db,order)
 assert.equal(view.fields.phone,'21988888888');assert.equal(view.fields.street,'Rua B');assert.equal(view.fields.number,'');assert.equal(view.fields.district,'')
 draft={fields:{name:'Outra Pessoa',phone:''},version:1}
 view=await api.loadLabelPreparation(db,order)
 assert.equal(view.fields.phone,'')
})
