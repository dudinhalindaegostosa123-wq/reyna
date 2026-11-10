import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
const migration=readFileSync(new URL('../database/legacy/01-base.sql',import.meta.url),'utf8')
const alice='10000000-0000-4000-8000-000000000001',bob='10000000-0000-4000-8000-000000000002',unverified='10000000-0000-4000-8000-000000000003'
const contact={old_id:1,email:'alice@example.com',name:'Alice',phone:'11999999999',profile:{perfil_antigo:'customer'}}
const order={old_id:10,parent_id:null,kind:'shop_order',status:'wc-completed',created_at:'2025-01-01T00:00:00Z',total:'240.00',currency:'BRL',payload:{email:'alice@example.com'},owner_email:'alice@example.com',needs_review:false,visible:true}
const bundle={source:'serenity-woocommerce-hpos-v1',customers:[contact],orders:[order,{...order,old_id:11,kind:'shop_order_refund',parent_id:10,total:'-20',visible:false},{...order,old_id:12,owner_email:null,needs_review:true}],items:[{old_id:1,order_id:10,kind:'line_item',name:'Joia',payload:{quantidade:'2',total:'240'}},{old_id:2,order_id:11,kind:'line_item',name:'Joia',payload:{quantidade:'-1',total:'-20'}}]}
test('historical import is repeatable, isolated, owner verified and protected from changed email or ambiguous links',async()=>{
 const db=new PGlite()
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table serenity_customer_accounts(user_id uuid primary key,customer_id uuid);
 create table serenity_orders(id uuid primary key);
 create function forbidden_side_effect() returns trigger language plpgsql as $$begin raise exception 'LIVE_ORDERS_MUST_NOT_BE_TOUCHED';end$$;
 create trigger forbidden_legacy_order before insert or update on serenity_orders for each row execute function forbidden_side_effect();`)
 await db.exec(migration);await db.exec(migration)
 let result=await db.query('select serenity_legacy_import_v1($1) as result',[JSON.stringify(bundle)])
 assert.equal(result.rows[0].result.orders,2);assert.equal(result.rows[0].result.refunds,1)
 result=await db.query('select serenity_legacy_import_v1($1) as result',[JSON.stringify(bundle)])
 assert.equal(result.rows[0].result.already_imported,true)
 await assert.rejects(db.query('select serenity_legacy_import_v1($1)',[JSON.stringify({...bundle,customers:[{...contact,name:'Changed'}]})]),/LEGACY_IMPORT_DIFFERENT_DATA/)
 await db.exec(readFileSync(new URL('../database/legacy/02-opcoes-compradas.sql',import.meta.url),'utf8'))
 const options=[{item_id:'1',order_id:'10',options:{Comprimento:'6 mm',Espessura:'1,2 mm'}}]
 assert.equal((await db.query('select serenity_legacy_import_options_v1($1) n',[JSON.stringify(options)])).rows[0].n,1)
 assert.equal((await db.query('select serenity_legacy_import_options_v1($1) n',[JSON.stringify(options)])).rows[0].n,0)
 await assert.rejects(db.query('select serenity_legacy_import_options_v1($1)',[JSON.stringify([{item_id:'1',order_id:'10',options:{Comprimento:'8 mm'}}])]),/CONFLICT/)
 await assert.rejects(db.query('select serenity_legacy_import_options_v1($1)',[JSON.stringify([{item_id:'1',order_id:'10',options:{Cor:'Azul'}},{item_id:'999',order_id:'10',options:{Comprimento:'8 mm'}}])]),/ITEM_NOT_FOUND/)
 const preserved=(await db.query('select payload from serenity_legacy_items_v1 where old_id=1')).rows[0].payload
 assert.equal(preserved.quantidade,'2');assert.equal(preserved.total,'240');assert.equal(preserved.opcoes_compra.Comprimento,'6 mm');assert.equal(preserved.opcoes_compra.Cor,undefined)
 await db.query(`insert into auth.users values($1,'alice@example.com',now()),($2,'bob@example.com',now()),($3,'alice@example.com',null)`,[alice,bob,unverified])
 await db.exec('set role authenticated')
 await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[unverified])
 await assert.rejects(db.query('select serenity_legacy_link_my_history_v1()'),/LEGACY_EMAIL_REQUIRED/)
 await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[bob])
 assert.equal((await db.query('select serenity_legacy_link_my_history_v1() as linked')).rows[0].linked,0)
 assert.equal((await db.query('select * from serenity_legacy_orders_v1')).rows.length,0)
 await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[alice])
 assert.equal((await db.query('select serenity_legacy_account_context_v1() as profile')).rows[0].profile.needs_profile,true)
 assert.equal((await db.query('select serenity_legacy_link_my_history_v1() as linked')).rows[0].linked,2)
 assert.equal((await db.query('select * from serenity_legacy_orders_v1')).rows.length,1) // só pedido, não estorno/quarentena
 assert.equal((await db.query('select * from serenity_legacy_items_v1')).rows.length,1)
 await assert.rejects(db.query('select * from serenity_legacy_customers_v1'))
 await assert.rejects(db.query('select serenity_legacy_import_v1($1)',[JSON.stringify(bundle)]))
 // Um e-mail posteriormente reaproveitado não transfere o vínculo permanente.
 await db.exec('reset role')
 await db.query(`update auth.users set email='changed@example.com' where id=$1`,[alice])
 await db.query(`update auth.users set email='alice@example.com' where id=$1`,[bob])
 await db.exec('set role authenticated')
 await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[bob])
 assert.equal((await db.query('select serenity_legacy_link_my_history_v1() as linked')).rows[0].linked,0)
 assert.equal((await db.query('select serenity_legacy_account_context_v1() as profile')).rows[0].profile.eligible,false)
 assert.equal((await db.query('select * from serenity_legacy_orders_v1')).rows.length,0)
 await assert.rejects(db.query('select serenity_legacy_import_options_v1($1)',[JSON.stringify(options)]))
 await db.exec('set role anon')
 await assert.rejects(db.query('select * from serenity_legacy_orders_v1'))
 await assert.rejects(db.query('select serenity_legacy_link_my_history_v1()'))
 }finally{await db.close()}
})
