import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
test('label jewelry search reads original item codes, includes legacy names, and does not duplicate orders',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create table serenity_orders(id uuid primary key,items jsonb);
    create table serenity_legacy_items_v1(order_id bigint,kind text,name text,payload jsonb);
    create table serenity_admin_label_center_v2(order_id uuid,source_kind text,legacy_id bigint,label_stage text);
    insert into serenity_orders values('10000000-0000-4000-8000-000000000001','[{"sku":"TN623","name":"Argola"},{"sku":"TN623","name":"Argola"}]'),('10000000-0000-4000-8000-000000000002','[{"sku":"TN1670","name":"Microbell"}]');
    insert into serenity_legacy_items_v1 values(24421,'line_item','TN623 - Argola','{}'),(24421,'line_item','TN1670 - Microbell','{}'),(24422,'shipping','TN623 transportadora','{}');
    insert into serenity_admin_label_center_v2 values('10000000-0000-4000-8000-000000000001','current',null,'to_buy'),('10000000-0000-4000-8000-000000000002','current',null,'purchased'),('10000000-0000-4000-8000-000000000003','legacy',24421,'unverified'),('10000000-0000-4000-8000-000000000004','legacy',24422,'to_buy');`)
  const sql=readFileSync(new URL('../database/legacy-labels/04-busca-codigo-joia.sql',import.meta.url),'utf8')
  await db.exec(sql);await db.exec(sql)
  let rows=(await db.query("select * from serenity_admin_label_center_v3 where jewelry_search ilike '%tn623%'")).rows
  assert.equal(rows.length,2)
  rows=(await db.query("select * from serenity_admin_label_center_v3 where jewelry_search ilike '%TN1670%' and label_stage='unverified'")).rows
  assert.equal(rows.length,1);assert.equal(rows[0].legacy_id,24421)
  await db.exec('set role anon')
  await assert.rejects(db.query('select * from serenity_admin_label_center_v3'))
 }finally{await db.close()}
})
