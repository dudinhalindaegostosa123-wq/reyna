const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const {checkoutEmailsCsv}=load('src/lib/checkout-csv.ts')
const contact=load('src/lib/checkout-contact.ts'),related=load('src/lib/checkout-related-orders.ts')
const report=load('src/lib/checkout-report.ts',{'@/lib/checkout-contact':contact,'@/lib/checkout-related-orders':related})
const row={name:'João "Teste"; Silva',email:' Cliente@example.com ',phone:'5511999999999',status:'Preenchendo dados',lastActivity:'2026-11-09T22:57:00Z'}
test('CSV keeps accents, escapes columns, deduplicates email and blocks spreadsheet formulas',()=>{
 const csv=checkoutEmailsCsv([row,{...row,name:'Duplicado',email:'CLIENTE@example.com'},{...row,name:'=HYPERLINK("evil")',email:'outro@example.com'},{...row,email:'invalid'},{...row,name:'Linha\nnova',email:'linha@example.com'}])
 assert.ok(csv.startsWith('\uFEFF"Nome";"E-mail"'))
 assert.match(csv,/"João ""Teste""; Silva";"cliente@example.com"/)
 assert.doesNotMatch(csv,/Duplicado|"invalid"/)
 assert.match(csv,/"'=HYPERLINK/)
 assert.match(csv,/"Linha\nnova"/)
 assert.equal((csv.match(/cliente@example.com/g)||[]).length,1)
})
function database(data){
 const reads=[]
 return {reads,from(table){let rows=[...(data[table] || [])];const q={
  select(){return q},eq(key,value){rows=rows.filter(r=>r[key]===value);return q},in(key,ids){rows=rows.filter(r=>ids.includes(key==='customer_snapshot->>email'?r.customer_snapshot?.email:r[key]));return q},
  order(key,options={}){rows.sort((a,b)=>String(a[key]).localeCompare(String(b[key]))*(options.ascending===false?-1:1));return q},gt(key,value){rows=rows.filter(r=>r[key]>value);return q},
  gte(key,value){rows=rows.filter(r=>r[key]>=value);return q},lte(key,value){rows=rows.filter(r=>r[key]<=value);return q},
  limit(n){rows=rows.slice(0,n);return q},range(from,to){reads.push([table,from,to]);return Promise.resolve({data:rows.slice(from,to+1),error:null})},
  maybeSingle(){return Promise.resolve({data:rows[0] || null,error:null})},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve)},
 };return q}}
}
test('mass export reads beyond the visual limit and preserves environment/direct-record filters',async()=>{
 const rows=Array.from({length:1201},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),name:'Cliente '+i,email:'p'+i+'@example.com',environment:'production',items:[],estimated_cents:10000,created_at:'2026-11-09T20:00:00Z',updated_at:'2026-11-09T20:00:00Z'}))
 const db=database({serenity_checkout_contacts_v1:rows,serenity_guest_access_v1:[{checkout_id:rows[501].id,number:'88'}]})
 const all=await report.readCheckoutReport(db,{},true)
 assert.equal(all.rows.length,1201);assert.equal(all.contactError,false)
 assert.equal(new Set(all.rows.map(r=>r.id)).size,1201)
 assert.equal(db.reads.filter(r=>r[0]==='serenity_checkout_contacts_v1').length,3)
 const visible=await report.readCheckoutReport(db,{})
 assert.equal(visible.rows.length,100)
 const direct=await report.readCheckoutReport(db,{tentativa:rows[501].id},true);assert.equal(direct.rows.length,1);assert.equal(direct.rows[0].id,rows[501].id)
 const byNumber=await report.readCheckoutReport(db,{numero:'88'},true);assert.equal(byNumber.rows.length,1);assert.equal(byNumber.rows[0].id,rows[501].id)
 const testEnv=await report.readCheckoutReport(db,{ambiente:'test'},true);assert.equal(testEnv.rows.length,0)
})
test('CSV endpoint authenticates, passes all filters and refuses incomplete exports',async()=>{
 let allowed=false,fail=false,reads=0,last
 class ResponseMock{constructor(body,options={}){this.body=body;this.status=options.status || 200;this.headers=options.headers}}
 const {GET}=load('src/app/admin/checkouts/exportar/route.ts',{
  'next/server':{NextResponse:ResponseMock},'@/lib/admin-auth':{adminDatabase:async()=>{if(!allowed)throw Error('LOGIN_REQUIRED');return {db:{}}}},
  '@/lib/checkout-report':{readCheckoutReport:async(db,filters,all)=>{reads++;last={filters,all};return {rows:[row],environment:'production',contactError:fail,contextError:false,numberError:false,relatedError:false}}},
  '@/lib/checkout-csv':{checkoutEmailsCsv},
 })
 const req=new Request('https://serenity.example/admin/checkouts/exportar?ambiente=production&numero=88&concluidos=1')
 await assert.rejects(GET(req),/LOGIN_REQUIRED/);assert.equal(reads,0)
 allowed=true;const response=await GET(req)
 assert.equal(response.status,200);assert.equal(response.headers['Content-Type'],'text/csv; charset=utf-8')
 assert.match(response.headers['Content-Disposition'],/attachment/);assert.match(response.headers['Cache-Control'],/no-store/)
 assert.equal(last.all,true);assert.equal(last.filters.numero,'88');assert.equal(last.filters.concluidos,'1')
 fail=true;const failed=await GET(req);assert.equal(failed.status,503);assert.doesNotMatch(failed.body,/cliente@example.com/)
})
