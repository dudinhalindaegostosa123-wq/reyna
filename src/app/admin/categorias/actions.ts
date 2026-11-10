'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'

interface SaveCategoryResult {
  error: string
  slug?: string
}

function createSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function saveCategory(
  form: FormData
): Promise<SaveCategoryResult> {
  const { db, user } = await adminDatabase()

  const rawName = form.get('name')
  const rawSlug = form.get('slug')
  const rawVersion = form.get('version')
  const rawHidden = form.get('hidden_from_menu')

  if (
    typeof rawName !== 'string' ||
    typeof rawSlug !== 'string' ||
    typeof rawVersion !== 'string' ||
    (
      rawHidden !== null &&
      rawHidden !== 'on'
    )
  ) {
    return {
      error:
        'Não foi possível ler o formulário. Atualize a página.',
    }
  }

  const name = rawName.trim()
  const versionText = rawVersion.trim()
  const version = Number(versionText)

  if (
    !name ||
    name.length > 180 ||
    /[\u0000-\u001F\u007F]/.test(name)
  ) {
    return {
      error:
        'Informe um nome de categoria com até 180 caracteres.',
    }
  }

  if (
    !/^\d+$/.test(versionText) ||
    !Number.isSafeInteger(version) ||
    version < 0
  ) {
    return {
      error:
        'A versão da categoria está inválida. Reabra pela lista.',
    }
  }

  const creating = version === 0

  const slug = creating
    ? createSlug(name)
    : rawSlug.trim()

  if (
    slug.length < 1 ||
    slug.length > 180 ||
    !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
  ) {
    return {
      error: creating
        ? 'O nome precisa conter letras ou números para gerar um endereço válido.'
        : 'O endereço da categoria está inválido. Reabra pela lista.',
    }
  }

  try {
    const { data, error } = await db.rpc(
      'serenity_admin_save_category',
      {
        p_slug: slug,
        p_name: name,
        p_hidden: rawHidden === 'on',
        p_expected_version: version,
        p_actor: user.id,
      }
    )

    if (error) {
      const messages: Record<string, string> = {
        CATEGORY_INVALID:
          'Confira o nome e os dados da categoria.',

        CATEGORY_EXISTS:
          'Já existe uma categoria com esse endereço. Abra a categoria existente para editar.',

        CATEGORY_STALE:
          'A categoria mudou em outra operação. Reabra pela lista antes de salvar novamente.',
      }

      return {
        error:
          messages[error.message] ||
          'Não foi possível salvar a categoria. Atualize a lista antes de tentar novamente.',
      }
    }

    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      data.slug !== slug
    ) {
      return {
        error:
          'Não foi possível confirmar o resultado. Confira a lista antes de repetir.',
      }
    }

    revalidateTag('catalog')
    revalidateTag('category-settings')

    revalidatePath('/admin/categorias')
    revalidatePath('/categoria/[slug]', 'page')
    revalidatePath('/categoria/hastes-e-topos')
    revalidatePath('/')

    return {
      error: '',
      slug,
    }
  } catch {
    return {
      error:
        'Não foi possível confirmar o salvamento. Atualize a lista e confira antes de tentar novamente.',
    }
  }
}
