import 'server-only'
import { readWholesaleAccess } from './wholesale-server'

export async function collectionEnabled() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, '')
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) return false
  const response = await fetch(`${url}/rest/v1/serenity_collection_settings?select=enabled&singleton=eq.true`, {
    headers: { apikey: key }, cache: 'no-store',
  })
  if (!response.ok) return false
  const rows = await response.json()
  return rows[0]?.enabled === true
}

export async function showCollectionCampaign() {
  const [enabled, access] = await Promise.all([collectionEnabled(), readWholesaleAccess()])
  return enabled && access.rules?.active !== true
}
