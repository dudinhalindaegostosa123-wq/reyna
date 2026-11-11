// A catalog-only database matching the user's inventory. No checkout helper mocks.
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
export async function lunarityCatalogDatabase() {
 const db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema public,auth to service_role,authenticated,anon;
  grant execute on function auth.uid() to service_role,authenticated,anon;`)
 await db.exec(fs.readFileSync(new URL('../fixtures/admin-catalog/schema.sql',import.meta.url),'utf8'))
 await db.exec(`
  create table serenity_product_commercial(entity_key text primary key,product_id uuid references products(id),variant_id uuid,unit_cost numeric,supplier_name text);
  create table serenity_commerce_settings_v1(singleton boolean primary key,version bigint,anodization_fee numeric,included_stems boolean,
   retail_free_shipping_minimum_cents bigint,free_shipping_after_discounts boolean,preparation_options boolean,
   sterilization_all_products boolean,stem_fee numeric,sterilization_fee numeric);
  insert into serenity_commerce_settings_v1 values(true,7,0,true,30000,true,true,true,5,10);
  create table serenity_collection_settings(singleton boolean primary key,enabled boolean not null);
  insert into serenity_collection_settings values(true,true);
  create table serenity_pix_discount_settings_v4(singleton boolean primary key,enabled boolean not null);
  insert into serenity_pix_discount_settings_v4 values(true,true);
  -- Real time-bounded sale and active campaign behavior in the existing catalog.
  create table serenity_promotion_campaigns(id uuid primary key,status text,starts_at timestamptz,ends_at timestamptz);
  create table serenity_promotion_items(product_id uuid,variant_id uuid,campaign_id uuid references serenity_promotion_campaigns(id),sale_price numeric);
  create function serenity_effective_price(p_regular numeric,p_sale numeric,p_starts timestamptz,p_ends timestamptz) returns numeric language sql stable as $$
   select case when p_sale is not null and p_sale>=0 and p_sale<p_regular and (p_starts is null or p_starts<=now()) and (p_ends is null or p_ends>now()) then p_sale else p_regular end;
  $$;
  create function serenity_target_effective_price(p_product uuid,p_variant uuid,p_regular numeric,p_sale numeric,p_starts timestamptz,p_ends timestamptz)
  returns numeric language sql stable as $$select least(public.serenity_effective_price(p_regular,p_sale,p_starts,p_ends),
   (select min(i.sale_price) from public.serenity_promotion_items i join public.serenity_promotion_campaigns c on c.id=i.campaign_id
    where i.product_id=p_product and i.variant_id is not distinct from p_variant and c.status='published' and c.starts_at<=now() and c.ends_at>now()));$$;
 `)
 return db
}
