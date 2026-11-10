import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
test('internal bestsellers aggregate paid quantities across variants, excluding refunds, sandbox and old periods',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table products(id uuid primary key,name text,sku text);
   create table serenity_orders(id uuid primary key,status text,paid_at timestamptz,created_at timestamptz,items jsonb);
   create table serenity_checkout_payments_v2(checkout_id uuid,environment text,refunded_cents bigint);`)
  const sql=readFileSync(new URL('../database/reports/01-mais-vendidos.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql)
  const a=randomUUID(),b=randomUUID();await db.query("insert into products values($1,'Lua','TN1'),($2,'Flor','TN2')",[a,b])
  async function order(status,lines,days=0,payment){const id=randomUUID();await db.query("insert into serenity_orders values($1,$2,now()-make_interval(days=>$3),now()-make_interval(days=>$3),$4)",[id,status,days,JSON.stringify(lines)]);if(payment)await db.query('insert into serenity_checkout_payments_v2 values($1,$2,$3)',[id,payment.env,payment.refund || 0])}
  const item=(id,quantity,variant='')=>({product_id:id,name:'Nome antigo',quantity,variant_id:variant})
  await order('paid',[item(a,2,'v1'),item(a,3,'v2'),item(b,1)])
  await order('paid',[item(b,2)])
  await order('paid',[item(b,5)],90)
  await order('pending',[item(a,100)])
  await order('cancelled',[item(a,100)])
  await order('refunded',[item(a,100)])
  await order('paid',[item(a,100)],0,{env:'sandbox'})
  await order('paid',[item(a,100)],0,{env:'production',refund:1})
  const rows=(await db.query('select * from serenity_bestsellers_v1(30,0,50)')).rows
  assert.equal(rows.length,2);assert.equal(rows[0].product_id,a);assert.equal(rows[0].quantity,5);assert.equal(rows[0].orders,1);assert.equal(rows[0].name,'Lua');assert.equal(rows[0].total_products,2)
  assert.equal(rows[1].quantity,3);assert.equal(rows[1].orders,2)
  assert.equal((await db.query('select * from serenity_bestsellers_v1(0,0,1)')).rows[0].product_id,b)
  assert.equal((await db.query('select * from serenity_bestsellers_v1(30,1,1)')).rows[0].product_id,b)
  await db.exec('set role anon');await assert.rejects(db.query('select * from serenity_bestsellers_v1()'),/permission denied/)
 }finally{await db.close()}
})
