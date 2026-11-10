import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

// O manifesto usa data.id da URL, x-request-id e o timestamp literal recebido.
export function verifyMercadoPagoWebhook(request: Request, secret: string, now = Date.now()) {
  if (secret.length < 16) return null
  const url = new URL(request.url)
  const ids = url.searchParams.getAll('data.id')
  if (ids.length !== 1 || !/^[0-9]{1,40}$/.test(ids[0])) return null
  const requestId = request.headers.get('x-request-id') || ''
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) return null
  const header = request.headers.get('x-signature') || ''
  if (header.length > 512) return null
  const fields = header.split(',').map(part => part.trim().split('='))
  const timestamps = fields.filter(([key]) => key === 'ts')
  const signatures = fields.filter(([key]) => key === 'v1')
  if (timestamps.length !== 1 || signatures.length !== 1) return null
  const ts = timestamps[0][1] || ''
  const digest = signatures[0][1] || ''
  if (!/^\d{10,13}$/.test(ts) || !/^[a-f0-9]{64}$/i.test(digest)) return null
  const millis = ts.length <= 10 ? Number(ts) * 1000 : Number(ts)
  // Reentregas legítimas podem chegar bem depois da emissão. O pagamento
  // será consultado novamente e a aplicação no banco é idempotente.
  if (millis <= 0 || millis > now + 10 * 60 * 1000) return null
  const manifest = `id:${ids[0].toLowerCase()};request-id:${requestId};ts:${ts};`
  const expected = createHmac('sha256', secret).update(manifest).digest()
  if (!timingSafeEqual(expected, Buffer.from(digest, 'hex'))) return null
  return { paymentId: ids[0] }
}

export async function webhookBody(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('PAYMENT_WEBHOOK_BODY_INVALID')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > 16384) throw new Error('PAYMENT_WEBHOOK_BODY_INVALID')
      chunks.push(next.value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('PAYMENT_WEBHOOK_BODY_INVALID')
  }
  return value as Record<string, unknown>
}
