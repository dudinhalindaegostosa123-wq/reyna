const {test}=require('node:test');const assert=require('node:assert/strict');const {load}=require('./helpers/load.cjs')
const parser=load('src/lib/legacy-import.ts')
const user={id_antigo:'1',email:'owner@example.com',nome_exibido:'Owner',primeiro_nome:'',sobrenome:'',telefone:'NULL',perfil_antigo:'a:1:{s:8:"customer";b:1;}'}
const order={pedido_antigo:'10',pedido_pai:'0',tipo:'shop_order',situacao:'wc-completed',moeda:'BRL',criado_em_utc:'2025-01-01 00:00:00',usuario_antigo:'1',email:'owner@example.com',total:'100.00'}
const item={pedido_antigo:'10',item_antigo:'20',tipo_item:'line_item',nome:'Joia, pedra "azul"\nSegunda linha',quantidade:'1',total:'100.00',imposto:'0',custo_frete:'NULL'}
function csv(rows,delimiter=','){const quote=v=>'"'+String(v).replace(/"/g,'""')+'"';return '\uFEFF'+[Object.keys(rows[0]),...rows.map(Object.values)].map(cells=>cells.map(quote).join(delimiter)).join('\r\n')+'\r\n'}
test('CSV upload parser preserves quoted fields, accents, newlines, delimiters, UTF-8 BOM and original totals',()=>{
 const result=parser.buildLegacyBundle(csv([user]),csv([order],';'),csv([item]))
 assert.equal(result.customers[0].phone,'');assert.equal(result.orders[0].total,'100.00');assert.equal(result.items[0].name,item.nome)
 assert.equal(result.orders[0].owner_email,user.email);assert.equal(result.orders[0].created_at,'2025-01-01T00:00:00+00:00')
})
test('CSV upload rejects password exports, duplicate rows, missing columns, malformed quotes and amount mismatches',()=>{
 assert.throws(()=>parser.parseLegacyCsv('user_pass,email\nsecret,owner@example.com'),/senha/)
 assert.throws(()=>parser.parseLegacyCsv('a,b\n"bad,unfinished'),/incompleto/)
 assert.throws(()=>parser.buildLegacyBundle(csv([user,user]),csv([order]),csv([item])),/duplicado/)
 assert.throws(()=>parser.buildLegacyBundle(csv([user]),csv([order]),csv([{...item,total:'95'}])),/divergentes/)
 assert.throws(()=>parser.buildLegacyBundle(csv([order]),csv([user]),csv([item])),/campo errado/)
 const result=parser.buildLegacyBundle(csv([user]),csv([{...order,email:'other@example.com'}]),csv([item]))
 assert.equal(result.orders[0].owner_email,null);assert.equal(result.orders[0].needs_review,true)
})
test('CSV admin import requires administrator and production, then uses one transactional RPC',async()=>{
 const calls=[];const summary={customers:764,orders:586,refunds:25,items:2032,needs_review:1,already_imported:false}
 const mocks={'@/lib/admin-auth':{adminDatabase:async()=>({db:{rpc:async(name,args)=>{calls.push([name,args]);return {data:summary,error:null}}}})},'@/lib/legacy-import':parser,'next/cache':{revalidatePath(){}}}
 let api=load('src/app/admin/historico/actions.ts',mocks,{VERCEL_ENV:'preview'},{File})
 const form=new FormData();form.set('customers',new File([csv([user])],'users.csv'));form.set('orders',new File([csv([order])],'orders.csv'));form.set('items',new File([csv([item])],'items.csv'))
 assert.ok((await api.importLegacyCsv({},form)).error);assert.equal(calls.length,0)
 api=load('src/app/admin/historico/actions.ts',mocks,{VERCEL_ENV:'production'},{File})
 const result=await api.importLegacyCsv({},form);assert.equal(result.summary.orders,586);assert.equal(calls.length,1);assert.equal(calls[0][0],'serenity_legacy_import_v1')
 const denied=load('src/app/admin/historico/actions.ts',{...mocks,'@/lib/admin-auth':{adminDatabase:async()=>{throw Error('ADMIN_REQUIRED')}}},{VERCEL_ENV:'production'},{File})
 await assert.rejects(denied.importLegacyCsv({},form),/ADMIN_REQUIRED/);assert.equal(calls.length,1)
})
