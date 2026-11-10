import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mercadoPagoConfig } from './mercado-pago-server'

const TOKEN = /^[a-f0-9]{64}$/
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const COOKIE = 'serenity-order-tracking'
export function guestToken(checkoutId: string) {
  const secret = process.env.SERENITY_GUEST_TRACKING_SECRET?.trim() || ''
  if (secret.length < 32 || !UUID.test(checkoutId)) throw new Error('GUEST_TRACKING_CONFIGURATION')
  return createHmac('sha256',secret).update('serenity-guest-tracking-v1:'+checkoutId).digest('hex')
}
export function guestTokenHash(token: string) {
  if (!TOKEN.test(token)) throw new Error('GUEST_LINK_UNAVAILABLE')
  return createHash('sha256').update(token).digest('hex')
}
export function writeGuestCookie(token: string) {
  if (!TOKEN.test(token)) throw new Error('GUEST_LINK_UNAVAILABLE')
  cookies().set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/acompanhar',maxAge:60*60*24*30})
}
export async function assertGuestCheckoutReady(db:SupabaseClient,id:string) {
  guestToken(id)
  const ready=await db.rpc('serenity_guest_checkout_ready_v1')
  if(ready.error || ready.data?.version!==1 || ready.data?.ready!==true) throw new Error('GUEST_CHECKOUT_MIGRATION_REQUIRED')
}
export async function registerGuestCheckout(db: SupabaseClient, id: string, accessHash: string) {
  const token = guestToken(id)
  const registered = await db.rpc('serenity_guest_register_v1',{p_checkout:id,p_access_hash:accessHash,p_token_hash:guestTokenHash(token)})
  if (registered.error || !Number.isSafeInteger(Number(registered.data)) || Number(registered.data)<1) throw new Error('GUEST_CHECKOUT_MIGRATION_REQUIRED')
  writeGuestCookie(token)
  // The existing scheduled worker sends the queued receipt. Payment must not
  // wait for SMTP or require the customer to leave this screen.
}
export interface GuestTracking {
  number:number; status:string; total:number; createdAt:string; environment:'test'|'production'; carrier:string|null; trackingCode:string|null
}
export async function readGuestTracking(db: SupabaseClient, token?: string): Promise<GuestTracking|null> {
  const raw = token ?? cookies().get(COOKIE)?.value
  if (!raw || !TOKEN.test(raw)) return null
  const response = await db.rpc('serenity_guest_tracking_read_v1',{p_hash:guestTokenHash(raw),p_environment:mercadoPagoConfig().environment})
  if (response.error) throw new Error('GUEST_TRACKING_UNAVAILABLE')
  const value=response.data
  if (!value) return null
  if (!Number.isSafeInteger(Number(value.number)) || Number(value.number)<1 || !Number.isFinite(Number(value.total)) || Number(value.total)<0 || typeof value.created_at!=='string' || !Number.isFinite(Date.parse(value.created_at)) || !['test','production'].includes(value.environment) || !['paid','pending','review','cancelled','refunded','failed'].includes(value.status)) throw new Error('GUEST_TRACKING_UNAVAILABLE')
  return {number:Number(value.number),status:value.status,total:Number(value.total),createdAt:value.created_at,environment:value.environment,
    carrier:typeof value.carrier==='string'?value.carrier:null,trackingCode:typeof value.tracking_code==='string'?value.tracking_code:null}
}
export async function guestEmailLink(db:SupabaseClient, id:string):Promise<string> {
  const saved=await db.from('serenity_guest_access_v1').select('token_hash,expires_at,revoked').eq('checkout_id',id).single()
  if(saved.error || !saved.data || saved.data.revoked || Date.parse(saved.data.expires_at)<=Date.now()) throw new Error('GUEST_EMAIL_LINK_UNAVAILABLE')
  const token=guestToken(id),hash=guestTokenHash(token)
  if(typeof saved.data.token_hash!=='string' || !TOKEN.test(saved.data.token_hash) || !timingSafeEqual(Buffer.from(hash),Buffer.from(saved.data.token_hash))) throw new Error('GUEST_EMAIL_LINK_UNAVAILABLE')
  return 'https://serenitypiercings.com.br/acompanhar#'+token
}
