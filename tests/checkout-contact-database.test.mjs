import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
test('private contact capture is idempotent, ownership protected and never consumes order numbers',async()=>{
 const db=new PGlite()
 try{
  await db.exec('create role anon;create role authenticated;create role service_role;create sequence order_numbers start 100;')
  const sql=readFileSync(new URL('../database/checkout-contacts/01-contatos.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql)
  const id='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64),items=JSON.stringify([{name:'Argola',slug:'argola',quantity:2}])
  const save=(token=hash,email='teste@example.com')=>db.query('select serenity_checkout_contact_save_v1($1,$2,$3,$4,$5,$6,$7)',[id,token,'Cliente',email,items,20000,'production'])
  await save();await save(hash,'outro@example.com')
  const rows=(await db.query('select * from serenity_checkout_contacts_v1')).rows
  assert.equal(rows.length,1);assert.equal(rows[0].email,'outro@example.com')
  await assert.rejects(save('b'.repeat(64)),/CONTACT_ACCESS/)
  assert.equal((await db.query('select email from serenity_checkout_contacts_v1')).rows[0].email,'outro@example.com')
  assert.equal((await db.query("select nextval('order_numbers') n")).rows[0].n,100)
  await db.exec('set role anon');await assert.rejects(save(),/permission denied/);await assert.rejects(db.query('select * from serenity_checkout_contacts_v1'),/permission denied/)
  await db.exec('reset role;set role authenticated');await assert.rejects(save(),/permission denied/)
 }finally{await db.close()}
})
test('WhatsApp migration preserves old clients, protects writes and installs from the complete release',async()=>{
 const db=new PGlite()
 try{
  await db.exec('create role anon;create role authenticated;create role service_role;')
  const sql=readFileSync(new URL('../database/releases/2026-11-09-checkouts-contatos.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql)
  const id='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64),items=JSON.stringify([{name:'Argola',slug:'argola',quantity:1}])
  const save=(phone,token=hash)=>db.query('select serenity_checkout_contact_save_v1($1,$2,$3,$4,$5,$6,$7,$8)',[id,token,'Cliente','teste@example.com',items,10000,'production',phone])
  await save('5511999999999')
  assert.equal((await db.query('select phone from serenity_checkout_contacts_v1')).rows[0].phone,'5511999999999')
  await assert.rejects(save('1199'),/CONTACT_PHONE/)
  await assert.rejects(save('5511988888888','b'.repeat(64)),/CONTACT_ACCESS/)
  await db.query('select serenity_checkout_contact_save_v1($1,$2,$3,$4,$5,$6,$7)',[id,hash,'Cliente antigo','teste@example.com',items,10000,'production'])
  assert.equal((await db.query('select phone from serenity_checkout_contacts_v1')).rows[0].phone,'5511999999999')
  await save(null);assert.equal((await db.query('select phone from serenity_checkout_contacts_v1')).rows[0].phone,null)
  await db.exec('set role anon');await assert.rejects(save('5511999999999'),/permission denied/)
 }finally{await db.close()}
})
