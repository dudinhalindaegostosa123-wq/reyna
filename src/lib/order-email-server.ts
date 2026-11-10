import 'server-only'
import nodemailer from 'nodemailer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { orderEmail, type EmailJob } from './email-template'

export function emailEnabled() {
  return process.env.VERCEL_ENV === 'production' && process.env.SERENITY_EMAIL_ENABLED === 'true'
}
export function emailConfigured() {
  return Boolean(process.env.SMTP_USER?.trim() === 'contato@serenitypiercings.com.br' && process.env.SMTP_PASSWORD)
}
function transport() {
  if (!emailConfigured()) throw new Error('EMAIL_CONFIGURATION')
  return nodemailer.createTransport({
    host: 'smtp.hostinger.com', port: 465, secure: true,
    auth: { user: process.env.SMTP_USER!.trim(), pass: process.env.SMTP_PASSWORD! },
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 8000,
    tls: { minVersion: 'TLSv1.2' },
    disableFileAccess: true, disableUrlAccess: true,
  })
}

// Falhas comprovadamente anteriores à aceitação podem ser tentadas novamente.
// Desconexão após DATA é ambígua: não reenviar automaticamente.
export function emailFailure(error: unknown): { result: 'retry' | 'review'; code: string } {
  const failure = error as { code?: string; command?: string; responseCode?: number; message?:string }
  if (failure?.message?.startsWith('GUEST_')) return {result:'retry',code:'EMAIL_TRACKING_LINK'}
  if (failure?.code === 'EAUTH') return { result: 'retry', code: 'EMAIL_AUTH' }
  if (failure?.command === 'CONN' || failure?.code === 'EDNS') return { result: 'retry', code: 'EMAIL_CONNECTION' }
  if (typeof failure?.responseCode === 'number' && failure.responseCode >= 400 && failure.responseCode < 600) return { result: 'retry', code: 'EMAIL_REJECTED' }
  return { result: 'review', code: 'EMAIL_DELIVERY_UNCERTAIN' }
}

export async function drainOrderEmails(db: SupabaseClient, orderId?: string, limit = 1) {
  if (!emailEnabled() || !emailConfigured()) return { sent: 0, failed: 0, skipped: true }
  const smtp = transport()
  let sent = 0, failed = 0
  const started = Date.now()
  for (let index = 0; index < Math.min(limit, 10) && Date.now() - started < 18000; index++) {
    const claimed = await db.rpc('serenity_email_claim_v1', { p_order: orderId || null })
    if (claimed.error) { console.error('[order-email]', { code: 'EMAIL_QUEUE_READ' }); return { sent, failed: failed + 1, skipped: false } }
    const job = claimed.data?.[0] as EmailJob | undefined
    if (!job) break
    let outcome: { result: 'sent' | 'retry' | 'review'; code: string | null } = { result: 'sent', code: null }
    try {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.recipient) || /[\r\n]/.test(job.recipient)) throw new Error('EMAIL_RECIPIENT')
      let trackingLink: string | undefined
      if (job.payload.guest_checkout) {
        const {guestEmailLink} = await import('./guest-tracking-server')
        trackingLink = await guestEmailLink(db,job.checkout_id || job.order_id || '')
      }
      const message = orderEmail(job,trackingLink)
      await smtp.sendMail({
        from: { name: 'Serenity Piercings', address: 'contato@serenitypiercings.com.br' },
        replyTo: 'contato@serenitypiercings.com.br', to: job.recipient,
        messageId: `<serenity-${job.id}@serenitypiercings.com.br>`, ...message,
      })
      sent++
    } catch (error) {
      outcome = emailFailure(error); failed++
      console.error('[order-email]', { code: outcome.code })
    }
    const finished = await db.rpc('serenity_email_finish_v1', { p_id: job.id, p_lease: job.lease_id, p_result: outcome.result, p_code: outcome.code })
    if (finished.error || finished.data !== true) {
      // SMTP pode ter aceitado; a lease expirada vai para conferência, sem repetição cega.
      console.error('[order-email]', { code: 'EMAIL_QUEUE_FINISH' }); failed++; break
    }
  }
  return { sent, failed, skipped: false }
}

export async function safeDrainOrderEmails(db: SupabaseClient, orderId?: string) {
  try { return await drainOrderEmails(db, orderId, 2) }
  catch { console.error('[order-email]', { code: 'EMAIL_WORKER_FAILED' }); return { sent: 0, failed: 1, skipped: false } }
}

export async function sendEmailConfigurationTest() {
  if (!emailEnabled()) throw new Error('EMAIL_DISABLED')
  // Destino fixo: o teste nunca permite usar o painel como relay arbitrário.
  await transport().sendMail({ from: { name: 'Serenity Piercings', address: 'contato@serenitypiercings.com.br' }, to: 'contato@serenitypiercings.com.br',
    subject: 'Teste de envio · Serenity Piercings', text: 'A conexão SMTP da Serenity foi validada. Este é um teste de configuração, não um aviso de pedido.' })
}

export async function sendRestockEmail(recipient:string,id:string,message:{subject:string;text:string;html:string}){
 if(!emailEnabled())throw Error('EMAIL_DISABLED')
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || /[\r\n]/.test(recipient))throw Error('EMAIL_RECIPIENT')
 await transport().sendMail({from:{name:'Serenity Piercings',address:'contato@serenitypiercings.com.br'},replyTo:'contato@serenitypiercings.com.br',to:recipient,messageId:`<serenity-restock-${id}@serenitypiercings.com.br>`,...message})
}
