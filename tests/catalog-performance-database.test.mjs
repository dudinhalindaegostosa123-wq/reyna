import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('catalog indexes are repeatable and preserve photos, prices and stock', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE TABLE products(id integer PRIMARY KEY, price numeric, stock integer);
      CREATE TABLE product_variants(id integer PRIMARY KEY, product_id integer, enabled boolean);
      CREATE TABLE product_media(id integer PRIMARY KEY, product_id integer, variant_id integer, position integer, media_type text, storage_path text);
      CREATE TABLE serenity_promotion_items(id integer PRIMARY KEY, product_id integer, variant_id integer);
      INSERT INTO products VALUES (1, 100, 3), (2, 200, 0);
      INSERT INTO product_variants VALUES (1, 1, true), (2, 1, false);
      INSERT INTO product_media VALUES (1, 1, 1, 0, 'image', 'variant.webp'), (2, 1, null, 1, 'image', 'cover.webp'), (3, 1, null, 0, 'youtube', 'video');
      INSERT INTO serenity_promotion_items VALUES (1, 1, null);
    `)
    const query = `SELECT p.*, cover.storage_path FROM products p LEFT JOIN LATERAL (
      SELECT storage_path FROM product_media m WHERE m.product_id = p.id AND media_type = 'image'
      ORDER BY (variant_id IS NOT NULL), position, id LIMIT 1
    ) cover ON true ORDER BY p.id`
    const before = (await db.query(query)).rows
    const sql = readFileSync(new URL('../database/catalog/02-performance-vitrine.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    assert.deepEqual((await db.query(query)).rows, before)
    assert.equal(before[0].storage_path, 'cover.webp')
    assert.equal(before[1].stock, 0)
    const indexes = (await db.query(`SELECT indexname FROM pg_indexes WHERE indexname LIKE 'lunarity_%'`)).rows
    assert.equal(indexes.length, 3)
    await db.exec('SET enable_seqscan = off')
    const plan = await db.query(`EXPLAIN SELECT * FROM product_media WHERE product_id = 1 AND media_type = 'image' ORDER BY (variant_id IS NOT NULL), position, id LIMIT 1`)
    assert.match(JSON.stringify(plan.rows), /lunarity_media_product_cover_idx/)
  } finally {
    await db.close()
  }
})
