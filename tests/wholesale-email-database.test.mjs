import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
const read=name=>readFileSync(new URL(`../database/email/${name}`,import.meta.url),'utf8')
const id='10000000-0000-4000-8000-000000000001',retail='10000000-0000-4000-8000-000000000002',unconfirmed='10000000-0000-4000-8000-000000000003'
test('wholesale notifications: verified requests, true approvals, no historical backfill or repeated status notices, independent order queue',async()=>{
 const db=new PGlite()
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table serenity_customers(id uuid primary key,name text,email text);
 create table serenity_customer_accounts(user_id uuid primary key,customer_id uuid,wholesale_status text,version bigint);
 create table serenity_orders(id uuid primary key,source text,status text,number int,customer_snapshot jsonb,items jsonb,total numeric);
 create table serenity_checkout_sessions_v2(id uuid primary key,environment text);
 create table serenity_label_purchases(order_id uuid primary key,remote_id uuid,phase text,carrier_status text);
 create table serenity_order_dispatches(order_id uuid primary key,remote_id uuid,dispatched_at timestamptz);
 create table serenity_shipment_tracking(order_id uuid primary key,remote_id uuid,carrier_status text,tracking_code text);`)
 await db.exec(read('01-notificacoes.sql'));await db.exec(read('02-aviso-nova-compra.sql'))
 await db.query(`insert into auth.users values($1,'verified@example.com',now()),($2,'retail@example.com',now()),($3,'unconfirmed@example.com',null)`,[id,retail,unconfirmed])
 await db.query(`insert into serenity_customers values($1,'Atacadista <fixture>','different@example.com'),($2,'Varejo','retail@example.com'),($3,'Não confirmado','unconfirmed@example.com')`,[id,retail,unconfirmed])
 // Instalar não deve enviar para contas que já estavam aprovadas.
 await db.query(`insert into serenity_customer_accounts values($1,$1,'approved',1)`,[id])
 const migration=read('03-avisos-atacado.sql');await db.exec(migration);await db.exec(migration)
 assert.equal((await db.query('select * from serenity_email_outbox_v1')).rows.length,0)
 await db.query(`insert into serenity_customer_accounts values($1,$1,'not_requested',1),($2,$2,'pending',1)`,[retail,unconfirmed])
 assert.equal((await db.query('select * from serenity_email_outbox_v1')).rows.length,0)
 await db.query(`update serenity_customer_accounts set wholesale_status='pending',version=2 where user_id=$1`,[id])
 let rows=(await db.query('select * from serenity_email_outbox_v1')).rows
 assert.equal(rows.length,1);assert.equal(rows[0].kind,'wholesale_requested');assert.equal(rows[0].recipient,'contato@serenitypiercings.com.br');assert.equal(rows[0].payload.email,'verified@example.com');assert.equal(rows[0].order_id,null)
 await db.query(`update serenity_customer_accounts set wholesale_status='pending',version=3 where user_id=$1`,[id])
 assert.equal((await db.query('select * from serenity_email_outbox_v1')).rows.length,1)
 await db.query(`update serenity_customer_accounts set wholesale_status='approved',version=4 where user_id=$1`,[id])
 await db.query(`update serenity_customer_accounts set wholesale_status='approved',version=5 where user_id=$1`,[id])
 rows=(await db.query('select * from serenity_email_outbox_v1')).rows
 assert.equal(rows.length,2);assert.equal(rows.find(r=>r.kind==='wholesale_approved').recipient,'verified@example.com')
 // Um worker filtrado por pedido não deve consumir avisos de atacado.
 assert.equal((await db.query('select * from serenity_email_claim_v1($1)',[id])).rows.length,0)
 // Suspensão anterior ao envio impede a mensagem de aprovação desatualizada.
 await db.query(`update serenity_customer_accounts set wholesale_status='suspended',version=6 where user_id=$1`,[id])
 let job=(await db.query('select * from serenity_email_claim_v1(null)')).rows[0]
 assert.equal(job.kind,'wholesale_requested')
 await db.query(`select serenity_email_finish_v1($1,$2,'sent',null)`,[job.id,job.lease_id])
 assert.equal((await db.query('select * from serenity_email_claim_v1(null)')).rows.length,0)
 assert.equal((await db.query(`select error_code from serenity_email_outbox_v1 where kind='wholesale_approved'`)).rows[0].error_code,'EMAIL_WHOLESALE_INACTIVE')
 await db.query(`update serenity_customer_accounts set wholesale_status='approved',version=7 where user_id=$1`,[id])
 job=(await db.query('select * from serenity_email_claim_v1(null)')).rows[0]
 assert.equal(job.kind,'wholesale_approved');assert.equal(Number(job.event_version),7)
 await db.query(`select serenity_email_finish_v1($1,$2,'sent',null)`,[job.id,job.lease_id])
 // Após a atualização, os avisos de compra continuam funcionando.
 await db.query(`insert into serenity_checkout_sessions_v2 values($1,'production')`,[id])
 await db.query(`insert into serenity_orders values($1,'site','paid',99,'{"name":"Pedido","email":"buyer@example.com"}','[]',80)`,[id])
 rows=(await db.query(`select * from serenity_email_outbox_v1 where order_id=$1`,[id])).rows
 assert.equal(rows.length,2);assert.ok(rows.every(r=>r.account_user_id===null))
 await db.exec('set role anon')
 await assert.rejects(db.query('select * from serenity_email_outbox_v1'))
 await assert.rejects(db.query('select * from serenity_email_claim_v1(null)'))
 await db.exec('reset role;set role authenticated')
 await assert.rejects(db.query('select * from serenity_email_outbox_v1'))
 }finally{await db.close()}
})
