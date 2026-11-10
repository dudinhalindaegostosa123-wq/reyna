import 'server-only'
import type {SupabaseClient} from '@supabase/supabase-js'
import {emailEnabled,emailConfigured,emailFailure,sendRestockEmail} from './order-email-server'
import {restockEmail,type RestockJob} from './restock-email'
export async function drainRestockEmails(db:SupabaseClient,limit=5){
 if(!emailEnabled() || !emailConfigured())return {sent:0,failed:0,skipped:true}
 let sent=0,failed=0
 const start=Date.now()
 for(let i=0;i<Math.min(limit,10) && Date.now()-start<18000;i++){
  const claim=await db.rpc('serenity_restock_claim_v1')
  if(claim.error){if(['PGRST202','42883'].includes(claim.error.code || ''))return {sent,failed,skipped:true,installed:false};return {sent,failed:failed+1,skipped:false}}
  const job=claim.data?.[0] as RestockJob|undefined
  if(!job)break
  let result:'sent'|'retry'|'review'|'waiting'='sent',code:string|null=null
  try{
   const ready=await db.rpc('serenity_restock_ready_v1',{p_id:job.id,p_lease:job.lease_id})
   if(ready.error){result='retry';code='RESTOCK_READY';failed++}
   else if(ready.data!==true)result='waiting'
   else{await sendRestockEmail(job.recipient,job.id,restockEmail(job));sent++}
  }catch(error){const outcome=emailFailure(error);result=outcome.result;code=outcome.code;failed++}
  const finish=await db.rpc('serenity_restock_finish_v1',{p_id:job.id,p_lease:job.lease_id,p_result:result,p_code:code})
  if(finish.error || finish.data!==true){failed++;break}
 }
 return {sent,failed,skipped:false}
}
