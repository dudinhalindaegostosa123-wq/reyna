import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const sql = fs.readFileSync(new URL('../database/asaas/02-inventario-lunarity.sql', import.meta.url), 'utf8')

test('Lunarity inventory reports missing installation without reading or modifying business data', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create table products(id uuid primary key, name text not null, regular_price numeric(12,2));
      create table product_variants(id uuid primary key,product_id uuid references products(id));
      create view store_catalog as select id,name from products;
      create table private_existing_table(secret text);
      insert into products values('11111111-1111-4111-8111-111111111111','PRIVATE_PRODUCT_VALUE',123.45);
      insert into private_existing_table values('PRIVATE_SECRET_VALUE');
      create function serenity_target_effective_price(uuid,uuid,numeric,numeric,timestamptz,timestamptz)
        returns numeric language sql as $$select $3$$;
    `)
    await db.exec('begin read only')
    const { rows } = await db.query(sql)
    await db.exec('commit')
    assert.equal(rows.length, 3)
    const tables = rows[0].estrutura
    assert.ok(tables.some(row => row.nome === 'products' && row.tipo === 'tabela'))
    assert.ok(tables.some(row => row.nome === 'store_catalog' && row.tipo === 'view'))
    assert.equal(tables.some(row => row.nome === 'serenity_orders'), false)
    assert.ok(rows[1].estrutura.some(row => row.tabela === 'products' && row.coluna === 'id' && row.tipo === 'uuid'))
    assert.ok(rows[1].estrutura.some(row => row.coluna === 'regular_price' && row.tipo === 'numeric(12,2)'))
    assert.ok(rows[2].estrutura.some(row => row.funcao === 'serenity_target_effective_price'))
    assert.doesNotMatch(JSON.stringify(rows), /PRIVATE_PRODUCT_VALUE|PRIVATE_SECRET_VALUE|123\.45|select \$3/)
    assert.equal((await db.query('select name from products')).rows[0].name, 'PRIVATE_PRODUCT_VALUE')
    assert.equal((await db.query('select secret from private_existing_table')).rows[0].secret, 'PRIVATE_SECRET_VALUE')
  } finally { await db.close() }
})

test('Lunarity inventory works in an empty public schema', async () => {
  const db = new PGlite()
  try {
    const { rows } = await db.query(sql)
    assert.equal(rows.length, 3)
    for (const row of rows) assert.deepEqual(row.estrutura, [])
  } finally { await db.close() }
})
