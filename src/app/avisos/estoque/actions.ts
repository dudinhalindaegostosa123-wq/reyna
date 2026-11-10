'use server'
import {headers} from 'next/headers'
import {createHmac} from 'node:crypto'
import {paymentDatabase} from '@/lib/payment-processing-server'
import {emailEnabled,emailConfigured} from '@/lib/order-email-server'
export async function subscribeRestock(form:FormData):Promise<{error?:string;success?:string}>{
 const success='Pedido de aviso registrado. Enviaremos um único e-mail quando a peça ou variação escolhida voltar ao estoque. O aviso vale por 90 dias e não reserva estoque.'
 if(form.get('website'))return {success}
 const slug=String(form.get('slug') || ''),variant=String(form.get('variant') || ''),email=String(form.get('email') || '').trim().toLowerCase()
 if(!/^[a-zA-Z0-9_-]{1,180}$/.test(slug) || !/^[a-zA-Z0-9-]{0,80}$/.test(variant) || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email) || form.get('consent')!=='on')return {error:'Confira seu e-mail e autorize o aviso de reposição.'}
 const secret=process.env.CRON_SECRET?.trim() || ''
 if(!emailEnabled() || !emailConfigured() || secret.length<32)return {error:'Os avisos por e-mail ainda não estão disponíveis. Tente novamente mais tarde.'}
 const ip=process.env.VERCEL==='1'?(headers().get('x-forwarded-for') || '').split(',')[0].trim():process.env.NODE_ENV==='development'?'127.0.0.1':''
 if(!ip)return {error:'Não foi possível registrar agora. Tente novamente mais tarde.'}
 try{
  const {error}=await paymentDatabase().rpc('serenity_restock_subscribe_v1',{p_slug:slug,p_variant:variant,p_email:email,p_key:createHmac('sha256',secret).update('restock:'+ip).digest('hex')})
  if(error)return {error:error.message.includes('RESTOCK_AVAILABLE')?'A peça já está disponível. Atualize a página para conferir.':'Não foi possível registrar agora. Tente novamente mais tarde.'}
  return {success}
 }catch{return {error:'Não foi possível registrar agora. Tente novamente mais tarde.'}}
}
