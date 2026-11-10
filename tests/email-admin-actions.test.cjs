const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
test('tracking action submits an authenticated server request and reports the actual result to the admin',async()=>{
 let authenticated=0,calls=0,revalidated=[]
 const secret='fixture-only-secret-with-at-least-32-characters'
 const actions=load('src/app/admin/emails/actions.ts',{
  'next/cache':{revalidatePath:path=>revalidated.push(path)},'next/navigation':{redirect:path=>{throw Error(`redirect:${path}`)}},
  '@/lib/admin-auth':{adminDatabase:async()=>{authenticated++;return {db:{}}}},'@/lib/order-email-server':{},
  '@/app/api/cron/rastreamento/route':{GET:async request=>{calls++;assert.equal(request.headers.get('authorization'),`Bearer ${secret}`);return Response.json({ok:true,legacy:{installed:true}})}},
 },{CRON_SECRET:secret})
 await assert.rejects(actions.refreshShipmentNotifications(),/redirect:\/admin\/emails\?rastreio=atualizado/)
 assert.equal(authenticated,1);assert.equal(calls,1);assert.ok(revalidated.includes('/admin/emails'))
})
test('missing cron credentials give a visible reference instead of calling tracking without authentication',async()=>{
 let calls=0
 const actions=load('src/app/admin/emails/actions.ts',{
  'next/cache':{revalidatePath(){}},'next/navigation':{redirect:path=>{throw Error(`redirect:${path}`)}},'@/lib/admin-auth':{adminDatabase:async()=>({db:{}})},'@/lib/order-email-server':{},
  '@/app/api/cron/rastreamento/route':{GET:async()=>{calls++}},
 })
 await assert.rejects(actions.refreshShipmentNotifications(),/rastreio=falha&rastreio_ref=CRON_CONFIGURATION/)
 assert.equal(calls,0)
})
