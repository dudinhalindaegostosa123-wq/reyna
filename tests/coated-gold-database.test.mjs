import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
test('catalog rename updates coated content and variations, backs it up and preserves stock, prices, solid gold and URLs',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table products(id uuid primary key,name text,material text,description text,short_description text,seo_title text,seo_description text,tags text[],attributes jsonb,slug text,sku text,regular_price numeric,stock_status text,stock_quantity integer);
   create table product_variants(id uuid primary key,product_id uuid,name text,attributes jsonb,regular_price numeric,stock_status text,stock_quantity integer);
   insert into products values('11111111-1111-4111-8111-111111111111','TR736 — Titânio Revestido de Ouro 18K','Titânio Revestido de Ouro 18K','<p>Revestimento: ouro 18K. Compare com ouro 18K maciço.</p>','Ouro 18K','Titânio revestido de ouro 18K',null,array['Titânio revestido de ouro 18K'],'{"Material":"Titânio revestido de ouro 18K"}','slug-ouro-18k','TR736',100,'outofstock',0),
    ('22222222-2222-4222-8222-222222222222','Argola Ouro 18K Maciço','Ouro 18K','Ouro 18K maciço',null,null,null,'{}','{}','gold-18k','OR114',1000,'instock',2);
   insert into product_variants values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','Ouro 18K 6mm','{"Acabamento":"Titânio revestido de ouro 18K"}',110,'outofstock',0);`)
  const sql=readFileSync(new URL('../database/releases/2026-11-09-estoque-titanio-24k.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql)
  const rows=(await db.query('select * from products order by id')).rows,coated=rows[0],solid=rows[1]
  assert.match(coated.name,/24K/);assert.match(coated.material,/24K/);assert.match(coated.description,/ouro 24K/);assert.match(coated.description,/ouro 18K maciço/)
  assert.equal(coated.slug,'slug-ouro-18k');assert.equal(coated.sku,'TR736');assert.equal(Number(coated.regular_price),100)
  assert.equal(coated.stock_status,'outofstock');assert.equal(coated.stock_quantity,0)
  assert.match(coated.attributes.Material,/24K/);assert.match(coated.tags[0],/24K/)
  assert.equal(solid.material,'Ouro 18K');assert.equal(solid.name,'Argola Ouro 18K Maciço')
  const variant=(await db.query('select * from product_variants')).rows[0];assert.match(variant.name,/24K/);assert.equal(variant.stock_status,'outofstock');assert.equal(Number(variant.regular_price),110)
  assert.equal((await db.query('select count(*) n from serenity_coating_rename_backup_v1')).rows[0].n,2)
  await db.exec('set role anon');await assert.rejects(db.query('select * from serenity_coating_rename_backup_v1'),/permission denied/)
 }finally{await db.close()}
})
