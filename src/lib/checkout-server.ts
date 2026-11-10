import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { headers } from 'next/headers'

export function checkoutHash(input:string) {
  const key=process.env.SUPABASE_SECRET_KEY?.trim()
  if(!key)throw new Error('CHECKOUT_CONFIGURATION')
  return createHmac('sha256',key).update(input).digest('hex')
}

export async function checkoutDatabase(kind:'review'|'submit') {
  const url=process.env.SUPABASE_URL?.trim(),key=process.env.SUPABASE_SECRET_KEY?.trim()
  if(!url||!key)throw new Error('CHECKOUT_CONFIGURATION')
  const ip=process.env.VERCEL==='1' ? (headers().get('x-forwarded-for') || '').split(',')[0].trim() : process.env.NODE_ENV==='development' ? '127.0.0.1' : ''
  if(!isIP(ip))throw new Error('CHECKOUT_CONFIGURATION')
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store'})}})
  const {data,error}=await db.rpc('serenity_checkout_limit',{p_key:checkoutHash(`${kind}:${ip}`),p_max:kind==='review' ? 60 : 10})
  if(error) {
    const failure = new Error(/fetch failed|ETIMEDOUT|UND_ERR_SOCKET/.test(error.message || '') ? 'CHECKOUT_DATABASE_CONNECTION' : 'CHECKOUT_UNAVAILABLE') as Error & {code?:string}
    if(typeof error.code==='string' && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(error.code)) failure.code=error.code
    throw failure
  }
  if(data!==true)throw new Error('CHECKOUT_LIMIT')
  return db
}

export function checkoutError(error:unknown):string {
  const message=error && typeof error==='object' && 'message' in error ? String(error.message) : ''
  if(message.includes('UNIT_SALE_REQUIRED'))return 'Essa joia é vendida por unidade. Atualize a peça no carrinho; para duas peças, escolha quantidade 2.'
  if(message.includes('CHECKOUT_LIMIT'))return 'Muitas tentativas em pouco tempo. Aguarde e tente novamente.'
  if(message.includes('PRICE_CHANGED'))return 'O valor das peças mudou. Confira os valores novamente antes de enviar.'
  if(message.includes('REQUEST_CHANGED'))return 'Este envio já foi registrado com outros dados. Confira o pedido anterior antes de tentar novamente.'
  if(message.includes('INVALID_STEM'))return 'A haste precisa corresponder à variação da joia. Confira a seleção na página do produto.'
  if(/TOP_STEM_REQUIRED/.test(message))return 'Escolha a haste de 4, 6, 8 ou 10 mm dos labrets no carrinho antes de continuar.'
  if(/STOCK_RESERVED|STOCK_UNAVAILABLE|STOCK_CHANGED|PRODUCT_UNAVAILABLE|VARIANT_UNAVAILABLE|PRICE_UNAVAILABLE|INVALID_ANODIZATION/.test(message))return 'Uma peça, variação ou cor mudou de disponibilidade. Volte ao carrinho e confira as opções nas páginas dos produtos.'
  return 'Não foi possível enviar agora. Tente novamente. Se persistir, fale com a equipe Serenity.'
}

// Serenity: estoque e reservas v1
