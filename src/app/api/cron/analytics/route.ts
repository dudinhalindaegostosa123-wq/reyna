import {timingSafeEqual} from 'node:crypto'
import {paymentDatabase} from '@/lib/payment-processing-server'
import {drainAnalytics} from '@/lib/analytics-server'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=60
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET?.trim() || '',expected=Buffer.from('Bearer '+secret),supplied=Buffer.from(request.headers.get('authorization') || '')
 if(secret.length<32 || expected.length!==supplied.length || !timingSafeEqual(expected,supplied))return Response.json({ok:false},{status:401})
 try{const result=await drainAnalytics(paymentDatabase());return Response.json({ok:result.failed===0,...result},{status:result.failed?503:200,headers:{'Cache-Control':'no-store'}})}catch{console.error('[analytics]',{code:'ANALYTICS_WORKER_FAILED'});return Response.json({ok:false},{status:503,headers:{'Cache-Control':'no-store'}})}
}
