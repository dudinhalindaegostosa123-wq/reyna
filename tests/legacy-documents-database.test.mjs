import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
const actor='10000000-0000-4000-8000-000000000001'
const migration=readFileSync(new URL('../database/legacy/03-documentos-destinatarios.sql',import.meta.url),'utf8')
test('document recovery separates conflicts, shared identities and different recipients, and stays private and repeatable',async()=>{
 const db=new PGlite()
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create table serenity_legacy_orders_v1(old_id bigint primary key,kind text,visible boolean,original_status text,needs_review boolean,payload jsonb);`)
 await db.exec(migration);await db.exec(migration)
 const person=(name,delivery=name)=>({primeiro_nome:name,sobrenome:'Silva',entrega_primeiro_nome:delivery,entrega_sobrenome:'Silva'})
 for(const [id,name,delivery] of [[10,'Ana','Ana'],[11,'Bia','Bia'],[12,'Carol','Carol'],[13,'Dani','Dani'],[14,'Eva','Fabi'],[15,'Gabi','Gabi']]) await db.query("insert into serenity_legacy_orders_v1 values($1,'shop_order',true,'wc-processing',false,$2)",[id,person(name,delivery)])
 const row=(id,documents,invalid=false)=>({order_id:String(id),documents,invalid})
 const batch=[row(10,['52998224725']),row(11,['11144477735','12345678909']),row(12,['12345678909']),row(13,['12345678909']),row(14,['16899535009']),row(15,[],true)]
 let summary=(await db.query('select serenity_legacy_import_documents_v1($1,$2) s',[JSON.stringify(batch),actor])).rows[0].s
 assert.equal(summary.ready,1);assert.equal(summary.review,5)
 const saved=(await db.query('select * from serenity_legacy_documents_v1 order by order_id')).rows
 assert.equal(saved[0].document,'52998224725');assert.equal(saved[0].recipient_key,'ana silva')
 assert.ok(saved.slice(1).every(r=>r.document===null))
 assert.equal(saved.find(r=>r.order_id===11).reason,'conflict')
 assert.equal(saved.find(r=>r.order_id===12).reason,'shared')
 assert.equal(saved.find(r=>r.order_id===14).reason,'recipient')
 summary=(await db.query('select serenity_legacy_import_documents_v1($1,$2) s',[JSON.stringify(batch),actor])).rows[0].s
 assert.equal(summary.ready,1)
 // A smaller follow-up file cannot silently approve a previously quarantined order.
 summary=(await db.query('select serenity_legacy_import_documents_v1($1,$2) s',[JSON.stringify([row(11,['11144477735'])]),actor])).rows[0].s
 assert.equal(summary.ready,0);assert.equal(summary.review,1)
 await assert.rejects(db.query('select serenity_legacy_import_documents_v1($1,$2)',[JSON.stringify([row(10,['11144477735'])]),actor]),/CONFLICT/)
 await assert.rejects(db.query('select serenity_legacy_import_documents_v1($1,$2)',[JSON.stringify([row(10,['00000000000'])]),actor]),/INVALID/)
 await db.exec('set role authenticated')
 await assert.rejects(db.query('select * from serenity_legacy_documents_v1'))
 await assert.rejects(db.query('select serenity_legacy_import_documents_v1($1,$2)',[JSON.stringify(batch),actor]))
 }finally{await db.close()}
})
