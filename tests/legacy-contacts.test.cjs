const {test}=require('node:test')
const assert=require('node:assert/strict')
const {load}=require('./helpers/load.cjs')
const api=load('src/lib/legacy-contacts.ts',{'./legacy-import':load('src/lib/legacy-import.ts'),'./shipping-phone':load('src/lib/shipping-phone.ts')})
const csv=(rows)=>'pedido_antigo,tipo_endereco,primeiro_nome,sobrenome,telefone,endereco,cidade,estado,cep,campos_adicionais\n'+rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n')
const metadata=JSON.stringify([{campo:'_shipping_number',valor:'9'},{campo:'_billing_number',valor:'12'},{campo:'_shipping_neighborhood',valor:'Centro'}])
const rows=[['10','billing','Ana','Silva','+55 (11) 99999-9999','Rua A','São Paulo','SP','01000000',metadata],['10','shipping','Ana','Silva','','Rua B','São Paulo','SP','01000000',metadata]]
test('contact export keeps delivery separate, normalizes phones and requires both address rows',()=>{
 const result=api.parseLegacyContacts(csv(rows))[0]
 assert.equal(result.shipping.number,'9');assert.equal(result.billing.number,'12');assert.equal(result.billing.phone,'11999999999')
 assert.throws(()=>api.parseLegacyContacts(csv(rows.slice(0,1))),/Faltam/)
 assert.throws(()=>api.parseLegacyContacts(csv([...rows,rows[0]])),/repetido/)
})
test('contact recovery preserves manual fields and refuses mixing a different recipient or address',()=>{
 const saved=api.parseLegacyContacts(csv(rows))[0]
 const current={name:'Ana Silva',street:'Rua B',cep:'01000000',city:'São Paulo',state:'SP',phone:'',number:'',district:''}
 const recovered=api.recoveredLegacyFields(current,saved)
 assert.equal(recovered.number,'9');assert.equal(recovered.district,'Centro');assert.equal(recovered.phone,'11999999999')
 assert.equal(current.number,'')
 assert.equal(api.recoveredLegacyFields({...current,number:'77',phone:'21999999999'},saved).number,'77')
 assert.equal(api.recoveredLegacyFields({...current,street:'Rua C'},saved).number,'')
 assert.equal(api.recoveredLegacyFields({...current,name:'Outra Pessoa'},saved).phone,'')
})
test('conflicting metadata never chooses an arbitrary house number',()=>{
 const conflict=JSON.stringify([{campo:'_shipping_number',valor:'9'},{campo:'_shipping_number',valor:'10'}])
 assert.equal(api.parseLegacyContacts(csv([rows[0],[...rows[1].slice(0,-1),conflict]]))[0].shipping.number,'')
})
test('contact SQL is private, idempotent and rolls back conflicting imports',async()=>{
 const {PGlite}=require('@electric-sql/pglite')
 const fs=require('node:fs')
 const db=new PGlite()
 try {
  await db.exec('create role anon; create role authenticated; create role service_role; create table serenity_legacy_orders_v1(old_id bigint primary key, kind text, visible boolean); insert into serenity_legacy_orders_v1 values(10,\'shop_order\',true);')
  await db.exec(fs.readFileSync('database/legacy/04-contatos-enderecos.sql','utf8'))
  const data=JSON.stringify(api.parseLegacyContacts(csv(rows)))
  const run=()=>db.query('select serenity_legacy_import_contacts_v1($1::jsonb,$2::uuid) as result',[data,'00000000-0000-0000-0000-000000000001'])
  assert.equal((await run()).rows[0].result.imported,1)
  assert.equal((await run()).rows[0].result.imported,1)
  await assert.rejects(db.query('select serenity_legacy_import_contacts_v1($1::jsonb,$2::uuid)',[data.replace('Rua B','Rua C'),'00000000-0000-0000-0000-000000000001']),/CONFLICT/)
  assert.equal((await db.query('select shipping->>\'street\' as street from serenity_legacy_contacts_v1')).rows[0].street,'Rua B')
  assert.equal((await db.query("select has_table_privilege('authenticated','serenity_legacy_contacts_v1','select') as allowed")).rows[0].allowed,false)
 } finally { await db.close() }
})
