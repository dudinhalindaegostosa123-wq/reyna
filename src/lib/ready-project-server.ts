import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { getStoreProduct } from './catalog-server'
import type { ReadyProject, ProjectPiece } from './ready-project'

export async function publishedProjects() {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) throw new Error('PROJECT_CONFIGURATION')
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) } })
  const { data, error } = await db.from('serenity_ready_projects').select('*')
    .eq('enabled', true).order('position').order('id').limit(100)
  if (error) {
    // The existing simulator stays available while the migration is installed.
    if (['42P01', 'PGRST205'].includes(error.code)) return []
    throw new Error('PROJECT_READ')
  }
  return (data || []) as ReadyProject[]
}

export async function projectPieces(project: ReadyProject): Promise<{ pieces: ProjectPiece[]; complete: boolean }> {
  const results = await Promise.all(project.items.map(async line => {
    const result = await getStoreProduct(line.slug)
    return result ? { product: result.product, quantity: line.quantity, variationId: line.variationId } : null
  }))
  return { pieces: results.filter((piece): piece is ProjectPiece => piece !== null),
    complete: results.length > 0 && results.every(Boolean) }
}
