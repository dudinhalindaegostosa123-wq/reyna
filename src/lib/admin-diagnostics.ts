export function adminKeyProblem(key: string | undefined, projectUrl: string | undefined): string | null {
  if (!key?.trim() || !projectUrl?.trim()) return 'missing'
  const value = key.trim()
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(value)) return null
  if (value.startsWith('sb_publishable_')) return 'public-key'
  try {
    const parts = value.split('.')
    if (parts.length !== 3 || parts.some(part => !part)) return 'invalid-key'
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    if (payload.role !== 'service_role') return 'public-key'
    const hostname = new URL(projectUrl.trim()).hostname
    if (hostname.endsWith('.supabase.co') && payload.ref && payload.ref !== hostname.split('.')[0]) return 'wrong-project'
    return null
  } catch {
    return 'invalid-key'
  }
}

export function adminErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && error.message === 'Invalid API key') return 'API_KEY_INVALID'
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  return /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(code) ? code : 'UNKNOWN'
}

export function adminErrorField(error: unknown): string | null {
  if (adminErrorCode(error) !== '42703' || !error || typeof error !== 'object' || !('message' in error)) return null
  const match = String(error.message).match(/\bcolumn\s+((?:"?[A-Za-z_][A-Za-z0-9_]*"?)(?:\.(?:"?[A-Za-z_][A-Za-z0-9_]*"?))*)\s+does not exist\b/i)
  return match ? match[1].replace(/"/g, '').slice(0, 128) : null
}
