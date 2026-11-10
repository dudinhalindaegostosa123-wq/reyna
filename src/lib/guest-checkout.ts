import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readWholesaleAccess } from './wholesale-server'

export function guestCheckoutEnabled() {
  return process.env.SERENITY_GUEST_CHECKOUT_ENABLED === 'true'
}
export async function optionalCheckoutAccess(db?: SupabaseClient) {
  try { return await readWholesaleAccess(db) }
  catch (error) {
    const code = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
    if (guestCheckoutEnabled() && ['WHOLESALE_SESSION','WHOLESALE_EMAIL'].includes(code)) return {userId:null,rules:null}
    throw error
  }
}
// The capability cookie is verified before this check. Guest sessions never
// acquire an account just because someone later logs in on the same browser.
export async function assertPaymentOwner(accountId: unknown, db: SupabaseClient) {
  if (accountId === null) return
  if (typeof accountId !== 'string') throw new Error('CHECKOUT_ACCOUNT_MISMATCH')
  const access = await readWholesaleAccess(db)
  if (!access.userId) throw new Error('CHECKOUT_LOGIN_REQUIRED')
  if (accountId !== access.userId) throw new Error('CHECKOUT_ACCOUNT_MISMATCH')
}
