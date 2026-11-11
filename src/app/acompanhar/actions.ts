'use server'
import { checkoutDatabase } from '@/lib/checkout-server'
import { readGuestTracking, writeGuestCookie, type GuestTracking } from '@/lib/guest-tracking-server'
export async function openGuestTracking(token?: string):Promise<{error:string;tracking?:GuestTracking}> {
  try {
    if(token!==undefined && (typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token))) return {error:'Link de acompanhamento inválido ou indisponível.'}
    const db=await checkoutDatabase('review')
    const tracking=await readGuestTracking(db,token)
    if(!tracking) return {error:'Link de acompanhamento inválido ou indisponível. Use seu link privado de acompanhamento ou fale com a Lunarity.'}
    if(token) writeGuestCookie(token)
    return {error:'',tracking}
  } catch { return {error:'Não foi possível consultar agora. Tente novamente em instantes.'} }
}
