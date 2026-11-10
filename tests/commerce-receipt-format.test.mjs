import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {guestDatabase} from './helpers/guest-db.mjs'
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
test('migrations accept installed formatted receipt, preserve all access checks and are repeatable',async()=>{
 const db=await guestDatabase();try{
 await db.exec(read('./fixtures/commerce/installed-guest-receipt-formatted.sql'))
 const definition=async()=>(await db.query("select pg_get_functiondef('public.serenity_guest_register_v1(uuid,text,text)'::regprocedure) d")).rows[0].d
 const before=await definition()
 const short=read('../database/commerce/05a-recibo-formatado.sql')
 await db.exec(short);await db.exec(short)
 assert.equal(await definition(),before.replace("coalesce((i->>'sterilization_fee')::numeric, 0)","coalesce((i->>'sterilization_fee')::numeric,0)+coalesce((i->>'stem_fee')::numeric,0)"))
 await db.exec(read('../database/commerce/05-servicos-esterilizacao-hastes.sql'))
 await db.exec(read('../database/commerce/06-haste-opcional.sql'))
 // Also verify full migration works directly, without standalone workaround.
 await db.exec(read('./fixtures/commerce/installed-guest-receipt-formatted.sql'))
 await db.exec(read('../database/commerce/05-servicos-esterilizacao-hastes.sql'))
 assert.match(await definition(),/coalesce\(\(i->>'stem_fee'\)::numeric,0\)/)
 }finally{await db.close()}
})
