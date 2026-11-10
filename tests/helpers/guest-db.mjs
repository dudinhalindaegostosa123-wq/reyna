import {paymentDatabase} from './payment-db.mjs'
import {readFileSync} from 'node:fs'
const sql=(folder,name)=>readFileSync(new URL('../../database/'+folder+'/'+name,import.meta.url),'utf8')
export async function guestDatabase(){
 const db=await paymentDatabase()
 await db.exec(readFileSync(new URL('../fixtures/payments/installed-complete-order-v2.sql',import.meta.url),'utf8'))
 await db.exec(readFileSync(new URL('../fixtures/payments/installed-manual-create-order.sql',import.meta.url),'utf8'))
 await db.exec(sql('collection','01-progressivo.sql'))
 await db.exec(sql('pix-discount','01-pix-five.sql'))
 await db.exec(sql('commerce','01-precos-hastes-anodizacao.sql'))
 await db.exec(sql('commerce','03-esterilizacao-5-reais.sql'))
 await db.exec(sql('commerce','04-venda-sob-encomenda.sql'))
 await db.exec(sql('payments','04-cliente-pedido-aprovado.sql'))
 await db.exec(`alter table auth.users add column email text;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('fixture.user',true),'')::uuid$$;
 alter table serenity_customer_accounts add column wholesale_status text,add column version bigint;
 create table serenity_label_jobs(order_id uuid primary key,remote_id uuid,operation uuid,state text);
 create table serenity_label_purchases(order_id uuid primary key,remote_id uuid,operation uuid,phase text,carrier_status text);
 create table serenity_order_dispatches(order_id uuid primary key,remote_id uuid,dispatched_at timestamptz);
 create table serenity_shipment_tracking(order_id uuid primary key,remote_id uuid,carrier_status text,tracking_code text);
 create table serenity_legacy_orders_v1(old_id bigint primary key,parent_id bigint,kind text,original_status text,needs_review boolean,visible boolean,account_user_id uuid);
 create table serenity_legacy_shipping_orders_v1(id uuid primary key,legacy_id bigint,number bigint,customer_snapshot jsonb);
 create table serenity_legacy_label_jobs_v1(order_id uuid primary key,remote_id uuid,operation uuid,state text);
 create table serenity_legacy_label_purchases_v1(order_id uuid primary key,remote_id uuid,operation uuid,phase text,carrier_status text);`)
 for(const name of ['01-notificacoes.sql','02-aviso-nova-compra.sql','03-avisos-atacado.sql','04-rastreio-emails-historico.sql'])await db.exec(sql('email',name))
 await db.exec(sql('guest-checkout','01-visitante-acompanhamento.sql'))
 return db
}
