'use server'

import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { revalidatePath, revalidateTag } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { editorPayload, emptyProduct } from '@/lib/admin-unified'
import type { EditorBundle, EditorResult } from '@/lib/admin-unified'
import { uuid } from '@/lib/admin-catalog-tools'

export async function stageEditorPhoto(
  id: string,
  form: FormData
): Promise<{ error: string; id?: string; path?: string }> {
  const { db, user } = await adminDatabase()
  const uploaded: string[] = []

  try {
    uuid(id)

    const file = form.get('image')

    if (
      !file ||
      typeof file === 'string' ||
      file.size < 1 ||
      file.size > 3 * 1024 * 1024
    ) {
      throw new Error('Cada foto deve ser JPG, PNG ou WebP de até 3 MB.')
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const info = await sharp(bytes, {
      limitInputPixels: 40000000,
    }).metadata()

    if (
      !['jpeg', 'png', 'webp'].includes(info.format || '') ||
      (info.pages || 1) > 1
    ) {
      throw new Error('Use uma imagem estática JPG, PNG ou WebP.')
    }

    const gallery = await sharp(bytes, { limitInputPixels: 40000000 })
      .rotate()
      .resize({
        width: 1800,
        height: 1800,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 94 })
      .toBuffer()

    const thumbnail = await sharp(bytes, { limitInputPixels: 40000000 })
      .rotate()
      .resize({
        width: 600,
        height: 600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer()

    const photoId = randomUUID()
    const folder = `admin/${id}/${photoId}`

    const media = {
      storage_path: `${folder}/galeria.webp`,
      thumbnail_path: `${folder}/miniatura.webp`,
      original_path: `${folder}/original.${info.format === 'jpeg' ? 'jpg' : info.format}`,
    }

    const items: [string, Buffer, string][] = [
      [media.original_path, bytes, `image/${info.format}`],
      [media.storage_path, gallery, 'image/webp'],
      [media.thumbnail_path, thumbnail, 'image/webp'],
    ]

    for (const [path, buffer, contentType] of items) {
      const result = await db.storage.from('produtos').upload(path, buffer, {
        contentType,
        upsert: false,
        cacheControl: '31536000',
      })

      if (result.error) {
        throw new Error('Não foi possível enviar uma foto. Tente novamente.')
      }

      uploaded.push(path)
    }

    const result = await db.from('serenity_admin_photo_uploads').insert({
      id: photoId,
      product_id: id,
      admin_id: user.id,
      media,
    })

    if (result.error) {
      throw new Error('Não foi possível preparar a foto. Confira se o novo SQL foi executado.')
    }

    return {
      error: '',
      id: photoId,
      path: media.thumbnail_path,
    }
  } catch (error) {
    if (uploaded.length) {
      await db.storage.from('produtos').remove(uploaded)
    }

    return {
      error: error instanceof Error ? error.message : 'Não foi possível enviar a foto.',
    }
  }
}

export async function saveUnifiedEditor(
  id: string,
  isNew: boolean,
  form: FormData,
  validateOnly = false
): Promise<EditorResult> {
  const { db, user } = await adminDatabase()

  try {
    uuid(id)
    let bundle: EditorBundle

    if (isNew) {
      bundle = {
        product: emptyProduct(id),
        variants: [],
        commercial: {},
        version: '',
        media: [],
      }
    } else {
      const read = await db.rpc('serenity_admin_read_editor', {
        p_product_id: id,
      })

      if (read.error || !read.data) {
        throw new Error('Não foi possível carregar o produto.')
      }

      bundle = read.data as EditorBundle

      if (form.get('version') !== bundle.version) {
        throw new Error('Este produto foi alterado em outra operação. Copie suas alterações e recarregue antes de salvar.')
      }
    }

    const payload = editorPayload(bundle, form, isNew)

    if (validateOnly) return { error: '' }

    const saved = await db.rpc('serenity_admin_save_editor', {
      p_product_id: id,
      p_admin_id: user.id,
      p_version: bundle.version,
      p_create: isNew,
      p_payload: payload,
    })

    if (saved.error) {
      const message = saved.error.message || ''

      throw new Error(
        message.includes('STALE_PRODUCT')
          ? 'O produto foi alterado por outra operação. Copie suas alterações e recarregue.'
          : message.includes('DUPLICATE_VARIANT')
          ? 'Existem variações habilitadas com os mesmos atributos.'
          : message.includes('ALREADY_CREATED')
          ? 'O produto já foi criado. Volte à listagem e abra a peça para continuar.'
          : 'Não foi possível salvar. Suas alterações continuam na tela para tentar novamente.'
      )
    }

    revalidateTag('catalog')
    revalidatePath('/admin/produtos')
    revalidatePath(`/admin/produtos/${id}`)

    const slug = isNew ? payload.product.slug : bundle.product.slug

    if (typeof slug === 'string') {
      revalidatePath(`/produto/${slug}`)
    }

    return {
      error: '',
      url: `/admin/produtos/${id}?salvo=1`,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Não foi possível salvar.',
    }
  }
}
