import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('projects migration is repeatable and public access exposes only published projects', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
    const sql = readFileSync(new URL('../database/projects/01-projetos.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    await db.exec("insert into serenity_ready_projects (title, enabled) values ('Publicado', true), ('Rascunho', false)")
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      const result = await db.query('select title from serenity_ready_projects')
      assert.deepEqual(result.rows.map(row => row.title), ['Publicado'])
      await assert.rejects(db.query("insert into serenity_ready_projects (title) values ('Invasor')"), /permission denied/)
      await assert.rejects(db.query("update serenity_ready_projects set enabled = true"), /permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    assert.equal((await db.query('select count(*)::int as n from serenity_ready_projects')).rows[0].n, 2)
    await db.query("update serenity_ready_projects set enabled = true where title = 'Rascunho'")
  } finally { await db.close() }
})
