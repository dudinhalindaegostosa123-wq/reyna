import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const migration=readFileSync(new URL('../database/email/01-notificacoes.sql',import.meta.url),'utf8')
test('email outbox: production paid only, shipment ownership, unique events and conservative retry leases',async()=>{
 const db=new PGlite()
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table serenity_orders(id uuid primary key,source text,status text,number int,customer_snapshot jsonb,items jsonb,total numeric);
 create table serenity_checkout_sessions_v2(id uuid primary key,environment text);
 create table serenity_label_purchases(order_id uuid primary key,remote_id uuid,phase text,carrier_status text);
 create table serenity_order_dispatches(order_id uuid primary key,remote_id uuid,dispatched_at timestamptz);
 create table serenity_shipment_tracking(order_id uuid primary key,remote_id uuid,carrier_status text,tracking_code text);`)
 await db.exec(migration);await db.exec(migration) // instalação repetível
 const real='10000000-0000-4000-8000-000000000001',sandbox='10000000-0000-4000-8000-000000000002',remote='20000000-0000-4000-8000-000000000001',old='20000000-0000-4000-8000-000000000002'
 await db.query(`insert into serenity_checkout_sessions_v2 values ($1,'production'),($2,'test')`,[real,sandbox])
 const snapshot=JSON.stringify({name:'Nicole',email:'nicole@example.com',document:'PRIVATE'})
 const items=JSON.stringify([{name:'Joia',quantity:2,unit_price:120,unit_cost:40,supplier:'PRIVATE'}])
 await db.query(`insert into serenity_orders values ($1,'site','pending',13,$3,$4,240),($2,'site','paid',14,$3,$4,240)`,[real,sandbox,snapshot,items])
 assert.equal((await db.query('select * from serenity_email_outbox_v1')).rows.length,0)
 await db.query(`update serenity_orders set status='paid' where id=$1`,[real])
 await db.query(`update serenity_orders set status='paid' where id=$1`,[real])
 let rows=(await db.query('select * from serenity_email_outbox_v1')).rows
 assert.equal(rows.length,1);assert.equal(rows[0].recipient,'nicole@example.com');assert.ok(!JSON.stringify(rows[0].payload).includes('PRIVATE'))
 // Comprar/gerar etiqueta não significa postagem.
 await db.query(`insert into serenity_label_purchases values($1,$2,'ready','generated')`,[real,remote])
 await db.query(`insert into serenity_shipment_tracking values($1,$2,'generated','CODE')`,[real,remote])
 assert.equal((await db.query('select * from serenity_email_outbox_v1')).rows.length,1)
 // Atualização antiga não pode avisar envio da etiqueta substituída.
 await db.query(`update serenity_shipment_tracking set remote_id=$2,carrier_status='posted' where order_id=$1`,[real,old])
 assert.equal((await db.query('select * from serenity_email_outbox_v1')).rows.length,1)
 await db.query(`insert into serenity_order_dispatches values($1,$2,now())`,[real,remote])
 await db.query(`update serenity_shipment_tracking set remote_id=$2,carrier_status='posted' where order_id=$1`,[real,remote])
 assert.equal((await db.query('select * from serenity_email_outbox_v1')).rows.length,2)
 await db.query(`update serenity_shipment_tracking set carrier_status='delivered' where order_id=$1`,[real])
 assert.equal((await db.query('select * from serenity_email_outbox_v1')).rows.length,3)
 assert.equal((await db.query(`select payload->>'tracking' as code from serenity_email_outbox_v1 where kind='shipped'`)).rows[0].code,'CODE')
 const job=(await db.query('select * from serenity_email_claim_v1(null)')).rows[0]
 assert.equal(job.kind,'paid')
 assert.equal((await db.query(`select serenity_email_finish_v1($1,$2,'sent',null) as done`,[job.id,old])).rows[0].done,false)
 assert.equal((await db.query(`select serenity_email_finish_v1($1,$2,'sent',null) as done`,[job.id,job.lease_id])).rows[0].done,true)
 const next=(await db.query('select * from serenity_email_claim_v1(null)')).rows[0]
 await db.query(`update serenity_email_outbox_v1 set leased_at=now()-interval '6 minutes' where id=$1`,[next.id])
 await db.query('select * from serenity_email_claim_v1(null)')
 assert.equal((await db.query('select state from serenity_email_outbox_v1 where id=$1',[next.id])).rows[0].state,'review')
 await db.exec('set role anon')
 await assert.rejects(db.query('select * from serenity_email_outbox_v1'))
 await assert.rejects(db.query('select * from serenity_email_claim_v1(null)'))
 } finally { await db.close() }
})

test('owner and customer get independent jobs exactly once, with saved options, no test or retroactive notifications',async()=>{
 const db=new PGlite()
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table serenity_orders(id uuid primary key,source text,status text,number int,customer_snapshot jsonb,items jsonb,total numeric);
 create table serenity_checkout_sessions_v2(id uuid primary key,environment text);
 create table serenity_label_purchases(order_id uuid primary key,remote_id uuid,phase text,carrier_status text);
 create table serenity_order_dispatches(order_id uuid primary key,remote_id uuid,dispatched_at timestamptz);
 create table serenity_shipment_tracking(order_id uuid primary key,remote_id uuid,carrier_status text,tracking_code text);`)
 await db.exec(migration)
 const id='10000000-0000-4000-8000-000000000001'
 await db.query(`insert into serenity_checkout_sessions_v2 values($1,'production')`,[id])
 await db.query(`insert into serenity_orders values($1,'site','paid',14,'{"email":"fixture@example.com"}','[]',80)`,[id])
 const upgrade=readFileSync(new URL('../database/email/02-aviso-nova-compra.sql',import.meta.url),'utf8')
 await db.exec(upgrade);await db.exec(upgrade)
 assert.equal((await db.query(`select * from serenity_email_outbox_v1 where kind='owner_paid'`)).rows.length,0)
 await db.exec('delete from serenity_email_outbox_v1')
 await db.query(`update serenity_orders set status='pending',items=$2 where id=$1`,[id,JSON.stringify([{name:'Topo',quantity:1,unit_price:80,stem_length_mm:'8',sterilized:false,anodization:'Azul',voltage:'25',unit_cost:1,supplier:'PRIVATE'}])])
 await db.query(`update serenity_orders set status='paid' where id=$1`,[id])
 await db.query(`update serenity_orders set status='paid' where id=$1`,[id])
 let rows=(await db.query(`select * from serenity_email_outbox_v1 order by kind`)).rows
 assert.equal(rows.length,2)
 assert.equal(rows.find(r=>r.kind==='owner_paid').recipient,'contato@serenitypiercings.com.br')
 assert.equal(rows.find(r=>r.kind==='paid').recipient,'fixture@example.com')
 for(const row of rows){assert.equal(row.payload.items[0].stem_length_mm,'8');assert.equal(row.payload.items[0].sterilized,false);assert.equal(row.payload.items[0].anodization,'Azul');assert.ok(!JSON.stringify(row.payload).includes('PRIVATE'))}
 const first=(await db.query('select * from serenity_email_claim_v1(null)')).rows[0]
 await db.query(`select serenity_email_finish_v1($1,$2,'sent',null)`,[first.id,first.lease_id])
 const second=(await db.query('select * from serenity_email_claim_v1(null)')).rows[0]
 assert.notEqual(first.kind,second.kind)
 await db.query(`select serenity_email_finish_v1($1,$2,'review',null)`,[second.id,second.lease_id])
 assert.equal((await db.query('select * from serenity_email_claim_v1(null)')).rows.length,0)
 const sandbox='10000000-0000-4000-8000-000000000002',manual='10000000-0000-4000-8000-000000000003'
 await db.query(`insert into serenity_checkout_sessions_v2 values($1,'test')`,[sandbox])
 await db.query(`insert into serenity_orders values($1,'site','paid',15,'{"email":"fixture@example.com"}','[]',80),($2,'manual','paid',16,'{"email":"fixture@example.com"}','[]',80)`,[sandbox,manual])
 assert.equal((await db.query('select * from serenity_email_outbox_v1')).rows.length,2)
 await db.exec('set role anon')
 await assert.rejects(db.query(`select serenity_email_enqueue_v1($1,'paid',null)`,[id]))
 }finally{await db.close()}
})
