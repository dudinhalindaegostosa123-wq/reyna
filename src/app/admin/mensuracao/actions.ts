'use server'
import {adminDatabase} from '@/lib/admin-auth'
import {drainAnalytics,GA4_MEASUREMENT_ID} from '@/lib/analytics-server'
import {revalidatePath} from 'next/cache'
export async function processAnalytics(){
 const {db}=await adminDatabase()
 try{const result=await drainAnalytics(db);revalidatePath('/admin/mensuracao');return {message:result.skipped?'O envio pelo servidor está desativado.':`${result.sent} enviados ao endpoint do GA4 · ${result.failed} precisam de conferência.`}}catch{return {message:'Não foi possível processar. Confira a instalação do SQL e as configurações do GA4 na Vercel.'}}
}
export async function testAnalytics(){
 await adminDatabase()
 const id=process.env.SERENITY_GA4_MEASUREMENT_ID || GA4_MEASUREMENT_ID,secret=process.env.SERENITY_GA4_API_SECRET?.trim()
 if(process.env.VERCEL_ENV!=='production' || !secret || !/^[A-Za-z0-9_-]{10,200}$/.test(secret) || !/^G-[A-Z0-9]{4,20}$/.test(id))return {message:'Configure a chave secreta na Vercel de produção.'}
 try{
  const response=await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(secret)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:'999999999.'+Math.floor(Date.now()/1000),events:[{name:'serenity_connection_test',params:{session_id:Math.floor(Date.now()/1000),engagement_time_msec:1,debug_mode:1}}]}),redirect:'error',signal:AbortSignal.timeout(5000),cache:'no-store'})
  return {message:response.ok?'Teste enviado. Confira serenity_connection_test no Tempo real ou DebugView do GA4. Esse teste não registra uma compra.':'O endpoint recusou o teste. Confira a chave e a propriedade.'}
 }catch{return {message:'Não foi possível confirmar o envio do teste.'}}
}
