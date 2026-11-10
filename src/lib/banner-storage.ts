import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'serenity-banners'
export const BANNER_STORAGE_ERROR = 'Não foi possível acessar as imagens. Confira SUPABASE_SECRET_KEY na Vercel e as permissões do Storage no Supabase novo.'

/** Called only after adminDatabase has authorized the administrator. */
export async function uploadBannerImage(db: SupabaseClient, path: string, bytes: Buffer): Promise<void> {
  const options = { contentType: 'image/webp', upsert: false, cacheControl: '31536000' }
  const uploaded = await db.storage.from(BUCKET).upload(path, bytes, options)
  if (!uploaded.error) return

  // New projects may have the banner table without its Storage bucket.
  // Never change existing buckets or relax object write policies.
  const bucket = await db.storage.getBucket(BUCKET)
  if (bucket.error && (String(bucket.error.statusCode) === '404' || /^bucket not found\.?$/i.test(bucket.error.message))) {
    const created = await db.storage.createBucket(BUCKET, {
      public: true,
      allowedMimeTypes: ['image/webp'],
      fileSizeLimit: 3 * 1024 * 1024,
    })
    if (created.error && !['409', 'Duplicate'].includes(String(created.error.statusCode))) {
      throw new Error(BANNER_STORAGE_ERROR)
    }
    const retry = await db.storage.from(BUCKET).upload(path, bytes, options)
    if (!retry.error) return
  }
  throw new Error(BANNER_STORAGE_ERROR)
}
