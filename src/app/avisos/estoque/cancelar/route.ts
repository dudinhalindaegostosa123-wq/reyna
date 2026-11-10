import {paymentDatabase} from '@/lib/payment-processing-server'
export const dynamic='force-dynamic'
export async function GET(request:Request){
 const token=new URL(request.url).searchParams.get('token') || ''
 if(!/^[a-f0-9]{64}$/.test(token))return new Response('Link inválido.',{status:400,headers:{'Cache-Control':'no-store'}})
 try{
  const {error}=await paymentDatabase().rpc('serenity_restock_cancel_v1',{p_token:token})
  if(error)throw Error('RESTOCK_CANCEL')
  return new Response('Aviso de reposição cancelado.',{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})
 }catch{return new Response('Não foi possível cancelar agora. Tente novamente mais tarde.',{status:503,headers:{'Cache-Control':'no-store'}})}
}
