import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

test('editor installation preserves records and enables private search and versioned saves',async()=>{
 const db=new PGlite()
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;')
  await db.exec(readFileSync(new URL('./fixtures/admin-catalog/schema.sql',import.meta.url),'utf8'))
  const sql=readFileSync(new URL('../database/admin/07-editor-produtos.sql',import.meta.url),'utf8')
  await db.exec(sql)
  await db.exec(sql)
  const id='11111111-1111-4111-8111-111111111111',variant='22222222-2222-4222-8222-222222222222',photo='33333333-3333-4333-8333-333333333333',admin='44444444-4444-4444-8444-444444444444'
  await db.query(`INSERT INTO products(id,name,slug,sku,woo_id,status,product_type,regular_price,stock_status,stock_quantity) VALUES ($1,'Argola Flor Titânio','argola-flor','TN123',123,'published','variable',100,'instock',3)`,[id])
  await db.query(`INSERT INTO product_variants(id,product_id,name,attributes,regular_price,stock_status,stock_quantity) VALUES ($1,$2,'Azul','{"Cor":"Azul"}',80,'instock',2)`,[variant,id])
  await db.query(`INSERT INTO product_media(id,product_id,media_type,storage_path) VALUES ($1,$2,'image','original.webp')`,[photo,id])
  await db.exec('SET ROLE service_role')
  for(const query of ['titanio argola','TITÂNIO flor','TN123','123']){
   assert.deepEqual((await db.query('SELECT id FROM lunarity_admin_search_products($1)',[query])).rows,[{id}])
  }
  assert.equal((await db.query('SELECT id FROM lunarity_admin_search_products($1)',["% OR 1=1"])).rows.length,0)
  const read=async()=> (await db.query('SELECT serenity_admin_read_editor($1) AS bundle',[id])).rows[0].bundle
  const before=await read()
  assert.equal(before.media[0].storage_path,'original.webp')
  const payload={product:{...before.product,name:'Argola Flor Lunar',regular_price:110},commercial:{supplier_name:'Fornecedor interno',unit_cost:20},variants:before.variants,photos:[{id:photo,variant_id:null,alt_text:'Argola'}],video_changed:false}
  await db.query('SELECT serenity_admin_save_editor($1,$2,$3,false,$4::jsonb)',[id,admin,before.version,JSON.stringify(payload)])
  const saved=await read()
  assert.equal(saved.product.name,'Argola Flor Lunar')
  assert.equal(saved.product.slug,'argola-flor')
  assert.equal(Number(saved.product.regular_price),110)
  assert.equal(saved.variants[0].stock_quantity,2)
  assert.equal(saved.media[0].storage_path,'original.webp')
  assert.notEqual(saved.version,before.version)
  await assert.rejects(db.query('SELECT serenity_admin_save_editor($1,$2,$3,false,$4::jsonb)',[id,admin,before.version,JSON.stringify(payload)]),/STALE_PRODUCT/)
  const bad={...payload,product:{...payload.product,name:'Must roll back'},photos:[{id:'55555555-5555-4555-8555-555555555555',variant_id:null,alt_text:''}]}
  await assert.rejects(db.query('SELECT serenity_admin_save_editor($1,$2,$3,false,$4::jsonb)',[id,admin,saved.version,JSON.stringify(bad)]),/INVALID_PHOTO_UPLOAD/)
  assert.equal((await read()).product.name,'Argola Flor Lunar')
  const newId='66666666-6666-4666-8666-666666666666'
  const newPayload={...payload,product:{...payload.product,name:'Nova joia',slug:'nova-joia',status:'draft',product_type:'simple'},variants:[],photos:[]}
  await db.query('SELECT serenity_admin_save_editor($1,$2,$3,true,$4::jsonb)',[newId,admin,'',JSON.stringify(newPayload)])
  assert.equal((await db.query('SELECT status FROM products WHERE id=$1',[newId])).rows[0].status,'draft')
  await db.exec('RESET ROLE')
  await db.exec(sql)
  await db.exec('SET ROLE service_role')
  assert.equal((await read()).product.name,'Argola Flor Lunar')
  assert.equal((await read()).media[0].storage_path,'original.webp')
  for(const role of ['anon','authenticated']){
   await db.exec(`RESET ROLE; SET ROLE ${role}`)
   await assert.rejects(db.query('SELECT serenity_admin_read_editor($1)',[id]),/permission denied/)
   await assert.rejects(db.query('SELECT * FROM lunarity_admin_search_products($1)',['argola']),/permission denied/)
   await assert.rejects(db.query('SELECT * FROM serenity_product_commercial'),/permission denied/)
  }
 }finally{await db.close()}
})
