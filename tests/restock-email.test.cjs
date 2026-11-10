const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs'),{randomUUID}=require('node:crypto')
const templates=load('src/lib/restock-email.ts')
const smtp=load('src/lib/order-email-server.ts',{'nodemailer':{default:{}},'./email-template':{}})
const job=()=>({id:randomUUID(),lease_id:randomUUID(),recipient:'a@example.com',name:'Lua <script>',variation:'Azul & rosa',slug:'importado-23927',variant:'101',token:'a'.repeat(64)})
test('restock template escapes product content, points to the exact variation, has cancellation and no price promises',()=>{
 const message=templates.restockEmail(job())
 assert.ok(!message.html.includes('<script>'));assert.match(message.html,/&lt;script&gt;/)
 assert.match(message.text,/variacao=101/);assert.match(message.text,/não reserva estoque/);assert.match(message.text,/cancelar\?token=/)
 assert.throws(()=>templates.restockEmail({...job(),slug:'https://evil.example'}),/RESTOCK_EMAIL_INPUT/)
})
function fixture({enabled=true,ready=true,sendError,finish=true,readyError=false}={}){
 const current=job(),calls=[],sent=[];let claimed=false
 const db={rpc:async(name,args)=>{calls.push({name,args});if(name==='serenity_restock_claim_v1'){if(claimed)return {data:[]};claimed=true;return {data:[current]}}if(name==='serenity_restock_ready_v1')return readyError?{error:{code:'offline'}}:{data:ready};return {data:finish}}}
 const api=load('src/lib/restock-server.ts',{'./order-email-server':{emailEnabled:()=>enabled,emailConfigured:()=>true,emailFailure:smtp.emailFailure,sendRestockEmail:async(...args)=>{if(sendError)throw sendError;sent.push(args)}},'./restock-email':templates})
 return {api,db,calls,sent,current}
}
test('restock worker sends a claimed/ready job once and finishes with its lease; disabled worker never contacts database or SMTP',async()=>{
 let f=fixture();const result=await f.api.drainRestockEmails(f.db)
 assert.equal(result.sent,1);assert.equal(f.sent.length,1)
 const done=f.calls.find(c=>c.name==='serenity_restock_finish_v1').args
 assert.equal(done.p_lease,f.current.lease_id);assert.equal(done.p_result,'sent')
 f=fixture({enabled:false});assert.equal((await f.api.drainRestockEmails(f.db)).skipped,true);assert.equal(f.calls.length,0)
})
test('restock worker rechecks stock and never blindly resends an uncertain SMTP delivery',async()=>{
 for(const [options,outcome,sent] of [[{ready:false},'waiting',0],[{readyError:true},'retry',0],[{sendError:{code:'EAUTH'}},'retry',0],[{sendError:{code:'ECONNRESET',command:'DATA'}},'review',0]]){
  const f=fixture(options);await f.api.drainRestockEmails(f.db)
  assert.equal(f.sent.length,sent);assert.equal(f.calls.find(c=>c.name==='serenity_restock_finish_v1').args.p_result,outcome)
 }
 const f=fixture({finish:false});assert.equal((await f.api.drainRestockEmails(f.db)).failed,1);assert.equal(f.sent.length,1)
})
