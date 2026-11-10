import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
test('frequent logistics scheduler requires Vault secret, installs idempotently and sends authenticated fixed-domain requests',async()=>{
 const db=new PGlite()
 try{
 await db.exec(`create schema vault;create schema cron;create schema net;
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 create table cron.fixture_jobs(id bigserial primary key,name text unique,schedule text,command text);
 create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.fixture_jobs(name,schedule,command) values($1,$2,$3) on conflict(name) do update set schedule=excluded.schedule,command=excluded.command returning id$$;
 create table net.fixture_requests(id bigserial primary key,url text,headers jsonb,timeout_ms int);
 create function net.http_get(url text,headers jsonb,timeout_milliseconds int) returns bigint language sql as $$insert into net.fixture_requests(url,headers,timeout_ms) values($1,$2,$3) returning id$$;`)
 const sql=readFileSync(new URL('../database/email/05-agendamento-logistica.sql',import.meta.url),'utf8').replace(/^create extension.*$/gm,'')
 await assert.rejects(db.exec(sql),/Cadastre no Vault/);await db.exec('rollback')
 assert.equal((await db.query('select * from cron.fixture_jobs')).rows.length,0)
 await db.query(`insert into vault.decrypted_secrets values('serenity_cron_secret',$1)`,['fixture-only-secret-with-at-least-32-characters'])
 await db.exec(sql);await db.exec(sql)
 const jobs=(await db.query('select * from cron.fixture_jobs')).rows
 assert.equal(jobs.length,2)
 assert.ok(jobs.every(job=>!job.command.includes('fixture-only-secret')))
 assert.ok(jobs.some(job=>job.schedule==='*/5 * * * *'));assert.ok(jobs.some(job=>job.schedule==='2-59/5 * * * *'))
 for(const job of jobs)await db.exec(job.command)
 const requests=(await db.query('select * from net.fixture_requests')).rows
 assert.equal(requests.length,2);assert.ok(requests.every(request=>request.url.startsWith('https://serenitypiercings.com.br/api/cron/')&&request.timeout_ms===55000&&request.headers.Authorization.startsWith('Bearer fixture-')))
 }finally{await db.close()}
})
