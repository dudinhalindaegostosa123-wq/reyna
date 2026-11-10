import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { saleUuid } from './admin-sales'
import { remoteCart } from './label-cart-server'
import { inspectShipment, labelShipmentRequest } from './label-purchase-server'

/** Somente consulta etiquetas já vinculadas; não prepara, compra ou gera etiquetas. */
export async function syncLegacyShipments(db: SupabaseClient, contact: string) {
  const claimed = await db.rpc('serenity_legacy_tracking_claim_v1', { p_limit: 2 })
  if (claimed.error) {
    if (['PGRST202', '42883'].includes(claimed.error.code)) return { installed: false, synced: 0, failed: 0 }
    throw new Error('TRACKING_DATABASE')
  }
  const jobs: unknown = claimed.data
  if (!Array.isArray(jobs) || jobs.length > 2 || jobs.some(job => !job || ![job.order_id, job.remote_id, job.operation, job.lease_id].every(saleUuid))) throw new Error('TRACKING_DATABASE')
  const results = await Promise.all(jobs.map(async job => {
    const finish = async (values: Record<string, unknown>) => {
      const result = await db.rpc('serenity_legacy_tracking_finish_v1', { p_order: job.order_id, p_remote: job.remote_id, p_operation: job.operation, p_lease: job.lease_id, ...values })
      if (result.error || typeof result.data !== 'boolean') throw new Error('TRACKING_DATABASE')
      return result.data
    }
    try {
      const found = await db.from('serenity_legacy_label_jobs_v1').select('state,remote_id,operation,selected,context').eq('order_id', job.order_id).single()
      if (found.error) throw new Error('TRACKING_DATABASE')
      if (!found.data || found.data.state !== 'prepared' || found.data.remote_id !== job.remote_id || found.data.operation !== job.operation) throw new Error('TRACKING_LINK')
      const response = await labelShipmentRequest('info', job.remote_id, contact)
      // Confere UUID, serviço e identificação da preparação, ou destinatário do vínculo antigo.
      const remote = inspectShipment(response, found.data)
      const value = remoteCart(response), candidate = value.tracking ?? value.tracking_code
      const tracking = typeof candidate === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(candidate.trim()) ? candidate.trim() : null
      return await finish({ p_status: remote.status, p_tracking: tracking, p_error: null }) ? 'synced' : 'skipped'
    } catch {
      console.error('[legacy-tracking]', { code: 'LEGACY_TRACKING_SYNC_FAILED' })
      try { await finish({ p_error: 'LEGACY_TRACKING_SYNC_FAILED' }) } catch { /* Lease expira para permitir uma nova consulta, sem comprar etiqueta. */ }
      return 'failed'
    }
  }))
  return { installed: true, synced: results.filter(result => result === 'synced').length, failed: results.filter(result => result === 'failed').length }
}
