'use server'

import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { redirect } from 'next/navigation'
import { revalidatePath, revalidateTag } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { amount, quantity } from '@/lib/admin-product-editor'
import { attributes, lines, uuid, youtubeId } from '@/lib/admin-catalog-tools'

export interface CatalogState { error: string }

function text(form: FormData, key: string, max = 300): string {
  const input = form.get(key)
  if (typeof input !== 'string' || input.length > max) throw new Error(`Confira o campo ${key}.`)
  return input.trim()
}

export async function createProduct(_state: CatalogState, form: FormData): Promise<CatalogState> {
  const { db } = await adminDatabase()
  let id: string

  try {
    id = uuid(form.get('request_id'))
    const name = text(form, 'name')

    if (!name) throw new Error('Preencha o nome da peça.')

    const type = text(form, 'product_type')

    if (!['simple', 'variable'].includes(type)) throw new Error('Escolha o tipo do produto.')

    const stem = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 130) || 'produto'

    const { error } = await db.rpc('serenity_admin_manage_catalog', {
      p_product_id: id,
      p_operation: 'create',
      p_payload: {
        name,
        slug: `${stem}-${id}`,
        product_type: type,
      },
    })

    if (error) throw new Error('Não foi possível criar o produto. Confira se o novo SQL foi executado.')
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Não foi possível criar o produto.' }
  }

  revalidatePath('/admin/produtos')
  redirect(`/admin/produtos/${id}`)
}

