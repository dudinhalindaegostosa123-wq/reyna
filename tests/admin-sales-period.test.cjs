const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const api=load('src/lib/admin-sales-summary.ts'),now=new Date('2026-11-10T01:00:00Z')
test('7/15-day and monthly windows use Brasilia calendar dates including month boundaries and leap years',()=>{
 const seven=api.salesPeriod({summary_period:'7'},now);assert.equal(seven.from,'2026-11-03');assert.equal(seven.to,'2026-11-09');assert.equal(seven.end,'2026-11-10T00:00:00-03:00')
 const fifteen=api.salesPeriod({summary_period:'15'},now);assert.equal(fifteen.from,'2026-10-26')
 const month=api.salesPeriod({summary_period:'month',summary_month:'2026-10'},now);assert.equal(month.from,'2026-10-01');assert.equal(month.to,'2026-10-31')
 assert.equal(api.salesPeriod({summary_month:'2024-02'},now).to,'2024-02-29')
 for(const summary_month of ['2026-99','2030-01','garbage'])assert.equal(api.salesPeriod({summary_month},now).month,'2026-11')
 assert.equal(api.salesPeriod({},now).to,'2026-11-09')
})
const order=(id,paid_at,total=110)=>({id,paid_at,total,subtotal:100,discount:0,shipping:10,expenses:5,cost:40,missing_costs:0})
test('summary and chart use the same paid dates and calculate margin without shipping',()=>{
 const period=api.salesPeriod({summary_period:'7'},now)
 const result=api.summarizeSales([order('a','2026-11-03T03:00:00Z'),order('b','2026-11-10T02:59:59Z')],3,period)
 assert.equal(result.paid,2);assert.equal(result.pending,3);assert.equal(result.revenue,220);assert.equal(result.shipping,20);assert.equal(result.margin,110)
 assert.equal(result.days.length,7);assert.equal(result.days[0].total,110);assert.equal(result.days[6].total,110)
 assert.equal(result.days.reduce((sum,day)=>sum+day.total,0),result.revenue)
 const missing=api.summarizeSales([{...order('c','2026-11-09T12:00:00Z'),cost:null,missing_costs:2}],0,period)
 assert.equal(missing.margin,null);assert.equal(missing.missing,2)
})
test('period lookup paginates all paid orders and excludes canceled/refunded and outside-period records',async()=>{
 const period=api.salesPeriod({summary_period:'7'},now),data=[...Array.from({length:501},(_,i)=>({...order(String(i).padStart(5,'0'),'2026-11-09T12:00:00Z'),status:'paid',created_at:'2026-11-09T12:00:00Z'})),{...order('old','2026-11-03T02:59:59Z'),status:'paid'},...['cancelled','refunded'].map(status=>({...order(status,'2026-11-09T12:00:00Z'),status})),{id:'pending',status:'pending',created_at:'2026-11-09T12:00:00Z'}]
 const calls=[]
 const db={from(table){let rows=data,head=false;const q={select(fields,options){head=options?.head;return q},eq(key,value){rows=rows.filter(r=>r[key]===value);return q},gte(key,value){rows=rows.filter(r=>Date.parse(r[key])>=Date.parse(value));return q},lt(key,value){rows=rows.filter(r=>Date.parse(r[key])<Date.parse(value));return q},order(){rows=[...rows].sort((a,b)=>a.id.localeCompare(b.id));return q},gt(key,value){rows=rows.filter(r=>r[key]>value);return q},range(from,to){calls.push([from,to]);return Promise.resolve({data:rows.slice(from,to+1),error:null})},then(resolve){return Promise.resolve({data:head?null:rows,count:rows.length,error:null}).then(resolve)}};return q}}
 const result=await api.readSalesSummary(db,period)
 assert.equal(result.paid,501);assert.equal(result.pending,1);assert.equal(result.revenue,55110);assert.equal(calls.length,2)
})
test('financial filters are visible, open after selection, and survive order pagination',async()=>{
 const {renderer,nodes}=require('./helpers/render.cjs'),sales=load('src/lib/admin-sales.ts')
 let received
 const chain={select(){return chain},eq(){return chain},or(){return chain},gte(){return chain},lt(){return chain},order(){return chain},range:async()=>({data:[],count:30,error:null})}
 const view=renderer('src/app/admin/pedidos/page.tsx',{'next/link':{default:'Link'},'next/navigation':{redirect:()=>{throw Error('redirect')}},'@/lib/admin-auth':{adminDatabase:async()=>({db:{from:()=>chain}})},'@/lib/admin-sales':sales,'@/lib/order-workflow':load('src/lib/order-workflow.ts'),'@/lib/admin-sales-summary':{salesPeriod:params=>api.salesPeriod(params,now),readSalesSummary:async(db,period)=>{received=period;return api.summarizeSales([],0,period)}}})
 const tree=await view.render({searchParams:{summary_period:'15',q:'Cliente'}})
 assert.equal(received.kind,'15');assert.equal(received.from,'2026-10-26')
 assert.ok(nodes(tree,n=>n.type==='select' && n.props.name==='summary_period').length)
 assert.ok(nodes(tree,n=>n.type==='input' && n.props.type==='month').length)
 assert.ok(nodes(tree,n=>n.type==='details' && n.props.open===true).length)
 const next=nodes(tree,n=>n.type==='Link' && String(n.props.href).includes('page=2'))[0]
 assert.match(next.props.href,/summary_period=15/);assert.match(next.props.href,/q=Cliente/)
})
