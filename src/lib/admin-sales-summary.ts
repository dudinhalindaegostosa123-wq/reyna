import 'server-only'
import type {SupabaseClient} from '@supabase/supabase-js'
import type {SalesSummary} from './admin-sales'
export interface SalesPeriod {kind:'month'|'7'|'15';month:string;currentMonth:string;from:string;to:string;start:string;end:string;label:string}
const dayKey=(date:Date)=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date)
 const part=(name:string)=>parts.find(p=>p.type===name)!.value
 return `${part('year')}-${part('month')}-${part('day')}`
}
const addDays=(day:string,count:number)=>new Date(Date.parse(day+'T12:00:00Z')+count*86400000).toISOString().slice(0,10)
export function salesPeriod(params:Record<string,unknown>={},now=new Date()):SalesPeriod {
 const today=dayKey(now),currentMonth=today.slice(0,7)
 const kind=params.summary_period==='7'?'7':params.summary_period==='15'?'15':'month'
 const requested=typeof params.summary_month==='string'?params.summary_month:''
 const month=/^\d{4}-(?:0[1-9]|1[0-2])$/.test(requested) && requested>='2000-01' && requested<=currentMonth?requested:currentMonth
 const from=kind==='month'?month+'-01':addDays(today,1-Number(kind))
 const nextMonth=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)).toISOString().slice(0,10)
 const until=kind==='month' && month!==currentMonth?nextMonth:addDays(today,1)
 const to=addDays(until,-1)
 const label=kind==='month'?`Mês ${month.slice(5)}/${month.slice(0,4)}`:`Últimos ${kind} dias`
 return {kind,month,currentMonth,from,to,start:from+'T00:00:00-03:00',end:until+'T00:00:00-03:00',label}
}
interface SummaryOrder {id:string;paid_at:string;subtotal:number;discount:number;shipping:number;expenses:number;total:number;cost:number|null;missing_costs:number}
const cents=(value:unknown)=>{
 const amount=Number(value)
 if(!Number.isFinite(amount))throw Error('SUMMARY_AMOUNT')
 return Math.round(amount*100)
}
export function summarizeSales(rows:SummaryOrder[],pending:number,period:SalesPeriod):SalesSummary {
 const days=new Map<string,number>()
 for(let day=period.from;day<=period.to;day=addDays(day,1))days.set(day,0)
 let revenue=0,shipping=0,cost=0,expenses=0,products=0,missing=0,unknownCost=false
 for(const order of rows){
  const day=dayKey(new Date(order.paid_at))
  if(!days.has(day))throw Error('SUMMARY_DATE')
  const total=cents(order.total)
  revenue+=total;shipping+=cents(order.shipping);products+=cents(order.subtotal)-cents(order.discount);expenses+=cents(order.expenses)
  missing+=Number(order.missing_costs || 0)
  if(order.cost===null || order.missing_costs>0)unknownCost=true
  else cost+=cents(order.cost)
  days.set(day,days.get(day)!+total)
 }
 return {paid:rows.length,revenue:revenue/100,shipping:shipping/100,cost:cost/100,expenses:expenses/100,missing,margin:unknownCost?null:(products-cost-expenses)/100,pending,customers:0,days:Array.from(days,([day,total])=>({day,total:total/100}))}
}
export async function readSalesSummary(db:Pick<SupabaseClient,'from'>,period:SalesPeriod):Promise<SalesSummary|null>{
 try{
  const pending=await db.from('serenity_orders').select('id',{count:'exact',head:true}).eq('status','pending').gte('created_at',period.start).lt('created_at',period.end)
  if(pending.error || pending.count===null)return null
  let query=db.from('serenity_orders').select('id,paid_at,subtotal,discount,shipping,expenses,total,cost,missing_costs').eq('status','paid').gte('paid_at',period.start).lt('paid_at',period.end).order('id')
  const rows:SummaryOrder[]=[]
  for(;;){
   const page=await query.range(0,499)
   if(page.error)return null
   const batch=(page.data || []) as SummaryOrder[]
   rows.push(...batch)
   if(batch.length<500)break
   query=query.gt('id',batch[batch.length-1].id)
  }
  return summarizeSales(rows,pending.count || 0,period)
 }catch{return null}
}
