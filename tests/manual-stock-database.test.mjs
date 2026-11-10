import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
test('manual out-of-stock and quantities survive saves for products and variants after removing forced unlimited-stock triggers',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create table products(id integer primary key,name text,stock_status text,stock_quantity integer);
   create table product_variants(id integer primary key,name text,stock_status text,stock_quantity integer);
   create function serenity_unlimited_stock_v1() returns trigger language plpgsql as $$begin new.stock_status:='instock';new.stock_quantity:=null;return new;end$$;
   create trigger serenity_unlimited_stock_v1 before insert or update on products for each row execute function serenity_unlimited_stock_v1();
   create trigger serenity_unlimited_stock_v1 before insert or update on product_variants for each row execute function serenity_unlimited_stock_v1();
   insert into products values(1,'Peça','outofstock',0);insert into product_variants values(1,'6mm','outofstock',0);`)
  assert.equal((await db.query('select stock_status from products')).rows[0].stock_status,'instock')
  const sql=readFileSync(new URL('../database/commerce/08-respeitar-estoque-manual.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql)
  for(const table of ['products','product_variants']){
   await db.exec(`update ${table} set stock_status='outofstock',stock_quantity=0 where id=1;update ${table} set name='Editado' where id=1;`)
   const off=(await db.query(`select stock_status,stock_quantity from ${table}`)).rows[0]
   assert.equal(off.stock_status,'outofstock');assert.equal(off.stock_quantity,0)
   await db.exec(`update ${table} set stock_status='instock',stock_quantity=3 where id=1`)
   assert.equal((await db.query(`select stock_quantity from ${table}`)).rows[0].stock_quantity,3)
  }
 }finally{await db.close()}
})
test('manual unavailability enables the existing notify-me subscription and later stock becomes sellable again',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table products(id uuid primary key,slug text,name text,product_type text,status text,visibility text,stock_status text,stock_quantity integer);
   create table product_variants(id uuid primary key,product_id uuid references products(id),woo_id bigint,name text,enabled boolean,stock_status text,stock_quantity integer);
   create table serenity_stock_reservations(product_id uuid,variant_id uuid,quantity integer,state text,expires_at timestamptz);
   create function serenity_unlimited_stock_v1() returns trigger language plpgsql as $$begin new.stock_status:='instock';new.stock_quantity:=null;return new;end$$;
   create trigger serenity_unlimited_stock_v1 before insert or update on products for each row execute function serenity_unlimited_stock_v1();
   insert into products values('11111111-1111-4111-8111-111111111111','joia','Joia','simple','published','visible','instock',null);`)
  await db.exec(readFileSync(new URL('../database/restock/01-avisos-estoque.sql',import.meta.url),'utf8'))
  await db.exec(readFileSync(new URL('../database/commerce/08-respeitar-estoque-manual.sql',import.meta.url),'utf8'))
  await db.exec("update products set stock_status='outofstock',stock_quantity=0 where slug='joia'")
  await db.query("select serenity_restock_subscribe_v1('joia',null,'teste@example.com',$1)",['a'.repeat(64)])
  assert.equal((await db.query('select state from serenity_restock_subscriptions_v1')).rows[0].state,'waiting')
  assert.equal((await db.query("select serenity_restock_available_v1('11111111-1111-4111-8111-111111111111',null) ready")).rows[0].ready,false)
  await db.exec("update products set stock_status='instock',stock_quantity=3 where slug='joia'")
  assert.equal((await db.query("select serenity_restock_available_v1('11111111-1111-4111-8111-111111111111',null) ready")).rows[0].ready,true)
 }finally{await db.close()}
})
