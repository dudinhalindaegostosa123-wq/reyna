import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
async function fixture(){
 const db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table products(id uuid primary key,slug text,name text,product_type text,status text,visibility text,stock_status text,stock_quantity integer);
 create table product_variants(id uuid primary key,product_id uuid references products(id),woo_id bigint,name text,enabled boolean,stock_status text,stock_quantity integer);
 create table serenity_stock_reservations(product_id uuid,variant_id uuid,quantity integer,state text,expires_at timestamptz);`)
 const sql=readFileSync(new URL('../database/restock/01-avisos-estoque.sql',import.meta.url),'utf8')
 await db.exec(sql);await db.exec(sql)
 return db
}
test('restock lifecycle waits for sellable stock, deduplicates opt-ins, uses leases and permits a new stock cycle',async()=>{
 const db=await fixture();try{
  const id=randomUUID();await db.query("insert into products values($1,'lua','Lua','simple','published','visible','outofstock',0)",[id])
  const subscribe=()=>db.query("select serenity_restock_subscribe_v1('lua','','Cliente@Example.com',repeat('a',64))")
  const claim=async()=>(await db.query('select * from serenity_restock_claim_v1()')).rows
  await subscribe();await subscribe()
  assert.equal((await db.query('select count(*) n from serenity_restock_subscriptions_v1')).rows[0].n,1)
  assert.equal((await claim()).length,0)
  await db.query("update products set stock_status='instock',stock_quantity=1 where id=$1",[id])
  await db.query("insert into serenity_stock_reservations values($1,null,1,'reserved',now()+interval '1 hour')",[id])
  assert.equal((await claim()).length,0)
  await db.exec('delete from serenity_stock_reservations')
  const [job]=await claim();assert.equal(job.recipient,'cliente@example.com');assert.equal(job.slug,'lua')
  assert.equal((await claim()).length,0)
  const ready=async()=> (await db.query('select serenity_restock_ready_v1($1,$2) ready',[job.id,job.lease_id])).rows[0].ready
  assert.equal(await ready(),true)
  await db.exec('update products set stock_quantity=0');assert.equal(await ready(),false)
  await db.exec('update products set stock_quantity=1')
  assert.equal((await db.query("select serenity_restock_finish_v1($1,$2,'sent',null) done",[job.id,job.lease_id])).rows[0].done,true)
  assert.equal((await db.query("select serenity_restock_finish_v1($1,$2,'sent',null) done",[job.id,job.lease_id])).rows[0].done,false)
  assert.equal((await claim()).length,0)
  await assert.rejects(subscribe(),/RESTOCK_AVAILABLE/)
  await db.exec("update products set stock_status='outofstock',stock_quantity=0")
  await subscribe()
  const renewed=(await db.query('select id,token,state from serenity_restock_subscriptions_v1')).rows[0]
  assert.notEqual(renewed.id,job.id);assert.notEqual(renewed.token,job.token);assert.equal(renewed.state,'waiting')
  await db.query('select serenity_restock_cancel_v1($1)',[renewed.token])
  await db.exec("update products set stock_status='instock',stock_quantity=2")
  assert.equal((await claim()).length,0)
  await db.exec('set role anon');await assert.rejects(claim(),/permission denied/);await assert.rejects(db.query('select * from serenity_restock_subscriptions_v1'),/permission denied/)
 }finally{await db.close()}
})
test('variant subscriptions wait for the exact enabled variation and expired leases require review; request rate is bounded',async()=>{
 const db=await fixture();try{
  const id=randomUUID(),blue=randomUUID(),pink=randomUUID(),other=randomUUID()
  await db.query("insert into products values($1,'flor','Flor','variable','published','visible','instock',null),($2,'outra','Outra','simple','published','visible','outofstock',0)",[id,other])
  await db.query("insert into product_variants values($1,$2,101,'Azul',true,'outofstock',0),($3,$2,102,'Rosa',true,'instock',1)",[blue,id,pink])
  const subscribe=()=>db.query("select serenity_restock_subscribe_v1('flor','101','a@example.com',repeat('a',64))")
  await subscribe();assert.equal((await db.query('select * from serenity_restock_claim_v1()')).rows.length,0)
  await assert.rejects(db.query("select serenity_restock_subscribe_v1('outra','101','a@example.com',repeat('b',64))"),/RESTOCK_VARIANT/)
  await db.query("update product_variants set stock_status='instock',stock_quantity=1 where id=$1",[blue])
  const [job]=(await db.query('select * from serenity_restock_claim_v1()')).rows
  assert.equal(job.variation,'Azul');assert.equal(job.variant,'101')
  await db.exec("update serenity_restock_subscriptions_v1 set leased_at=now()-interval '11 minutes'")
  assert.equal((await db.query('select * from serenity_restock_claim_v1()')).rows.length,0)
  assert.equal((await db.query('select state from serenity_restock_subscriptions_v1')).rows[0].state,'review')
  for(let i=0;i<20;i++)await db.query("select serenity_restock_subscribe_v1('outra','','same@example.com',repeat('c',64))")
  await assert.rejects(db.query("select serenity_restock_subscribe_v1('outra','','same@example.com',repeat('c',64))"),/RESTOCK_RATE/)
 }finally{await db.close()}
})
