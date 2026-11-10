'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminDatabase } from '@/lib/admin-auth'

function returnPath(
  value: FormDataEntryValue | null
): string {
  if (
    typeof value !== 'string' ||
    value.length > 2000
  ) {
    return '/admin/qualidade'
  }

  try {
    const url = new URL(
      value,
      'https://serenity.local'
    )

    if (
      url.origin !== 'https://serenity.local' ||
      url.pathname !== '/admin/qualidade'
    ) {
      return '/admin/qualidade'
    }

    url.searchParams.delete('aviso')

    return url.pathname + url.search
  } catch {
    return '/admin/qualidade'
  }
}

export async function setMaterialReviewResolved(
  form: FormData
): Promise<void> {
  const { db, user } = await adminDatabase()

  const back = returnPath(form.get('return_to'))
  let notice = 'indisponivel'

  try {
    const product = form.get('product_id')
    const signature = form.get('signature')
    const rawVersion = form.get('version')
    const rawResolved = form.get('resolved')
    const rawNote = form.get('note')

    const note =
      typeof rawNote === 'string'
        ? rawNote.trim()
        : ''

    if (
      typeof product !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        product
      ) ||
      typeof signature !== 'string' ||
      !/^[a-f0-9]{32}$/.test(signature) ||
      typeof rawVersion !== 'string' ||
      !/^\d{1,16}$/.test(rawVersion) ||
      !Number.isSafeInteger(Number(rawVersion)) ||
      !['true', 'false'].includes(
        String(rawResolved)
      ) ||
      form.get('confirmed') !== 'on' ||
      (
        rawNote !== null &&
        typeof rawNote !== 'string'
      ) ||
      note.length > 500 ||
      /[\u0000-\u001F\u007F]/.test(note)
    ) {
      notice = 'invalido'
    } else {
      const version = Number(rawVersion)
      const resolved = rawResolved === 'true'

      const result = await db.rpc(
        'serenity_admin_catalog_material_resolve_v2',
        {
          p_product: product,
          p_actor: user.id,
          p_version: version,
          p_signature: signature,
          p_resolved: resolved,
          p_note: note,
        }
      )

      if (result.error) {
        notice = String(
          result.error.message
        ).includes('CATALOG_REVIEW_STALE')
          ? 'alterado'
          : 'indisponivel'
      } else {
        const data: unknown = result.data

        const saved =
          data &&
          typeof data === 'object' &&
          !Array.isArray(data)
            ? data as Record<string, unknown>
            : {}

        if (
          Number(saved.version) === version + 1 &&
          saved.resolved === resolved
        ) {
          revalidatePath('/admin/qualidade')

          notice = resolved
            ? 'resolvido'
            : 'reaberto'
        }
      }
    }
  } catch {
    notice = 'indisponivel'
  }

  redirect(
    `${back}${
      back.includes('?') ? '&' : '?'
    }aviso=${notice}`
  )
}
