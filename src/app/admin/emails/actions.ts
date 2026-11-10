'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminDatabase } from '@/lib/admin-auth'
import { safeDrainOrderEmails, sendEmailConfigurationTest } from '@/lib/order-email-server'
export async function processPendingEmails() {
  const { db } = await adminDatabase()
  await safeDrainOrderEmails(db)
  revalidatePath('/admin/emails')
}
export async function testEmailConfiguration() {
  await adminDatabase()
  let status = 'enviado'
  try { await sendEmailConfigurationTest() } catch { status = 'falha' }
  redirect(`/admin/emails?teste=${status}`)
}

export async function refreshShipmentNotifications() {
  await adminDatabase()
  let status = 'falha'
  let reference = ''
  try {
    const secret = process.env.CRON_SECRET?.trim() || ''
    if (secret.length < 32) { reference = 'CRON_CONFIGURATION'; throw new Error('CRON_CONFIGURATION') }
    const { GET } = await import('@/app/api/cron/rastreamento/route')
    const response = await GET(new Request((process.env.NEXT_PUBLIC_SITE_URL || 'https://reyna-three.vercel.app') + '/api/cron/rastreamento', { headers: { Authorization: `Bearer ${secret}` } }))
    const result = await response.json()
    if (typeof result.error === 'string' && /^[A-Z_]{3,60}$/.test(result.error)) reference = result.error
    status = response.ok && result.skipped !== true ? result.legacy?.installed === false ? 'instalacao-pendente' : 'atualizado' : 'falha'
  } catch { /* Mostra somente o resultado genérico, sem expor tokens ou dados pessoais. */ }
  revalidatePath('/admin/emails')
  redirect(`/admin/emails?rastreio=${status}${reference ? `&rastreio_ref=${reference}` : ''}`)
}
