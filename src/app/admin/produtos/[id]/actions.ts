'use server'

import { redirect } from 'next/navigation'
import { revalidatePath, revalidateTag } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { buildPayload } from '@/lib/admin-product-editor'
import type { ProductBundle, SaveState } from '@/lib/admin-product-editor'

export async function saveProduct(id: string, _previous: SaveState, form: FormData): Promise<SaveState> {
  const { db } = await adminDatabase()

  const { data, error } = await db.rpc('serenity_admin_read_product', {
    p_product_id: id,
  })

  if (error || !data) {
    return {
      error: 'Não foi possível carregar o produto. Atualize a página e tente novamente.',
    }
  }

  const bundle = data as ProductBundle
  const version = form.get('version')

  if (typeof version !== 'string' || version !== bundle.version) {
    return {
      error: 'Este produto mudou desde que você abriu a página. Copie suas alterações e recarregue antes de salvar.',
    }
  }

  let payload: ReturnType<typeof buildPayload>

  try {
    payload = buildPayload(bundle, form)
  } catch (validation) {
    return {
      error: validation instanceof Error
        ? validation.message
        : 'Confira os campos informados.',
    }
  }

  const saved = await db.rpc('serenity_admin_save_product', {
    p_product_id: id,
    p_version: version,
    p_payload: payload,
  })

  if (saved.error) {
    return {
      error: saved.error.code === '40001'
        ? 'O produto foi alterado por outra operação. Copie suas alterações e recarregue a página.'
        : 'Não foi possível salvar. Confira a instalação do SQL e tente novamente.',
    }
  }

  revalidateTag('catalog')
  revalidatePath('/admin/produtos')
  revalidatePath(`/admin/produtos/${id}`)

  if (typeof bundle.product.slug === 'string') {
    revalidatePath(`/produto/${bundle.product.slug}`)
  }

  redirect(`/admin/produtos/${encodeURIComponent(id)}?salvo=1`)
}
