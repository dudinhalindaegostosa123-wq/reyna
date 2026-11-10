import { timingSafeEqual } from 'node:crypto'
import { paymentDatabase } from '@/lib/payment-processing-server'
import {drainRestockEmails} from '@/lib/restock-server'
import { drainOrderEmails } from '@/lib/order-email-server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() || ''
  const supplied = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ ok: false }, { status: 401 })
  try {
    const db=paymentDatabase()
    const results=await Promise.allSettled([drainOrderEmails(db,undefined,10),drainRestockEmails(db,5)])
    const order=results[0].status==='fulfilled'?results[0].value:{sent:0,failed:1,skipped:false}
    const restock=results[1].status==='fulfilled'?results[1].value:{sent:0,failed:1,skipped:false}
    const failed=order.failed+restock.failed
    return Response.json({ok:failed===0,...order,restock},{status:failed?503:200,headers:{'Cache-Control':'no-store'}})
  } catch { return Response.json({ ok: false }, { status: 503 }) }
}
