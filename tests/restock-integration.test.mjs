import {test} from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {randomUUID,createHmac} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {load}=require('./helpers/load.cjs')
async function fixture(){
 const db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create table products(id uuid primary key,slug text,name text,product_type text,status text,visibility text,stock_status text,stock_quantity integer);
  create table product_variants(id uuid primary key,product_id uuid references products(id),woo_id bigint,name text,enabled boolean,stock_status text,stock_quantity integer);
  create table serenity_stock_reservations(product_id uuid,variant_id uuid,quantity integer,state text,expires_at timestamptz);`)
 await db.exec(readFileSync(new URL('../database/restock/01-avisos-estoque.sql',import.meta.url),'utf8'))
 // Execute the production RPCs against PostgreSQL; only the HTTP adapter is replaced.
 const rpc={async rpc(name,args={}){
  const specs={
   serenity_restock_subscribe_v1:{keys:['p_slug','p_variant','p_email','p_key']},
   serenity_restock_claim_v1:{keys:[],rows:true},
   serenity_restock_ready_v1:{keys:['p_id','p_lease']},
   serenity_restock_finish_v1:{keys:['p_id','p_lease','p_result','p_code']},
   serenity_restock_cancel_v1:{keys:['p_token']},
  }
  const spec=specs[name];assert.ok(spec,'Unexpected RPC')
  try{
   const params=spec.keys.map(key=>args[key] ?? null),placeholders=params.map((_,i)=>'$'+(i+1)).join(',')
   const result=await db.query(spec.rows?`select * from ${name}(${placeholders})`:`select ${name}(${placeholders}) value`,params)
   return {data:spec.rows?result.rows:result.rows[0]?.value,error:null}
  }catch(error){return {data:null,error:{message:error.message,code:error.code}}}
 }}
 const messages=[];let smtpError=null
 const emails=load('src/lib/order-email-server.ts',{
  nodemailer:{default:{createTransport:options=>{
   assert.equal(options.secure,true);assert.equal(options.tls.minVersion,'TLSv1.2')
   return {async sendMail(message){messages.push(message);if(smtpError)throw smtpError;return {accepted:[message.to]}}}
  }}},'./email-template':{}
 },{VERCEL_ENV:'production',SERENITY_EMAIL_ENABLED:'true',SMTP_USER:'smtp@example.test',SMTP_FROM_EMAIL:'loja@example.test',SMTP_PASSWORD:'simulated-test-password'})
 const action=load('src/app/avisos/estoque/actions.ts',{
  'next/headers':{headers:()=>new Headers({'x-forwarded-for':'203.0.113.1'})},'node:crypto':{createHmac},
  '@/lib/payment-processing-server':{paymentDatabase:()=>rpc},'@/lib/order-email-server':emails,
 },{VERCEL:'1',CRON_SECRET:'simulated-test-key-'.repeat(4)})
 const worker=load('src/lib/restock-server.ts',{'./order-email-server':emails,'./restock-email':load('src/lib/restock-email.ts')})
 const cancel=load('src/app/avisos/estoque/cancelar/route.ts',{'@/lib/payment-processing-server':{paymentDatabase:()=>rpc}})
 function form(slug,variant=''){
  const data=new FormData();for(const [key,value] of Object.entries({slug,variant,email:' CLIENTE-TESTE@EXAMPLE.COM ',consent:'on'}))data.set(key,value)
  return data
 }
 return {db,messages,subscribe:(slug,variant)=>action.subscribeRestock(form(slug,variant)),drain:()=>worker.drainRestockEmails(rpc),cancel:cancel.GET,setError:error=>{smtpError=error}}
}
test('integration: real signup, SQL queue, variation restock, template and SMTP worker produce one notification; cancellation prevents a future one',async()=>{
 const f=await fixture()
 try{
  const id=randomUUID(),blue=randomUUID(),pink=randomUUID()
  await f.db.query("insert into products values($1,'flor-teste','Flor de teste','variable','published','visible','instock',null)",[id])
  await f.db.query("insert into product_variants values($1,$2,101,'Azul',true,'outofstock',0),($3,$2,102,'Rosa',true,'instock',1)",[blue,id,pink])
  assert.ok((await f.subscribe('flor-teste','101')).success)
  assert.ok((await f.subscribe('flor-teste','101')).success)
  assert.equal((await f.db.query('select count(*) n from serenity_restock_subscriptions_v1')).rows[0].n,1)
  assert.equal((await f.drain()).sent,0);assert.equal(f.messages.length,0)
  await f.db.query("update product_variants set stock_status='instock',stock_quantity=1 where id=$1",[blue])
  await f.db.query("insert into serenity_stock_reservations values($1,$2,1,'reserved',now()+interval '1 hour')",[id,blue])
  assert.equal((await f.drain()).sent,0);assert.equal(f.messages.length,0)
  await f.db.exec('delete from serenity_stock_reservations')
  const delivered=await f.drain();assert.equal(delivered.sent,1);assert.equal(delivered.failed,0)
  assert.equal(f.messages.length,1)
  const message=f.messages[0]
  assert.equal(message.to,'cliente-teste@example.com');assert.equal(message.from.address,'loja@example.test')
  assert.match(message.text,/Flor de teste — Azul/);assert.match(message.text,/produto\/flor-teste\?variacao=101/)
  assert.equal((await f.db.query('select state from serenity_restock_subscriptions_v1')).rows[0].state,'sent')
  assert.equal((await f.drain()).sent,0);assert.equal(f.messages.length,1)
  // A new explicit subscription is a new cycle, which the actual cancellation route can cancel.
  await f.db.query("update product_variants set stock_status='outofstock',stock_quantity=0 where id=$1",[blue])
  assert.ok((await f.subscribe('flor-teste','101')).success)
  const {token}=(await f.db.query('select token from serenity_restock_subscriptions_v1')).rows[0]
  assert.equal((await f.cancel(new Request('https://serenitypiercings.com.br/avisos/estoque/cancelar?token='+token))).status,200)
  await f.db.query("update product_variants set stock_status='instock',stock_quantity=1 where id=$1",[blue])
  assert.equal((await f.drain()).sent,0);assert.equal(f.messages.length,1)
 }finally{await f.db.close()}
})
test('integration: ambiguous SMTP failure moves the real queue to review without automatically repeating delivery',async()=>{
 const f=await fixture()
 try{
  const id=randomUUID()
  await f.db.query("insert into products values($1,'lua-teste','Lua de teste','simple','published','visible','outofstock',0)",[id])
  assert.ok((await f.subscribe('lua-teste')).success)
  await f.db.exec("update products set stock_status='instock',stock_quantity=1")
  f.setError({code:'ECONNRESET',command:'DATA'})
  assert.equal((await f.drain()).failed,1)
  assert.equal((await f.db.query('select state from serenity_restock_subscriptions_v1')).rows[0].state,'review')
  assert.equal(f.messages.length,1)
  f.setError(null);assert.equal((await f.drain()).sent,0);assert.equal(f.messages.length,1)
 }finally{await f.db.close()}
})
