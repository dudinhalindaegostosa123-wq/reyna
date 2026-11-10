import { buildPayload } from '@/lib/admin-product-editor'
import type { ProductBundle, EditableProduct } from '@/lib/admin-product-editor'
import { attributes, lines, uuid, youtubeId } from '@/lib/admin-catalog-tools'

export interface EditorPhoto {
  id: string
  variant_id: string | null
  storage_path: string | null
  thumbnail_path?: string | null
  alt_text: string
  media_type: string
  youtube_id?: string | null
}

export interface EditorBundle extends ProductBundle {
  media: EditorPhoto[]
}

export interface EditorResult {
  error: string
  url?: string
}

export function emptyProduct(id: string, name = ''): EditableProduct {
  return {
    id,
    name,
    sku: null,
    regular_price: null,
    sale_price: null,
    stock_quantity: null,
    stock_status: 'outofstock',
    enabled: true,
    product_type: 'simple',
    visibility: 'visible',
    status: 'draft',
    short_description: '',
    description: '',
    material: '',
    categories: [],
    tags: [],
    featured: false,
    sold_individually: false,
    attributes: {},
    commercial: {},
  }
}

export function formText(form: FormData, key: string, max = 300): string {
  const value = form.get(key)

  if (typeof value !== 'string' || value.length > max) {
    throw new Error(`Confira o campo ${key}.`)
  }

  return value.trim()
}

export function editorPayload(bundle: EditorBundle, form: FormData, isNew: boolean) {
  const ids: unknown = JSON.parse(formText(form, 'new_variants', 10000))

  if (!Array.isArray(ids) || ids.length > 100) {
    throw new Error('Adicione até 100 novas variações por salvamento.')
  }

  const newIds = ids.map(uuid)
  const allIds = [...bundle.variants.map(v => String(v.id)), ...newIds]

  if (new Set(allIds).size !== allIds.length) {
    throw new Error('Variações repetidas. Atualize a página.')
  }

  const extended = {
    ...bundle,
    variants: [
      ...bundle.variants,
      ...newIds.map(id => emptyProduct(id)),
    ],
  }

  const payload = buildPayload(extended, form)

  payload.product.material = formText(form, 'p.material', 180)
  payload.product.categories = lines(formText(form, 'p.categories', 16000))
  payload.product.tags = lines(formText(form, 'p.tags', 16000))
  payload.product.featured = form.get('p.featured') === 'on'
  payload.product.sold_individually = form.get('p.sold_individually') === 'on'

  const type = formText(form, 'p.product_type', 30)

  if (isNew && !['simple', 'variable'].includes(type)) {
    throw new Error('Tipo de produto inválido.')
  }

  payload.product.product_type = allIds.length ? 'variable' : type

  if (isNew) {
    const stem = String(payload.product.name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 130) || 'produto'

    payload.product.slug = `${stem}-${uuid(bundle.product.id)}`

    if (
      payload.product.status === 'published' &&
      payload.product.product_type === 'variable' &&
      !allIds.length
    ) {
      throw new Error('Adicione uma variação ou mantenha o produto como rascunho.')
    }
  }

  const variants: Record<string, unknown>[] = payload.variants

  variants.forEach((variant, index) => {
    const row = extended.variants[index]
    const raw = formText(form, `v.${row.id}.attributes`, 20000)
    const pairs = JSON.parse(raw)
    const old = (row.attributes || {}) as Record<string, string>

    const parsed =
      Array.isArray(pairs) &&
      !pairs.length &&
      !newIds.includes(String(row.id))
        ? {}
        : attributes(raw)

    variant.attributes = parsed

    if (
      variant.enabled &&
      Object.keys(parsed).length &&
      variants.slice(0, index).some((other, i) =>
        other.enabled &&
        JSON.stringify(
          Object.entries(
            (other.attributes || {}) as Record<string, string>
          ).sort()
        ) === JSON.stringify(Object.entries(parsed).sort()) &&
        (
          newIds.includes(String(row.id)) ||
          JSON.stringify(old) !== JSON.stringify(parsed) ||
          newIds.includes(String(extended.variants[i].id))
        )
      )
    ) {
      throw new Error('Duas variações estão com a mesma combinação de atributos.')
    }
  })

  const photos: unknown = JSON.parse(formText(form, 'photos', 250000))

  if (!Array.isArray(photos) || photos.length > 250) {
    throw new Error('Use até 250 fotos por produto.')
  }

  const normalized = photos.map((photo: unknown) => {
    if (!photo || typeof photo !== 'object') {
      throw new Error('Foto inválida.')
    }

    const entry = photo as Record<string, unknown>
    const variant = entry.variant_id ? uuid(entry.variant_id) : null

    if (variant && !allIds.includes(variant)) {
      throw new Error('Uma foto está vinculada a uma variação inválida.')
    }

    if (
      typeof entry.alt_text !== 'string' ||
      entry.alt_text.length > 300
    ) {
      throw new Error('Descrição da foto inválida.')
    }

    return {
      id: uuid(entry.id),
      variant_id: variant,
      alt_text: entry.alt_text,
    }
  })

  if (new Set(normalized.map(p => p.id)).size !== normalized.length) {
    throw new Error('Fotos repetidas.')
  }

  const input = formText(form, 'youtube', 1000)
  const video = input ? youtubeId(input) : null
  const original =
    bundle.media.find(m => m.media_type === 'youtube')?.youtube_id || null

  return {
    ...payload,
    variants,
    photos: normalized,
    youtube_id: video,
    video_changed: video !== original,
  }
}
