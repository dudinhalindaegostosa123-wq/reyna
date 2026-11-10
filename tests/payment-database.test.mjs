import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
test('database: production approval, duplicate delivery, refunds, sandbox, rollback and private permissions', async () => {
const db=new PGlite();
try {
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create table serenity_orders(id uuid primary key,number bigint,status text,source text);create table serenity_customers(id uuid primary key);create table products(id uuid primary key,slug text,name text,status text,visibility text,stock_status text,stock_quantity integer,sold_individually boolean,product_type text,regular_price numeric,sale_price numeric,sale_starts_at timestamptz,sale_ends_at timestamptz,tags text[]);create table product_variants(id uuid primary key,product_id uuid references products(id),woo_id bigint,enabled boolean,stock_status text,stock_quantity integer,regular_price numeric,sale_price numeric,sale_starts_at timestamptz,sale_ends_at timestamptz,attributes jsonb,name text);create table serenity_shipping_settings(singleton boolean primary key,version bigint);insert into serenity_shipping_settings values(true,1);create table serenity_shipping_quotes(id uuid primary key,request_id uuid,cart_hash text,destination text,subtotal_cents bigint,amount_cents bigint,manual boolean,settings_version bigint,snapshot jsonb,created_at timestamptz default now(),expires_at timestamptz,consumed_by uuid);create table serenity_stock_reservations(order_id uuid,product_id uuid,variant_id uuid,quantity integer,state text,expires_at timestamptz);create table serenity_coupons(id uuid primary key,code text,status text,starts_at timestamptz,ends_at timestamptz,scope text,minimum_subtotal numeric,discount_type text,discount_value numeric,max_uses bigint,max_uses_per_customer bigint,version bigint);create table serenity_coupon_products(coupon_id uuid,product_id uuid);create table serenity_coupon_redemptions(order_id uuid,coupon_id uuid,customer_key text,state text,reserved_until timestamptz);create table wholesale_fixture(user_id uuid primary key,context jsonb);create function serenity_wholesale_context(uuid) returns jsonb language sql as $$select coalesce((select context from public.wholesale_fixture where user_id=$1),'{}'::jsonb);$$;create function serenity_checkout_document_valid(text) returns boolean language sql immutable as $$select $1='52998224725';$$;create function serenity_target_effective_price(uuid,uuid,numeric,numeric,timestamptz,timestamptz) returns numeric language sql as $$select coalesce($4,$3);$$;create function serenity_wholesale_unit_price(numeric,numeric) returns numeric language sql as $$select round($1/2,2);$$;`);
const dir=fileURLToPath(new URL('./fixtures/payments/',import.meta.url));await db.exec(fs.readFileSync(dir+'01-base.sql','utf8'));await db.exec(fs.readFileSync(dir+'02-reserva-estoque.sql','utf8'));
for(const path of [dir+'serenity_checkout_quote.sql',dir+'serenity_stock_review.sql',dir+'serenity_checkout_coupon_quote.sql',dir+'serenity_wholesale_stock_review.sql'])await db.exec(fs.readFileSync(path,'utf8').trim()+';');
await db.exec(fs.readFileSync(dir+'03-reserva-cupons.sql','utf8'));await db.exec(fs.readFileSync(dir+'04-sessao.sql','utf8'));await db.exec(fs.readFileSync(dir+'04-sessao.sql','utf8'));
const product=randomUUID();await db.query(`insert into products values($1,'test','Peça','published','visible','instock',100,false,'simple',100,80,null,null,'{}')`,[product]);const coupon=randomUUID();await db.query("insert into serenity_coupons values($1,'TEST30','active',null,null,'all',0,'percent',30,100,100,1)",[coupon]);
const contact={name:'Teste',email:'test@example.com',phone:'11999999999',document:'52998224725'},address={cep:'18072000',street:'Rua',number:'1',complement:'',district:'Bairro',city:'Sorocaba',state:'SP'};
const fp='a'.repeat(64),cartHash='b'.repeat(64),customerKey='c'.repeat(64);
async function prepare({qty=1,base=8000,discount=0,user=null,snapshot={pricing_mode:'retail'},code='',manual=false}={}){const id=randomUUID(),shipping=randomUUID(),access=id.replaceAll('-','').repeat(2);await db.query("insert into serenity_shipping_quotes(id,request_id,cart_hash,destination,subtotal_cents,amount_cents,manual,settings_version,snapshot,expires_at) values($1,$2,$3,'18072000',$4,1000,$5,1,$6,now()+interval '15 minutes')",[shipping,id,cartHash,base,manual,JSON.stringify(snapshot)]);return {id,access,args:[id,fp,access,'test',user,JSON.stringify([{slug:'test',variant:'',quantity:qty,color:''}]),JSON.stringify(contact),JSON.stringify(address),base-discount+1000,cartHash,shipping,code,customerKey]}}
const call=async s=>(await db.query('select serenity_checkout_start_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) r',s.args)).rows[0].r;

await db.exec(fs.readFileSync(dir+'05-iniciar-pix.sql','utf8'));
await db.exec(fs.readFileSync(dir+'05-iniciar-pix.sql','utf8'));
const claim=async(s,id=randomUUID(),hash='d'.repeat(64))=>(await db.query('select serenity_checkout_claim_pix_v2($1,$2,$3,$4,$5)',[s.id,s.access,id,'123',hash])).rows[0].serenity_checkout_claim_pix_v2;

await db.exec(`alter table serenity_orders add column customer_id uuid references serenity_customers(id), add column customer_snapshot jsonb, add column items jsonb, add column subtotal numeric, add column discount numeric, add column shipping numeric, add column expenses numeric, add column total numeric, add column cost numeric, add column missing_costs integer, add column notes text, add column created_by uuid, add column paid_at timestamptz, add column shipping_pending boolean, add column delivery_address jsonb, add column checkout_fingerprint text, add column shipping_details jsonb, add column account_user_id uuid, add column stock_state text default 'none', add column stock_reserved_until timestamptz, add column stock_untracked integer default 0, add column created_at timestamptz default now(), add column updated_at timestamptz default now();create sequence order_numbers;alter table serenity_orders alter column number set default nextval('order_numbers');alter table serenity_customers add column name text,add column email text,add column phone text;alter table products add column sku text;alter table product_variants add column sku text;create table serenity_customer_accounts(user_id uuid primary key,customer_id uuid);create table serenity_product_commercial(entity_key text,unit_cost numeric,supplier_name text,variant_id uuid);create table serenity_stock_events(order_id uuid,kind text,changes jsonb,actor uuid);alter table serenity_coupon_redemptions add column discount_cents bigint,add column coupon_snapshot jsonb,add column created_at timestamptz default now(),add column updated_at timestamptz default now();alter table serenity_stock_reservations add column entity_key text;alter table serenity_stock_reservations add unique(order_id,entity_key);`);
for(const name of ['serenity_stock_reserve','serenity_stock_debit','serenity_stock_release','serenity_stock_order_trigger'])await db.exec(fs.readFileSync(dir+name+'.sql','utf8').trim()+';');
await db.exec(fs.readFileSync(dir+'serenity_admin_order_status.sql','utf8'));
await db.exec(fs.readFileSync(dir+'serenity_coupon_order_state.sql','utf8'));
await db.exec(`create trigger stock_insert after insert on serenity_orders for each row execute function serenity_stock_order_trigger();create trigger stock_update after update of status on serenity_orders for each row when(old.status is distinct from new.status) execute function serenity_stock_order_trigger();create trigger coupon_update after update of status on serenity_orders for each row execute function serenity_coupon_order_state();`);
await db.exec(fs.readFileSync(dir+'06-confirmar-pagamento.sql','utf8'));await db.exec(fs.readFileSync(dir+'06-confirmar-pagamento.sql','utf8'));
await db.exec(fs.readFileSync(dir+'installed-start-v2.sql','utf8'));
const productionSql=fs.readFileSync(new URL('../database/payments/01-producao.sql',import.meta.url),'utf8');
await db.exec(productionSql);await db.exec(productionSql);
assert.equal((await db.query('select serenity_checkout_payment_ready_v3() r')).rows[0].r.ready,true);
const allSql=fs.readFileSync(new URL('../database/payments/03-pix-cartao.sql',import.meta.url),'utf8');
await db.exec(allSql);await db.exec(allSql);
assert.equal((await db.query('select serenity_checkout_card_ready_v3() r')).rows[0].r.ready,true);

let serial=1000,tick=0;const ids=new Map();function facts(s,a,state='approved',env='production',refund=0){if(!ids.has(a))ids.set(a,String(serial++));return{provider_payment_id:ids.get(a),environment:env,merchant_id:'123',external_reference:s.id,attempt_id:a,method:'pix',currency:'BRL',amount_cents:s.args[8],refunded_cents:refund,status:state,status_detail:'test_fixture',updated_at:new Date(Date.now()+tick++*1000).toISOString(),expires_at:new Date(Date.now()+32*60000).toISOString(),pix_code:'000201',pix_qr_base64:'dGVzdA=='}}
const observe=async(a,f)=>(await db.query("select serenity_checkout_observe_payment_v2($1,$2,'poll') r",[a,JSON.stringify(f)])).rows[0].r;
const orders=async()=>(await db.query('select count(*)::integer n from serenity_orders')).rows[0].n;
const stock=async()=>(await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity;
const prod=await prepare({discount:1000,code:'TEST30'});prod.args[3]='production';await call(prod);const attempt=randomUUID();await claim(prod,attempt);assert.equal(await orders(),0);
const approved=facts(prod,attempt);let r=await observe(attempt,approved);assert.equal(r.application_state,'applied');assert.equal(r.order_id,prod.id);assert.equal(await orders(),1);assert.equal(await stock(),99);const order=(await db.query('select * from serenity_orders where id=$1',[prod.id])).rows[0];assert.equal(order.status,'paid');assert.equal(Number(order.total),80);assert.equal(order.customer_snapshot.document,contact.document);assert.equal((await db.query('select state from serenity_coupon_redemptions where order_id=$1',[prod.id])).rows[0].state,'used');await observe(attempt,approved);assert.equal(await orders(),1);assert.equal(await stock(),99);
let publicContext=(await db.query('select serenity_checkout_context_v2($1,$2) r',[prod.id,prod.access])).rows[0].r;assert.equal(publicContext.order_number,1);assert.equal(publicContext.needs_review,false);
r=await observe(attempt,facts(prod,attempt,'approved','production',100));assert.equal(r.application_state,'review');assert.equal((await db.query('select status from serenity_orders where id=$1',[prod.id])).rows[0].status,'paid');
r=await observe(attempt,facts(prod,attempt,'refunded','production',8000));assert.equal(r.application_state,'applied');assert.equal((await db.query('select status from serenity_orders where id=$1',[prod.id])).rows[0].status,'refunded');assert.equal(await stock(),99);await observe(attempt,approved);assert.equal((await db.query('select state from serenity_checkout_payments_v2 where id=$1',[attempt])).rows[0].state,'refunded');
const sandbox=await prepare();await call(sandbox);const testAttempt=randomUUID();await claim(sandbox,testAttempt);r=await observe(testAttempt,facts(sandbox,testAttempt,'approved','test'));assert.equal(r.application_state,'test_approved');assert.equal(await orders(),1);assert.equal(await stock(),99);publicContext=(await db.query('select serenity_checkout_context_v2($1,$2) r',[sandbox.id,sandbox.access])).rows[0].r;assert.equal(publicContext.test_approved,true);assert.equal(publicContext.order_id,null);assert.equal((await db.query("select count(*)::integer n from serenity_checkout_stock_v2 where checkout_id=$1 and state='active'",[sandbox.id])).rows[0].n,0);
const late=await prepare();late.args[3]='production';await call(late);const lateAttempt=randomUUID();await claim(late,lateAttempt);await db.query("update serenity_checkout_sessions_v2 set created_at=now()-interval '40 minutes',expires_at=now()-interval '1 minute',access_expires_at=now()+interval '22 hours' where id=$1",[late.id]);r=await observe(lateAttempt,facts(late,lateAttempt));assert.equal(r.state,'approved');assert.equal(r.application_state,'review');assert.equal(await orders(),1);
const failed=await prepare();failed.args[3]='production';await call(failed);const failedAttempt=randomUUID();await claim(failed,failedAttempt);await db.query('update products set stock_quantity=0 where id=$1',[product]);const failureFacts=facts(failed,failedAttempt);r=await observe(failedAttempt,failureFacts);assert.equal(r.application_state,'review');assert.equal(await orders(),1);assert.equal((await db.query('select count(*)::integer n from serenity_customers where id=$1',[failed.id])).rows[0].n,0);await db.query('update products set stock_quantity=99 where id=$1',[product]);r=await observe(failedAttempt,failureFacts);assert.equal(r.application_state,'applied');assert.equal(await orders(),2);assert.equal(await stock(),98);
const conflict=await prepare();conflict.args[3]='production';await call(conflict);const first=randomUUID(),second=randomUUID();await claim(conflict,first);await observe(first,facts(conflict,first,'rejected'));await claim(conflict,second);await observe(second,facts(conflict,second));assert.equal(await orders(),3);assert.equal(await stock(),97);r=await observe(first,facts(conflict,first));assert.equal(r.application_state,'review');assert.equal(await orders(),3);assert.equal(await stock(),97);r=await observe(first,facts(conflict,first,'refunded','production',conflict.args[8]));assert.equal(r.application_state,'review');assert.equal((await db.query('select status from serenity_orders where id=$1',[conflict.id])).rows[0].status,'paid');
await assert.rejects(observe(second,{...facts(conflict,second),amount_cents:1}),/PAYMENT_OBSERVATION_MISMATCH/);const pending=await prepare();await call(pending);const pendingAttempt=randomUUID();await claim(pending,pendingAttempt);r=await observe(pendingAttempt,{...facts(pending,pendingAttempt,'pending','test'),expires_at:new Date(Date.now()+24*60*60000).toISOString()});assert.equal(r.application_state,'review');assert.equal((await db.query('select pix_code from serenity_checkout_payments_v2 where id=$1',[pendingAttempt])).rows[0].pix_code,null);
assert.equal((await db.query("select has_function_privilege('anon','serenity_checkout_observe_payment_v2(uuid,jsonb,text)','execute') ok")).rows[0].ok,false);
console.log('PASS: actual stock/coupon/order triggers; verified production fixture creates paid order once and debits once; duplicate/stale observations; partial/full refund without restocking; sandbox no order/debit; late approval review; conversion failure persists approval and retries safely; second-payment ownership; mismatch rejected; unsafe Pix expiry hidden; private RPC. No API/credentials. Pricing/rules/document helper mocks, isolated DB.');


const cardCheckout=await prepare();cardCheckout.args[3]='production';await call(cardCheckout);
const cardAttempt=randomUUID();
const claimCard=async(s,id)=>(await db.query('select serenity_checkout_claim_card_v3($1,$2,$3,$4,$5) r',[s.id,s.access,id,'123','e'.repeat(64)])).rows[0].r;
const cardClaim=await claimCard(cardCheckout,cardAttempt);assert.equal(cardClaim.method,'card');
assert.equal((await claimCard(cardCheckout,cardAttempt)).submit,false);
await assert.rejects(claim(cardCheckout,randomUUID()),/PAYMENT_ALREADY_STARTED/);
const observeCard=async(a,f)=>(await db.query("select serenity_checkout_observe_payment_v3($1,$2,'webhook') r",[a,JSON.stringify(f)])).rows[0].r;
const cardPending={...facts(cardCheckout,cardAttempt,'pending'),method:'card',status_detail:'pending_challenge',expires_at:null,
  card_authentication:{external_resource_url:'https://issuer.example.com/3ds',creq:'dGVzdA=='}};
await observeCard(cardAttempt,cardPending);
let cardContext=(await db.query('select serenity_checkout_context_v2($1,$2) r',[cardCheckout.id,cardCheckout.access])).rows[0].r;
assert.equal(cardContext.attempts[0].provider_payment_id,cardPending.provider_payment_id);
assert.equal(cardContext.attempts[0].card_authentication.creq,'dGVzdA==');
await observeCard(cardAttempt,{...cardPending,updated_at:new Date(Date.parse(cardPending.updated_at)-1000).toISOString(),card_authentication:{external_resource_url:'https://issuer.example.com/old',creq:'b2xk'}});
cardContext=(await db.query('select serenity_checkout_context_v2($1,$2) r',[cardCheckout.id,cardCheckout.access])).rows[0].r;
assert.equal(cardContext.attempts[0].card_authentication.creq,'dGVzdA==');
const cardApproval={...facts(cardCheckout,cardAttempt),method:'card',expires_at:null,card_authentication:null};
await observeCard(cardAttempt,cardApproval);await observeCard(cardAttempt,cardApproval);
assert.equal(await orders(),4);assert.equal(await stock(),96);
assert.equal((await db.query('select card_authentication from serenity_checkout_payments_v2 where id=$1',[cardAttempt])).rows[0].card_authentication,null);
const competing=await prepare();competing.args[3]='production';await call(competing);await claim(competing,randomUUID());
await assert.rejects(claimCard(competing,randomUUID()),/PAYMENT_ALREADY_STARTED/);
const cardTest=await prepare();await call(cardTest);const cardTestAttempt=randomUUID();await claimCard(cardTest,cardTestAttempt);
assert.equal((await observeCard(cardTestAttempt,{...facts(cardTest,cardTestAttempt,'approved','test'),method:'card',expires_at:null})).application_state,'test_approved');
assert.equal(await orders(),4);assert.equal(await stock(),96);
const rejectedCard=await prepare();rejectedCard.args[3]='production';await call(rejectedCard);const rejectedCardId=randomUUID();await claimCard(rejectedCard,rejectedCardId);
await observeCard(rejectedCardId,{...facts(rejectedCard,rejectedCardId,'rejected'),method:'card',expires_at:null});
assert.equal((await claimCard(rejectedCard,randomUUID())).submit,true);
console.log('PASS: cartão e Pix compartilham a trava; 3DS persiste e é limpo após aprovação; cartão pago cria um único pedido/baixa; teste não vira venda; recusa definitiva permite nova tentativa explícita.');
const accountUser=randomUUID();
await db.query('insert into auth.users values($1,now())',[accountUser]);
const accountRules={active:true,discount_percent:50,minimum_products_cents:100000,settings_version:1,account_version:1};
await db.query('insert into wholesale_fixture values($1,$2)',[accountUser,JSON.stringify(accountRules)]);
await db.query(`update wholesale_fixture set context=jsonb_set(context,'{discount_percent}','50.00'::jsonb) where user_id=$1`,[accountUser]);
const accountSnapshot={pricing_mode:'wholesale',wholesale:{...accountRules,user_id:accountUser}};
const wholesaleAccount=await prepare({qty:20,user:accountUser,snapshot:accountSnapshot,base:100000});
await db.exec('grant usage on schema public to service_role; grant select,insert,update,delete on all tables in schema public to service_role; set role service_role;');
assert.equal((await call(wholesaleAccount)).pricing_mode,'wholesale');
await assert.rejects(db.query('select * from auth.users'),e=>e.code==='42501');
assert.equal((await db.query('select serenity_checkout_payment_ready_v3() r')).rows[0].r.ready,true);
await db.exec('reset role');
const changedDiscount=await prepare({qty:20,user:accountUser,snapshot:{...accountSnapshot,wholesale:{...accountSnapshot.wholesale,discount_percent:40}},base:100000});
await assert.rejects(call(changedDiscount),/SHIPPING_QUOTE_EXPIRED/);
assert.equal(await orders(),4);

await db.exec('set role anon');
await assert.rejects(db.query('select public.serenity_checkout_payment_ready_v3()'),e=>e.code==='42501');
assert.equal((await db.query("select has_function_privilege('anon','serenity_checkout_claim_card_v3(uuid,text,uuid,text,text)','execute') ok")).rows[0].ok,false);
assert.equal((await db.query("select has_function_privilege('authenticated','serenity_checkout_observe_payment_v3(uuid,jsonb,text)','execute') ok")).rows[0].ok,false);
await db.exec('reset role');
} finally { await db.close(); }
});
