import 'server-only'

export async function pixDiscountEnabled() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, '')
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) return false
  const response = await fetch(`${url}/rest/v1/serenity_pix_discount_settings_v4?select=enabled&singleton=eq.true`, { headers: { apikey: key }, cache: 'no-store' })
  if (!response.ok) return false
  const rows = await response.json()
  return rows[0]?.enabled === true
}
