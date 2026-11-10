import {test} from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
test('five-minute analytics delivery requires the existing Vault secret and updates one named job on repeat',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);create schema cron;create table cron.jobs(name text primary key,schedule text,command text);create function cron.schedule(text,text,text) returns bigint language plpgsql as $$begin insert into cron.jobs values($1,$2,$3) on conflict(name) do update set schedule=excluded.schedule,command=excluded.command;return 1;end$$;`)
  const sql=readFileSync(new URL('../database/analytics/02-agendamento.sql',import.meta.url),'utf8').replace(/^create extension[^;]*;/gm,'')
  await assert.rejects(db.exec(sql),/serenity_cron_secret/);await db.exec('rollback')
  await db.exec("insert into vault.decrypted_secrets values('serenity_cron_secret',repeat('x',64))")
  await db.exec(sql);await db.exec(sql)
  const jobs=(await db.query('select * from cron.jobs')).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].schedule,'3-59/5 * * * *')
  assert.match(jobs[0].command,/https:\/\/serenitypiercings\.com\.br\/api\/cron\/analytics/)
  assert.match(jobs[0].command,/vault.decrypted_secrets/);assert.doesNotMatch(jobs[0].command,/x{64}/)
 }finally{await db.close()}
})
