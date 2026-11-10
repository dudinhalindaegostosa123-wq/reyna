import {test} from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
test('combined customer installation is repeatable, preserves orders and supports both restock and sales reporting',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
  create table products(id uuid primary key,slug text,name text,sku text,product_type text,status text,visibility text,stock_status text,stock_quantity integer);
  create table product_variants(id uuid primary key,product_id uuid,woo_id bigint,name text,enabled boolean,stock_status text,stock_quantity integer);
  create table serenity_stock_reservations(product_id uuid,variant_id uuid,quantity integer,state text,expires_at timestamptz);
  create table serenity_orders(id uuid primary key,status text,paid_at timestamptz,created_at timestamptz,items jsonb);
  create table serenity_checkout_payments_v2(checkout_id uuid,environment text,refunded_cents bigint);`)
  const id=randomUUID(),order=randomUUID()
  await db.query("insert into products values($1,'lua','Lua','TN1057','simple','published','visible','outofstock',0)",[id])
  await db.query("insert into serenity_orders values($1,'paid',now(),now(),$2)",[order,JSON.stringify([{product_id:id,quantity:2,name:'Lua'}])])
  const sql=readFileSync(new URL('../database/releases/2026-11-08-estoque-mais-vendidos.sql',import.meta.url),'utf8')
  await db.exec(sql);await db.exec(sql)
  assert.equal((await db.query('select * from serenity_bestsellers_v1()')).rows[0].quantity,2)
  await db.query("select serenity_restock_subscribe_v1('lua','','a@example.com',repeat('a',64))")
  await db.exec("update products set stock_status='instock',stock_quantity=1")
  assert.equal((await db.query('select * from serenity_restock_claim_v1()')).rows[0].slug,'lua')
  assert.equal((await db.query('select count(*) n from serenity_orders')).rows[0].n,1)
 }finally{await db.close()}
})
