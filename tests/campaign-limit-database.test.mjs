import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
const migration=readFileSync(new URL('../database/campaigns/01-sem-limite-participantes.sql',import.meta.url),'utf8')
for(const check of ['jsonb_array_length(p_items) not between 1 and 500',"jsonb_array_length(p_items)<1 or jsonb_array_length(p_items) > 500",'not (jsonb_array_length(p_items) between 1 and 500)'])test('campaign migration removes only upper size bound: '+check,async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table campaign_limit_fixture(value jsonb);
   create function serenity_promotion_save_draft(p_items jsonb) returns integer language plpgsql as $$begin
    if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'CAMPAIGN_INVALID_ITEMS';end if;
    if ${check} then raise exception 'CAMPAIGN_INVALID_ITEMS';end if;
    if exists(select 1 from jsonb_array_elements(p_items) x where (x->>'discount')::numeric<=0) then raise exception 'CAMPAIGN_INVALID_DISCOUNT_VALUE';end if;
    insert into campaign_limit_fixture select value from jsonb_array_elements(p_items);
    return jsonb_array_length(p_items);
   end $$;
   revoke all on function serenity_promotion_save_draft(jsonb) from public,anon,authenticated;
   grant execute on function serenity_promotion_save_draft(jsonb) to service_role;`)
  const call=value=>db.query('select serenity_promotion_save_draft($1) n',[value===null?null:JSON.stringify(value)])
  const items=Array.from({length:1201},(_,id)=>({id,discount:10}))
  await assert.rejects(call(items),/CAMPAIGN_INVALID_ITEMS/)
  await db.exec(migration);await db.exec(migration)
  assert.equal((await call(items)).rows[0].n,1201)
  assert.equal((await db.query('select count(*) n from campaign_limit_fixture')).rows[0].n,1201)
  for(const input of [null,[],{}])await assert.rejects(call(input),/CAMPAIGN_INVALID_ITEMS/)
  await assert.rejects(call([{discount:0}]),/CAMPAIGN_INVALID_DISCOUNT_VALUE/)
  assert.equal((await db.query('select count(*) n from serenity_campaign_limit_backups_v1')).rows[0].n,1)
  await db.exec('set role anon');await assert.rejects(call(items),/permission denied/)
 }finally{await db.close()}
})
test('unknown limit checks abort without rewriting an unrecognized installation',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create function serenity_promotion_save_draft(p_items jsonb) returns integer language plpgsql as $$declare item_count integer:=jsonb_array_length(p_items);begin if item_count>500 then raise exception 'CAMPAIGN_INVALID_ITEMS';end if;return item_count;end $$;`)
  await assert.rejects(db.exec(migration),/Validação de limite não reconhecida/)
  await db.exec('rollback')
  await assert.rejects(db.query('select serenity_promotion_save_draft($1)',[JSON.stringify(Array(501).fill({}))]),/CAMPAIGN_INVALID_ITEMS/)
 }finally{await db.close()}
})