export async function manageProduct(id: string, operation: string, _state: CatalogState, form: FormData): Promise<CatalogState> {
  const { db } = await adminDatabase()
  const uploaded: string[] = []
  let pendingMediaId: string | null = null

  try {
    uuid(id)

    const { data: parent, error: parentError } = await db.from('products').select('id,slug').eq('id', id).maybeSingle()

    if (parentError || !parent) throw new Error('Produto não encontrado.')

    let payload: Record<string, unknown>
    let rpcOperation = operation

    if (operation === 'organize') {
      payload = {
        material: text(form, 'material', 180),
        categories: lines(text(form, 'categories', 16000)),
        tags: lines(text(form, 'tags', 16000)),
        featured: form.get('featured') === 'on',
      }

    } else if (operation === 'variant_add' || operation === 'variant_attributes') {
      const name = text(form, 'name')

      if (!name) throw new Error('Preencha o nome da variação.')

      payload = {
        name,
        attributes: attributes(text(form, 'attributes', 16000)),
      }

      if (operation === 'variant_add') {
        const regular = amount(text(form, 'regular_price', 40), 'Preço base')
        const sale = amount(text(form, 'sale_price', 40), 'Preço promocional')

        if (sale !== null && (regular === null || sale >= regular)) throw new Error('O preço promocional deve ser menor que o preço base.')

        const status = text(form, 'stock_status', 30)

        if (!['instock', 'outofstock', 'onbackorder'].includes(status)) throw new Error('Situação de estoque inválida.')

        payload = {
          ...payload,
          id: uuid(form.get('request_id')),
          sku: text(form, 'sku', 180) || null,
          regular_price: regular,
          sale_price: sale,
          stock_status: status,
          stock_quantity: quantity(text(form, 'stock_quantity', 40)),
        }
      } else {
        const old = JSON.parse(text(form, 'original_attributes', 20000))

        payload = {
          ...payload,
          id: uuid(form.get('variant_id')),
          original_name: text(form, 'original_name'),
          original_attributes: old,
        }
      }

    } else if (operation === 'youtube_add') {
      const youtube = youtubeId(text(form, 'youtube', 1000))

      payload = {
        id: uuid(form.get('request_id')),
        media_type: 'youtube',
        youtube_id: youtube,
        source_url: `https://www.youtube.com/watch?v=${youtube}`,
        alt_text: '',
      }

      rpcOperation = 'media_add'

    } else if (operation === 'image_add') {
      const file = form.get('image')

      if (!file || typeof file === 'string' || file.size < 1 || file.size > 3 * 1024 * 1024) throw new Error('Escolha uma foto JPG, PNG ou WebP de até 3 MB.')

      const variant = text(form, 'variant_id', 40)

      if (variant) {
        uuid(variant)

        const owned = await db.from('product_variants').select('id').eq('id', variant).eq('product_id', id).maybeSingle()

        if (owned.error || !owned.data) throw new Error('A variação selecionada não pertence a este produto.')
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const metadata = await sharp(buffer, { limitInputPixels: 40000000, animated: false }).metadata()

      if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1) throw new Error('Use uma imagem estática JPG, PNG ou WebP.')

      const gallery = await sharp(buffer, { limitInputPixels: 40000000 }).rotate().resize({
        width: 1800,
        height: 1800,
        fit: 'inside',
        withoutEnlargement: true,
      }).webp({ quality: 94 }).toBuffer()

      const thumbnail = await sharp(buffer, { limitInputPixels: 40000000 }).rotate().resize({
        width: 600,
        height: 600,
        fit: 'inside',
        withoutEnlargement: true,
      }).webp({ quality: 90 }).toBuffer()

      const mediaId = randomUUID()
      const folder = `admin/${id}/${mediaId}`
      const originalPath = `${folder}/original.${metadata.format === 'jpeg' ? 'jpg' : metadata.format}`
      const galleryPath = `${folder}/galeria.webp`
      const thumbnailPath = `${folder}/miniatura.webp`

      const originals: [string, Buffer, string][] = [
        [originalPath, buffer, `image/${metadata.format}`],
        [galleryPath, gallery, 'image/webp'],
        [thumbnailPath, thumbnail, 'image/webp'],
      ]

      for (const [path, bytes, contentType] of originals) {
        const result = await db.storage.from('produtos').upload(path, bytes, {
          contentType,
          upsert: false,
          cacheControl: '31536000',
        })

        if (result.error) throw new Error('Não foi possível enviar a foto. Confira o espaço disponível no Supabase.')

        uploaded.push(path)
      }

      pendingMediaId = mediaId

      payload = {
        id: mediaId,
        media_type: 'image',
        variant_id: variant || null,
        storage_path: galleryPath,
        thumbnail_path: thumbnailPath,
        original_path: originalPath,
        alt_text: text(form, 'alt_text', 300),
      }

      rpcOperation = 'media_add'

    } else if (['media_cover', 'media_move', 'media_remove', 'media_assign'].includes(operation)) {
      payload = { id: uuid(form.get('media_id')) }

      if (operation === 'media_move') {
        const direction = text(form, 'direction', 10)

        if (!['up', 'down'].includes(direction)) throw new Error('Movimento inválido.')

        payload.direction = direction
      }

      if (operation === 'media_assign') {
        const variant = text(form, 'variant_id', 40)
        payload.variant_id = variant ? uuid(variant) : null
      }

    } else {
      throw new Error('Operação inválida.')
    }

    const result = await db.rpc('serenity_admin_manage_catalog', {
      p_product_id: id,
      p_operation: rpcOperation,
      p_payload: payload,
    })

    if (result.error) {
      const message = result.error.message || ''

      throw new Error(
        message.includes('DUPLICATE_VARIANT')
          ? 'Já existe uma variação habilitada com essa combinação de atributos.'
          : message.includes('VIDEO_ALREADY_EXISTS')
          ? 'Este produto já tem um vídeo. Remova o link atual para substituí-lo.'
          : message.includes('STALE_VARIANT')
          ? 'Os atributos foram alterados por outra pessoa. Copie suas alterações e recarregue.'
          : message.includes('COVER_REQUIRES_GENERAL_IMAGE')
          ? 'Escolha uma foto geral do produto como capa.'
          : 'Não foi possível salvar. Confira os campos e se o novo SQL foi instalado.'
      )
    }

    revalidateTag('catalog')
    revalidatePath('/admin/produtos')
    revalidatePath(`/admin/produtos/${id}`)
    revalidatePath(`/admin/produtos/${id}/gerenciar`)
    revalidatePath(`/produto/${parent.slug}`)

  } catch (error) {
    if (uploaded.length) {
      let mayRemove = !pendingMediaId

      if (pendingMediaId) {
        const check = await db.from('product_media').select('id').eq('id', pendingMediaId).maybeSingle()
        mayRemove = !check.error && !check.data
      }

      if (mayRemove) await db.storage.from('produtos').remove(uploaded)
    }

    return {
      error: error instanceof Error ? error.message : 'Não foi possível salvar.',
    }
  }

  redirect(`/admin/produtos/${id}/gerenciar?salvo=1`)
}
