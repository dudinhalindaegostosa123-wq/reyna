import {test} from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
test('order jewelry search matches saved partial names and SKUs across every item and stays admin-only',async()=>{
 const db=new PGlite()
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table serenity_orders(id int primary key,customer_snapshot jsonb,items jsonb);
 create view serenity_admin_order_workflow as select id,customer_snapshot from serenity_orders;
 insert into serenity_orders values(1,'{"name":"Ana"}','[{"name":"Topo Sol","sku":"TN100"},{"name":"Argola Clicker Esmeralda","sku":"TN623"}]'),(2,'{"name":"Bia"}','[{"name":"Labret","sku":"TN200"}]');`)
 const sql=readFileSync(new URL('../database/admin/01-busca-joias-pedidos.sql',import.meta.url),'utf8')
 await db.exec(sql);await db.exec(sql)
 for(const query of ['%clicker%','%TN623%','%Topo Sol%'])assert.deepEqual((await db.query(`select id from serenity_admin_order_search_v1 where jewelry_search ilike $1`,[query])).rows.map(row=>row.id),[1])
 assert.equal((await db.query(`select * from serenity_admin_order_search_v1 where jewelry_search ilike '%inexistente%'`)).rows.length,0)
 await db.exec('set role anon');await assert.rejects(db.query('select * from serenity_admin_order_search_v1'))
 await db.exec('reset role;set role authenticated');await assert.rejects(db.query('select * from serenity_admin_order_search_v1'))
 }finally{await db.close()}
})
