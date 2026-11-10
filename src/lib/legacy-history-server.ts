import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface LegacyProfile { eligible: boolean; name?: string; phone?: string; needs_profile?: boolean }
export async function legacyProfile(auth: SupabaseClient): Promise<LegacyProfile> {
  const result = await auth.rpc('serenity_legacy_account_context_v1')
  if (result.error) return { eligible: false }
  return result.data?.eligible === true ? result.data as LegacyProfile : { eligible: false }
}
export const legacyStatus: Record<string,string> = {
  'wc-completed': 'Concluído no site antigo', 'wc-processing': 'Em processamento no site antigo',
  'wc-refunded': 'Reembolsado no site antigo', 'wc-pending': 'Aguardava pagamento no site antigo',
  'wc-failed': 'Pagamento não concluído no site antigo', 'wc-cancelled': 'Cancelado no site antigo',
  'wc-on-hold': 'Em espera no site antigo',
}
