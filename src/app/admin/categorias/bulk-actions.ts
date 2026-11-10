'use server'

import { revalidatePath, revalidateTag } from 'next/cache'

import { adminDatabase } from '@/lib/admin-auth'
import { saleUuid } from '@/lib/admin-sales'

export interface CategoryDestination {
  slug: string
  name: string
}

export interface CategoryChangePreview {
  action: 'move' | 'remove'
  sourceSlug: string
  sourceName: string
  targetSlug: string | null
  targetName: string | null
  affectedProducts: number
  withoutCategory: number
  token: string
}

interface ChangeInput {
  source: string
  action: 'move' | 'remove'
  target: string | null
}

interface ApplyInput extends ChangeInput {
  requestId: string
  token: string
}

function validSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 180 &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)
  )
}

function validChange(input: ChangeInput): boolean {
  if (!input || !validSlug(input.source)) {
    return false
  }

  if (input.action === 'remove') {
    return input.target === null
  }

  if (input.action === 'move') {
    return (
      validSlug(input.target) &&
      input.target !== input.source
    )
  }

  return false
}

function changeError(message: string): string {
  const messages: Record<string, string> = {
    CATEGORY_INVALID:
      'Confira a categoria e a operação escolhida.',

    CATEGORY_NOT_FOUND:
      'A categoria não foi encontrada. Atualize a página.',

    CATEGORY_TARGET:
      'Escolha uma categoria de destino diferente da origem.',

    CATEGORY_STALE:
      'Os dados mudaram depois da prévia. Atualize a página e confira uma nova prévia.',

    CATEGORY_REQUEST:
      'A identificação desta operação não corresponde aos dados enviados. Atualize a página.',
  }

  return Object.prototype.hasOwnProperty.call(
    messages,
    message
  )
    ? messages[message]
    : 'Não foi possível confirmar a operação. Atualize a página e confira os dados antes de tentar novamente.'
}

export async function loadCategoryDestinations(
  source: string
): Promise<{
  error: string
  categories: CategoryDestination[]
}> {
  const { db } = await adminDatabase()

  if (!validSlug(source)) {
    return {
      error: 'A categoria de origem está inválida.',
      categories: [],
    }
  }

  try {
    const categories: CategoryDestination[] = []
    const pageSize = 500

    for (let offset = 0; ; offset += pageSize) {
      const result = await db
        .from('serenity_category_settings')
        .select('slug,source_name,display_name')
        .neq('slug', source)
        .order('slug')
        .range(offset, offset + pageSize - 1)

      if (result.error) {
        return {
          error:
            'Não foi possível carregar as categorias de destino.',
          categories: [],
        }
      }

      const rows = result.data || []

      for (const row of rows) {
        const slug = String(row.slug || '')
        const sourceName = String(
          row.source_name || ''
        ).trim()

        if (!validSlug(slug) || !sourceName) {
          continue
        }

        categories.push({
          slug,
          name:
            String(row.display_name || '').trim() ||
            sourceName,
        })
      }

      if (rows.length < pageSize) break
    }

    categories.sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR') ||
      a.slug.localeCompare(b.slug, 'pt-BR')
    )

    return {
      error: '',
      categories,
    }
  } catch {
    return {
      error:
        'Não foi possível carregar as categorias de destino.',
      categories: [],
    }
  }
}

export async function previewCategoryChange(
  input: ChangeInput
): Promise<{
  error: string
  preview?: CategoryChangePreview
}> {
  const { db } = await adminDatabase()

  if (!validChange(input)) {
    return {
      error: 'Confira a origem, a operação e o destino.',
    }
  }

  try {
    const { data, error } = await db.rpc(
      'serenity_admin_preview_category_change',
      {
        p_source: input.source,
        p_action: input.action,
        p_target: input.target,
      }
    )

    if (error) {
      return {
        error: changeError(error.message),
      }
    }

    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      data.action !== input.action ||
      data.source_slug !== input.source ||
      data.target_slug !== input.target ||
      typeof data.source_name !== 'string' ||
      typeof data.token !== 'string' ||
      !/^[a-f0-9]{32}$/.test(data.token) ||
      !Number.isSafeInteger(data.affected_products) ||
      data.affected_products < 0 ||
      !Number.isSafeInteger(data.without_category) ||
      data.without_category < 0 ||
      data.without_category > data.affected_products ||
      (
        input.action === 'move' &&
        typeof data.target_name !== 'string'
      )
    ) {
      return {
        error:
          'Não foi possível conferir a prévia. Atualize a página.',
      }
    }

    return {
      error: '',
      preview: {
        action: input.action,
        sourceSlug: input.source,
        sourceName: data.source_name,
        targetSlug: input.target,
        targetName:
          input.action === 'move'
            ? data.target_name
            : null,
        affectedProducts: data.affected_products,
        withoutCategory: data.without_category,
        token: data.token,
      },
    }
  } catch {
    return {
      error:
        'Não foi possível carregar a prévia. Nenhuma alteração foi solicitada.',
    }
  }
}

export async function applyCategoryChange(
  input: ApplyInput
): Promise<{
  error: string
  affectedProducts?: number
}> {
  const { db, user } = await adminDatabase()

  if (
    !validChange(input) ||
    !saleUuid(input.requestId) ||
    typeof input.token !== 'string' ||
    !/^[a-f0-9]{32}$/.test(input.token)
  ) {
    return {
      error:
        'Os dados da confirmação estão inválidos. Confira uma nova prévia.',
    }
  }

  try {
    const { data, error } = await db.rpc(
      'serenity_admin_apply_category_change',
      {
        p_request: input.requestId,
        p_source: input.source,
        p_action: input.action,
        p_target: input.target,
        p_token: input.token,
        p_actor: user.id,
      }
    )

    if (error) {
      return {
        error: changeError(error.message),
      }
    }

    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      data.id !== input.requestId ||
      !Number.isSafeInteger(data.affected_products) ||
      data.affected_products < 0
    ) {
      return {
        error:
          'O resultado não pôde ser confirmado. Atualize a página antes de repetir.',
      }
    }

    revalidateTag('catalog')
    revalidateTag('category-settings')

    revalidatePath('/admin/categorias')
    revalidatePath('/admin/produtos')
    revalidatePath('/admin/produtos/novo')
    revalidatePath('/admin/produtos/[id]', 'page')
    revalidatePath('/categoria/[slug]', 'page')
    revalidatePath('/categoria/hastes-e-topos')
    revalidatePath('/')

    return {
      error: '',
      affectedProducts: data.affected_products,
    }
  } catch {
    return {
      error:
        'Não foi possível confirmar o resultado. Atualize a página e confira os produtos antes de tentar novamente.',
    }
  }
}
