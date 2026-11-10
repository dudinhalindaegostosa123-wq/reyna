import { labretCopy } from '@/lib/stem-description'
import { NextResponse } from 'next/server'
import { getStoreCategories } from '@/lib/catalog-server'

// This endpoint contains only the public category menu, never customer data.
export const revalidate = 60

interface CategorySetting {
  slug: string
  name: string
  hidden_from_menu: boolean
}

export async function GET() {
  try {
    const url = process.env.SUPABASE_URL
      ?.trim()
      .replace(/\/$/, '')

    const key =
      process.env.SUPABASE_PUBLISHABLE_KEY?.trim()

    if (!url || !key) {
      throw new Error('CATEGORY_CONFIGURATION')
    }

    const settingsQuery = new URLSearchParams({
      select: 'slug,name,hidden_from_menu',
      order: 'slug.asc',
      limit: '500',
    })

    const [categories, response] = await Promise.all([
      getStoreCategories(),

      fetch(
        `${url}/rest/v1/serenity_public_category_settings?${settingsQuery.toString()}`,
        {
          headers: {
            apikey: key,
            Accept: 'application/json',
            Prefer: 'count=exact',
          },
          next: { revalidate: 60, tags: ['category-settings'] },
        }
      ),
    ])

    if (!response.ok) {
      throw new Error('CATEGORY_SETTINGS_QUERY')
    }

    const raw: unknown = await response.json()

    if (!Array.isArray(raw)) {
      throw new Error('CATEGORY_SETTINGS_RESPONSE')
    }

    const contentRange = response.headers.get('content-range')
    const totalText = contentRange?.split('/')[1]
    const total = totalText ? Number(totalText) : NaN

    if (
      !Number.isSafeInteger(total) ||
      total < 0 ||
      raw.length !== total
    ) {
      throw new Error('CATEGORY_SETTINGS_INCOMPLETE')
    }

    const settings = new Map<string, CategorySetting>()

    for (const value of raw) {
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value)
      ) {
        throw new Error('CATEGORY_SETTING_INVALID')
      }

      const item = value as Record<string, unknown>

      if (
        typeof item.slug !== 'string' ||
        typeof item.name !== 'string' ||
        typeof item.hidden_from_menu !== 'boolean' ||
        !item.name.trim() ||
        !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.slug)
      ) {
        throw new Error('CATEGORY_SETTING_INVALID')
      }

      settings.set(item.slug, {
        slug: item.slug,
        name: item.name.trim(),
        hidden_from_menu: item.hidden_from_menu,
      })
    }

    const items = categories
      .filter(category => {
        const setting = settings.get(category.slug)

        return (
          category.count > 0 &&
          setting?.hidden_from_menu !== true
        )
      })
      .map(category => {
        const setting = settings.get(category.slug)

        return {
          name:
            category.slug === 'hastes-e-conectores'
              ? 'Labret'
              : category.slug === 'topo' ? 'Topo' : labretCopy(setting?.name || category.name),

          href:
            category.slug === 'hastes-e-conectores'
              ? '/categoria/labret'
              : `/categoria/${encodeURIComponent(category.slug)}`,
        }
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR')
      )

    return NextResponse.json(
      { categories: items },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch {
    return NextResponse.json(
      {
        categories: [],
        error: 'Não foi possível carregar as categorias.',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  }
}
