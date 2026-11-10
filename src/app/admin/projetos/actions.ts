'use server'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { revalidatePath } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { getStoreProduct } from '@/lib/catalog-server'
import { projectSelection } from '@/lib/ready-project'
import type { ProjectLine } from '@/lib/ready-project'

export async function searchProjectProducts(query: string) {
  const { db } = await adminDatabase()
  const term = query.trim().replace(/[^a-zA-ZÀ-ÿ0-9\s-]/g, '').slice(0, 80)
  if (term.length < 2) return { error: 'Digite pelo menos duas letras.', products: [] }
  const { data, error } = await db.from('products').select('id,slug,name,product_type')
    .ilike('name', `%${term}%`).order('name').limit(12)
  if (error) return { error: 'Não foi possível buscar as joias.', products: [] }
  const { data: variants, error: variantError } = await db.from('product_variants')
    .select('id,woo_id,product_id,name,attributes').in('product_id', (data || []).map(row => row.id)).eq('enabled', true).order('name')
  if (variantError) return { error: 'Não foi possível carregar as variações.', products: [] }
  return { error: '', products: (data || []).map(row => ({ ...row,
    variations: (variants || []).filter(variant => variant.product_id === row.id).map(variant => ({ id: variant.woo_id === null ? variant.id : String(variant.woo_id), name: Object.entries(variant.attributes || {}).map(([key, value]) => `${key} ${value}`).join(' / ') || variant.name })) })) }
}

export async function saveReadyProject(form: FormData): Promise<{ error: string; id?: string }> {
  const { db } = await adminDatabase()
  const id = String(form.get('id') || '')
  const version = Number(form.get('version'))
  const title = String(form.get('title') || '').trim()
  const description = String(form.get('description') || '').trim()
  const position = Number(form.get('position'))
  const enabled = form.get('enabled') === 'on'
  if (!/^[a-f0-9-]{36}$/i.test(id) || !Number.isSafeInteger(version) || version < 0 ||
    !title || title.length > 120 || description.length > 2000 || !Number.isInteger(position) || position < 0 || position > 10000) {
    return { error: 'Confira o nome, a descrição e a ordem do projeto.' }
  }
  let items: ProjectLine[]
  try {
    items = JSON.parse(String(form.get('items') || '[]'))
    if (!Array.isArray(items) || items.length > 30 || items.some(item => !item ||
      typeof item.slug !== 'string' || !/^[a-zA-Z0-9_-]{1,180}$/.test(item.slug) ||
      typeof item.variationId !== 'string' || (item.variationId !== '' && !/^(?:[0-9]{1,20}|[a-f0-9-]{36})$/i.test(item.variationId)) ||
      !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100)) throw new Error()
    items = items.map(({ slug, variationId, quantity }) => ({ slug, variationId, quantity }))
    if (new Set(items.map(item => `${item.slug}:${item.variationId}`)).size !== items.length) throw new Error()
  } catch { return { error: 'Confira as peças e quantidades do projeto. Não repita a mesma variação em duas linhas.' } }
  if (enabled && !items.length) return { error: 'Adicione as joias antes de publicar.' }
  // A public project must resolve to the exact active catalog selections.
  for (const line of items) {
    const result = await getStoreProduct(line.slug)
    if (!result || !projectSelection({ product: result.product, ...line })) {
      return { error: `A joia ${line.slug} ou sua variação não está disponível no catálogo. Confira a seleção.` }
    }
  }
  const previous = await db.from('serenity_ready_projects').select('id,version,image_path').eq('id', id).maybeSingle()
  if (previous.error) return { error: 'Não foi possível carregar o projeto. Confira se o SQL de projetos foi instalado.' }
  if ((previous.data?.version || 0) !== version) return { error: 'Este projeto mudou em outra janela. Reabra antes de salvar.' }
  let image_path = previous.data?.image_path || ''
  let uploaded = ''
  const file = form.get('image')
  try {
    if (file instanceof File && file.size > 0) {
      if (file.size > 3 * 1024 * 1024) return { error: 'Envie uma foto de até 3 MB.' }
      const input = Buffer.from(await file.arrayBuffer())
      const info = await sharp(input, { limitInputPixels: 40000000 }).metadata()
      if (!['jpeg', 'png', 'webp'].includes(info.format || '') || (info.pages || 1) > 1) return { error: 'Use uma foto JPG, PNG ou WebP estática.' }
      const bytes = await sharp(input, { limitInputPixels: 40000000 }).rotate().resize({ width: 1600, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer()
      uploaded = `projetos/${id}/${randomUUID()}.webp`
      const upload = await db.storage.from('produtos').upload(uploaded, bytes, { contentType: 'image/webp', upsert: false })
      if (upload.error) return { error: 'Não foi possível enviar a foto.' }
      image_path = uploaded
    }
    if (enabled && !image_path) return { error: 'Envie uma foto da composição antes de publicar.' }
    const row = { title, description, position, enabled, items, image_path, version: version + 1, updated_at: new Date().toISOString() }
    const result = previous.data
      ? await db.from('serenity_ready_projects').update(row).eq('id', id).eq('version', version).select('id').maybeSingle()
      : await db.from('serenity_ready_projects').insert({ ...row, id }).select('id').single()
    if (result.error || !result.data) {
      if (uploaded && !result.error) await db.storage.from('produtos').remove([uploaded])
      return { error: 'Não foi possível salvar. Reabra o projeto para conferir se houve alteração em outra janela.' }
    }
  } catch {
    return { error: 'Não foi possível salvar a foto ou o projeto. Confira a lista antes de tentar novamente.' }
  }
  revalidatePath('/admin/projetos')
  revalidatePath('/projeto-auricular')
  revalidatePath('/projeto-auricular/prontos')
  return { error: '', id }
}
