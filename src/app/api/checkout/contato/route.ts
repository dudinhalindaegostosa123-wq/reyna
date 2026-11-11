import {NextRequest,NextResponse} from 'next/server'
import {checkoutContact} from '@/lib/checkout-contact'
import {checkoutDatabase,checkoutHash} from '@/lib/checkout-server'
export const runtime='nodejs'
export async function POST(request:NextRequest) {
 const expected=new URL(request.url)
 expected.host=request.headers.get('host') || expected.host
 if(request.headers.get('origin')!==expected.origin)return NextResponse.json({ok:false},{status:403})
 try{
  if(Number(request.headers.get('content-length') || 0)>32000)return NextResponse.json({ok:false},{status:413})
  const reader=request.body?.getReader()
  if(!reader)return NextResponse.json({ok:false},{status:400})
  const parts:Buffer[]=[]
  let bytes=0
  while(true){
   const chunk=await reader.read()
   if(chunk.done)break
   bytes+=chunk.value.byteLength
   if(bytes>32000){await reader.cancel();return NextResponse.json({ok:false},{status:413})}
   parts.push(Buffer.from(chunk.value))
  }
  const raw=Buffer.concat(parts).toString('utf8')
  const input=checkoutContact(JSON.parse(raw))
  if(!input)return NextResponse.json({ok:false},{status:400})
  const db=await checkoutDatabase('review')
  const {error}=await db.rpc('serenity_checkout_contact_save_v1',{
   p_phone:input.phone || null,p_id:input.id,p_token_hash:checkoutHash('checkout-contact:'+input.token),p_name:input.name,p_email:input.email,
   p_items:input.items,p_estimated_cents:input.estimatedCents,p_environment:(process.env.ASAAS_ENVIRONMENT || process.env.MERCADO_PAGO_ENVIRONMENT)==='production'?'production':'test',
  })
  return NextResponse.json({ok:!error},{status:error?503:200,headers:{'Cache-Control':'no-store'}})
 }catch{return NextResponse.json({ok:false},{status:503})}
}
