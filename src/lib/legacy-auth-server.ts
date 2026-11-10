import 'server-only'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export async function prepareLegacyRecovery(email: string) {
  if (process.env.SERENITY_LEGACY_ACTIVATION_ENABLED !== 'true' || process.env.VERCEL_ENV !== 'production') return
  const url = process.env.SUPABASE_URL?.trim(), key = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !key) throw new Error('LEGACY_CONFIGURATION')
  const db = createClient(url,key,{ auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store',signal:AbortSignal.timeout(8000)})} })
  const found = await db.from('serenity_legacy_customers_v1').select('old_id').eq('email',email).maybeSingle()
  if (found.error) throw new Error('LEGACY_DATABASE')
  if (!found.data) return
  // Não convida em massa, não confirma e-mail e nunca altera uma conta existente.
  const created = await db.auth.admin.createUser({ email, password:randomBytes(48).toString('base64url'), email_confirm:false })
  if (created.error && !['email_exists','user_already_exists'].includes(created.error.code || '')) throw new Error('LEGACY_AUTH')
}
