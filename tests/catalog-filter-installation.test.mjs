import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

test('filter installation rebuilds an empty cache, maintains it on edits and exposes only public metadata',async()=>{
 const db=new PGlite()
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;')
  await db.exec(readFileSync(new URL('./fixtures/admin-catalog/schema.sql',import.meta.url),'utf8'))
  await db.exec(`CREATE FUNCTION public.serenity_slug(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT btrim(regexp_replace(public.serenity_normalize(value),'[^a-z0-9]+','-','g'),'-') $$;
   CREATE TABLE serenity_jewelry_filter_cache_v1(product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,jewelry_filters text[] NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now());
   ALTER TABLE serenity_jewelry_filter_cache_v1 ENABLE ROW LEVEL SECURITY;
   GRANT ALL ON serenity_jewelry_filter_cache_v1 TO service_role;
   INSERT INTO products(woo_id,name,slug,status,visibility,material,categories,product_type,regular_price) VALUES
   (1,'Argola Lunar','argola','published','visible','Ouro 18K',ARRAY['Conch','Septo'],'simple',100),
   (2,'Topo Flor','topo','published','visible','Titânio',ARRAY['Conch'],'variable',90),
   (3,'Topo Push Pin','push-pin','draft','visible','Titânio',ARRAY['Conch'],'simple',90),
   (4,'Argola oculta','oculta','published','hidden','Ouro 18K',ARRAY['Conch'],'simple',100);
   INSERT INTO product_variants(product_id,name,attributes,enabled) SELECT id,'Haste 1.2 mm','{"Espessura":"1.2 mm"}',true FROM products WHERE woo_id=2;`)
  const sql=readFileSync(new URL('../database/catalog/03-restaurar-filtros.sql',import.meta.url),'utf8')
  const before=(await db.query('SELECT id,name,regular_price FROM products ORDER BY woo_id')).rows
  await db.exec(sql)
  await db.exec(sql)
  assert.deepEqual((await db.query('SELECT id,name,regular_price FROM products ORDER BY woo_id')).rows,before)
  await db.exec('SET ROLE anon')
  const rows=(await db.query('SELECT * FROM lunarity_catalog_facets_v1 ORDER BY id')).rows
  assert.equal(rows.length,2)
  assert.ok(rows[0].category_slugs.includes('conch'))
  assert.ok(rows[0].jewelry_filters.includes('argolas'))
  assert.ok(rows[1].jewelry_filters.includes('topo-labret-12'))
  assert.ok(!Object.keys(rows[0]).includes('regular_price'))
  await assert.rejects(db.query('SELECT * FROM serenity_jewelry_filter_cache_v1'),/permission denied/)
  await db.exec('RESET ROLE; SET ROLE service_role')
  await db.exec(`UPDATE product_variants SET attributes='{"Sistema":"Push pin"}' WHERE product_id=(SELECT id FROM products WHERE woo_id=2)`)
  let filters=(await db.query("SELECT jewelry_filters FROM serenity_jewelry_filter_cache_v1 WHERE product_id=(SELECT id FROM products WHERE woo_id=2)")).rows[0].jewelry_filters
  assert.ok(filters.includes('push-pin'));assert.ok(!filters.includes('topo-labret-12'))
  await db.exec(`UPDATE product_variants SET enabled=false WHERE product_id=(SELECT id FROM products WHERE woo_id=2)`)
  filters=(await db.query("SELECT jewelry_filters FROM serenity_jewelry_filter_cache_v1 WHERE product_id=(SELECT id FROM products WHERE woo_id=2)")).rows[0].jewelry_filters
  assert.ok(!filters.includes('push-pin'))
  await db.exec(`UPDATE products SET name='Topo Pedra Natural Push Pin' WHERE woo_id=2`)
  filters=(await db.query("SELECT jewelry_filters FROM serenity_jewelry_filter_cache_v1 WHERE product_id=(SELECT id FROM products WHERE woo_id=2)")).rows[0].jewelry_filters
  assert.ok(filters.includes('push-pin'));assert.ok(filters.includes('pedras-naturais'))
 }finally{await db.close()}
})
