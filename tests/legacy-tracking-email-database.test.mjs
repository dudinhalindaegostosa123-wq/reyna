import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
const read=name=>readFileSync(new URL('../database/email/'+name,import.meta.url),'utf8')
const id='10000000-0000-4000-8000-000000000001',remote='20000000-0000-4000-8000-000000000001',operation='30000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002'
test('legacy shipment tracking preserves original sales, verifies leases and current bindings, queues unique shipment emails and isolates customer access',async()=>{
 const db=new PGlite()
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('fixture.user',true),'')::uuid$$;
 create table serenity_customers(id uuid primary key,name text,email text);
 create table serenity_customer_accounts(user_id uuid primary key,customer_id uuid,wholesale_status text,version bigint);
 create table serenity_orders(id uuid primary key,source text,status text,number int,customer_snapshot jsonb,items jsonb,total numeric);
 create table serenity_checkout_sessions_v2(id uuid primary key,environment text);
 create table serenity_label_purchases(order_id uuid primary key,remote_id uuid,phase text,carrier_status text);
 create table serenity_order_dispatches(order_id uuid primary key,remote_id uuid,dispatched_at timestamptz);
 create table serenity_shipment_tracking(order_id uuid primary key,remote_id uuid,carrier_status text,tracking_code text);
 create table serenity_legacy_orders_v1(old_id bigint primary key,parent_id bigint,kind text,original_status text,needs_review boolean,visible boolean,account_user_id uuid);
 create table serenity_legacy_shipping_orders_v1(id uuid primary key,legacy_id bigint,number bigint,customer_snapshot jsonb);
 create table serenity_legacy_label_jobs_v1(order_id uuid primary key,remote_id uuid,operation uuid,state text);
 create table serenity_legacy_label_purchases_v1(order_id uuid primary key,remote_id uuid,operation uuid,phase text,carrier_status text);
 create function forbid_sales() returns trigger language plpgsql as $$begin raise exception 'SALE_SIDE_EFFECT';end$$;
 create trigger forbid_sales before insert or update on serenity_orders for each row execute function forbid_sales();`)
 for(const file of ['01-notificacoes.sql','02-aviso-nova-compra.sql','03-avisos-atacado.sql','04-rastreio-emails-historico.sql'])await db.exec(read(file))
 await db.exec(read('04-rastreio-emails-historico.sql'))
 await db.query(`insert into auth.users values($1,'buyer@example.com',now()),($2,'other@example.com',now())`,[id,other])
 await db.query(`insert into serenity_legacy_orders_v1 values(24420,null,'shop_order','wc-processing',false,true,$1)`,[id])
 await db.query(`insert into serenity_legacy_shipping_orders_v1 values($1,24420,24420,'{"name":"Cliente fixture","email":"buyer@example.com"}')`,[id])
 await db.query(`insert into serenity_legacy_label_jobs_v1 values($1,$2,$3,'prepared')`,[id,remote,operation])
 await db.query(`insert into serenity_legacy_label_purchases_v1 values($1,$2,$3,'ready','generated')`,[id,remote,operation])
 assert.equal((await db.query('select * from serenity_email_outbox_v1')).rows.length,0)
 const claim=async()=>(await db.query('select * from serenity_legacy_tracking_claim_v1(2)')).rows
 let job=(await claim())[0];assert.ok(job)
 assert.equal((await claim()).length,0)
 const finish=async(job,status,code='BR123')=>(await db.query('select serenity_legacy_tracking_finish_v1($1,$2,$3,$4,$5,$6,null) done',[job.order_id,job.remote_id,job.operation,job.lease_id,status,code])).rows[0].done
 assert.equal(await finish({...job,lease_id:other},'posted'),false)
 assert.equal(await finish(job,'generated'),true)
 assert.equal((await db.query('select * from serenity_email_outbox_v1')).rows.length,0)
 await db.exec("update serenity_legacy_shipment_tracking_v1 set next_check_at=now()-interval '1 minute'")
 job=(await claim())[0];assert.equal(await finish(job,'posted'),true)
 let notices=(await db.query('select * from serenity_email_outbox_v1')).rows
 assert.equal(notices.length,1);assert.equal(notices[0].kind,'legacy_shipped');assert.equal(notices[0].recipient,'buyer@example.com');assert.equal(notices[0].payload.number,24420)
 assert.equal((await db.query('select carrier_status from serenity_legacy_label_purchases_v1')).rows[0].carrier_status,'posted')
 // Resposta antiga não regride o painel nem duplica o aviso.
 await db.exec("update serenity_legacy_shipment_tracking_v1 set next_check_at=now()-interval '1 minute'")
 job=(await claim())[0];assert.equal(await finish(job,'generated'),true)
 assert.equal((await db.query('select carrier_status from serenity_legacy_label_purchases_v1')).rows[0].carrier_status,'posted')
 assert.equal((await db.query('select * from serenity_email_outbox_v1')).rows.length,1)
 // Apenas o titular confirmado vê o rastreio; anon não lê fila/tabela/RPC de escrita.
 await db.query(`select set_config('fixture.user',$1,false)`,[id]);await db.exec('set role authenticated')
 assert.equal((await db.query('select * from serenity_legacy_tracking_my_v1(array[24420]::bigint[])')).rows.length,1)
 await db.exec('reset role');await db.query(`select set_config('fixture.user',$1,false)`,[other]);await db.exec('set role authenticated')
 assert.equal((await db.query('select * from serenity_legacy_tracking_my_v1(array[24420]::bigint[])')).rows.length,0)
 await assert.rejects(db.query('select * from serenity_legacy_shipment_tracking_v1'))
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from serenity_legacy_tracking_claim_v1(2)'));await assert.rejects(db.query('select * from serenity_email_outbox_v1'))
 await db.exec('reset role')
 // Entrega verificada gera aviso único, sem alterar o histórico financeiro.
 await db.exec("update serenity_legacy_shipment_tracking_v1 set next_check_at=now()-interval '1 minute'")
 job=(await claim())[0];assert.equal(await finish(job,'delivered'),true)
 notices=(await db.query('select * from serenity_email_outbox_v1')).rows;assert.equal(notices.length,2)
 assert.ok(notices.some(row=>row.kind==='legacy_delivered'));assert.equal((await claim()).length,0)
 assert.equal((await db.query('select original_status from serenity_legacy_orders_v1')).rows[0].original_status,'wc-processing')
 assert.equal((await db.query('select * from serenity_orders')).rows.length,0)
 assert.equal((await db.query(`select * from serenity_email_outbox_v1 where kind in('paid','owner_paid')`)).rows.length,0)
 // Cancelamento posterior bloqueia mensagens ainda pendentes.
 await db.exec("update serenity_legacy_orders_v1 set original_status='wc-cancelled'")
 assert.equal((await db.query('select * from serenity_email_claim_v1(null)')).rows.length,0)
 assert.ok((await db.query('select state from serenity_email_outbox_v1')).rows.every(row=>row.state==='failed'))
 // Atualizações de problema no transporte também têm avisos próprios, uma vez por situação.
 const extra='10000000-0000-4000-8000-000000000003'
 await db.query(`insert into serenity_legacy_orders_v1 values(24422,null,'shop_order','wc-processing',false,true,$1)`,[id])
 await db.query(`insert into serenity_legacy_shipping_orders_v1 values($1,24422,24422,'{"name":"Cliente fixture","email":"buyer@example.com"}')`,[extra])
 await db.query(`insert into serenity_legacy_label_jobs_v1 values($1,$2,$3,'prepared')`,[extra,other,other])
 await db.query(`insert into serenity_legacy_label_purchases_v1 values($1,$2,$3,'ready','generated')`,[extra,other,other])
 for(const status of ['suspended','paused','undelivered','undelivered']){
  await db.exec("update serenity_legacy_shipment_tracking_v1 set next_check_at=now()-interval '1 minute'")
  job=(await claim())[0];assert.equal(await finish(job,status),true)
 }
 let updates=(await db.query(`select kind from serenity_email_outbox_v1 where legacy_shipping_id=$1`,[extra])).rows
 assert.deepEqual(updates.map(row=>row.kind).sort(),['legacy_paused','legacy_suspended','legacy_undelivered'])
 // As mesmas ocorrências em pedidos atuais passam pelo trigger existente, sem mensagens duplicadas.
 await db.exec('alter table serenity_orders disable trigger forbid_sales')
 await db.query(`insert into serenity_checkout_sessions_v2 values($1,'production')`,[id])
 await db.query(`insert into serenity_orders values($1,'site','paid',99,'{"name":"Atual","email":"buyer@example.com"}','[]',80)`,[id])
 await db.exec('alter table serenity_orders enable trigger forbid_sales')
 await db.query(`insert into serenity_label_purchases values($1,$2,'ready','generated')`,[id,remote])
 await db.query(`insert into serenity_shipment_tracking values($1,$2,'suspended','BR123')`,[id,remote])
 await db.query(`update serenity_shipment_tracking set carrier_status='suspended' where order_id=$1`,[id])
 updates=(await db.query(`select kind from serenity_email_outbox_v1 where order_id=$1 and kind='shipping_suspended'`,[id])).rows
 assert.equal(updates.length,1)
 }finally{await db.close()}
})
