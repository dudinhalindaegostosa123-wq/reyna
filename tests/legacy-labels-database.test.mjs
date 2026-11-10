import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8')
const actor='10000000-0000-4000-8000-000000000001'
const remote='20000000-0000-4000-8000-000000000001'

test('legacy labels remain isolated from sales, reuse purchase locks and do not rebuy imported paid shipments', async () => {
 const db=new PGlite()
 try {
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);')
  await db.exec(`create table serenity_legacy_orders_v1(old_id bigint primary key,parent_id bigint,kind text,original_status text,created_at timestamptz,total numeric,payload jsonb,needs_review boolean,visible boolean);
    create table serenity_legacy_items_v1(old_id bigint primary key,order_id bigint,kind text,name text,payload jsonb);`)
  await db.exec(read('tests/fixtures/labels/schema.sql'))
  await db.exec(`create table serenity_shipment_tracking(order_id uuid,remote_id uuid,carrier_status text,tracking_code text);
    create function forbid_sale() returns trigger language plpgsql as $$begin raise exception 'SALE_SIDE_EFFECT';end$$;
    create trigger forbid_sale before insert or update on serenity_orders for each row execute function forbid_sale();`)
  for(const file of readdirSync(new URL('./fixtures/labels/',import.meta.url)).filter(f=>f.startsWith('serenity_'))) await db.exec(read('tests/fixtures/labels/'+file))
  await db.exec(read('tests/fixtures/labels/center-v1.sql'))
  const sql=read('database/legacy-labels/01-etiquetas-antigas.sql')
  await db.exec(sql);await db.exec(sql)
  await db.exec(`insert into serenity_legacy_orders_v1 values
    (10,null,'shop_order','wc-processing','2025-01-01Z',100,'{"email":"ana@example.com","primeiro_nome":"Ana","cep":"01000000","endereco":"Rua A"}',false,true),
    (11,null,'shop_order','wc-cancelled','2025-01-01Z',100,'{}',false,true),
    (12,null,'shop_order','wc-processing','2025-01-01Z',100,'{}',false,true),
    (13,null,'shop_order','wc-completed','2025-01-01Z',100,'{}',false,true),
    (14,13,'shop_order_refund','wc-completed','2025-01-01Z',-10,'{}',false,false);
    insert into serenity_legacy_items_v1 values(1,10,'line_item','Joia','{"quantidade":"2","total":"100","imposto":"0"}'),(2,12,'line_item','Joia','{"quantidade":"3","total":"100"}');`)
  const start=async(id,intent='new')=>(await db.query('select serenity_legacy_label_start_v1($1,$2,$3) id',[id,intent,actor])).rows[0].id
  const waiting=(await db.query("select label_stage from serenity_admin_label_center_v2 where legacy_id=10")).rows[0]
  assert.equal(waiting.label_stage,'unverified')
  assert.equal((await db.query("select count(*) n from serenity_admin_label_center_v2 where label_stage='to_buy'")).rows[0].n,0)
  await db.exec(read('database/legacy-labels/02-separar-etiquetas-nao-conferidas.sql'))
  let id=await start(10)
  assert.equal(await start(10),id)
  await assert.rejects(start(11),/LEGACY_LABEL_REVIEW/)
  await assert.rejects(start(13),/LEGACY_LABEL_REVIEW/)
  assert.equal((await db.query('select count(*) n from serenity_orders')).rows[0].n,0)
  const shipment=(await db.query('select * from serenity_legacy_shipping_orders_v1 where id=$1',[id])).rows[0]
  assert.equal(shipment.items[0].unit_price,50)
  assert.equal(shipment.customer_snapshot.document,'')
  assert.equal((await db.query('select count(*) n from serenity_admin_label_center_v2 where source_kind=$1',['legacy'])).rows[0].n,2)
  const context={checkoutServiceId:'2',external_binding:{postalCode:'01000000',document:'12345678901'}}
  const selected={id:'existing',provider:{id:'2'}}
  await db.query('select serenity_legacy_label_bind_v1($1,$2,$3,$4,15,$5)',[id,remote,context,selected,actor])
  await db.query('select serenity_legacy_label_bind_v1($1,$2,$3,$4,15,$5)',[id,remote,context,selected,actor])
  const job=(await db.query('select * from serenity_legacy_label_jobs_v1 where order_id=$1',[id])).rows[0]
  await db.query("select serenity_legacy_label_purchase_observe_v1($1,$2,$3,'generated',true,true,false,1500,$4)",[id,job.operation,remote,actor])
  assert.equal((await db.query('select phase from serenity_legacy_label_purchases_v1 where order_id=$1',[id])).rows[0].phase,'ready')
  await assert.rejects(db.query("select serenity_legacy_label_purchase_claim_v1($1,$2,'buy',null,$3)",[id,job.operation,actor]),/PURCHASE_LOCKED/)
  await assert.rejects(db.query('select serenity_legacy_label_save_draft_v1($1,$2,0,$3,1,$4)',[id,{},shipment.updated_at,actor]),/LABEL_JOB_LOCKED/)
  await assert.rejects(db.exec('insert into serenity_label_jobs select * from serenity_legacy_label_jobs_v1'),/LABEL_REMOTE_ALREADY_LINKED/)
  const other=await start(12)
  const split=(await db.query('select items from serenity_legacy_shipping_orders_v1 where id=$1',[other])).rows[0].items
  assert.equal(split.reduce((sum,item)=>sum+Math.round(item.unit_price*100)*item.quantity,0),10000)
  await assert.rejects(db.query('select serenity_legacy_label_bind_v1($1,$2,$3,$4,15,$5)',[other,remote,context,selected,actor]),/unique|ALREADY_LINKED/)
  // Nova etiqueta: dados -> cotação -> preparação -> revisão -> compra única.
  const nextOperation='30000000-0000-4000-8000-000000000001'
  const nextRemote='20000000-0000-4000-8000-000000000002'
  const version=(await db.query('select updated_at from serenity_legacy_shipping_orders_v1 where id=$1',[other])).rows[0].updated_at
  await db.query('select serenity_legacy_label_save_draft_v1($1,$2,0,$3,1,$4)',[other,{},version,actor])
  const quotes=[{id:'choice1',provider:{id:1},cents:1000},{id:'choice2',provider:{id:2},cents:1500}]
  await db.query('select serenity_legacy_label_job_quote_v1($1,$2,$3,1,1,1,$4,$5,$6)',[other,nextOperation,version,{checkoutServiceId:'legacy-choice'},quotes,actor])
  await db.query('select serenity_legacy_label_job_claim_v1($1,$2,$3,$4)',[other,nextOperation,'choice2',actor])
  await db.query('select serenity_legacy_label_job_finish_v1($1,$2,$3,$4,15,$5)',[other,nextOperation,'prepared',nextRemote,actor])
  await db.query("select serenity_legacy_label_purchase_observe_v1($1,$2,$3,'pending',false,false,false,1500,$4)",[other,nextOperation,nextRemote,actor])
  const review='40000000-0000-4000-8000-000000000001'
  await db.query('select serenity_legacy_label_purchase_review_v1($1,$2,$3,$4,1500,$5,$6)',[other,nextOperation,nextRemote,review,version,actor])
  await db.query("select serenity_legacy_label_purchase_claim_v1($1,$2,'buy',$3,$4)",[other,nextOperation,review,actor])
  await assert.rejects(db.query("select serenity_legacy_label_purchase_claim_v1($1,$2,'buy',$3,$4)",[other,nextOperation,review,actor]),/PURCHASE_LOCKED/)
  await db.query("select serenity_legacy_label_purchase_observe_v1($1,$2,$3,'generated',true,true,false,1500,$4)",[other,nextOperation,nextRemote,actor])
  assert.equal((await db.query("select count(*) n from serenity_admin_label_center_v2 where label_stage='purchased'")).rows[0].n,2)
  assert.equal((await db.query('select count(*) n from serenity_orders')).rows[0].n,0)
  await db.exec('set role anon')
  await assert.rejects(db.query('select * from serenity_legacy_shipping_orders_v1'))
  await assert.rejects(db.query('select * from serenity_admin_label_center_v2'))
  await assert.rejects(db.query('select serenity_legacy_label_start_v1(10,$1,$2)',['new',actor]))
 } finally {await db.close()}
})
