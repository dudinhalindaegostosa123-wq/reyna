import 'server-only'

import { cache } from 'react'

export const getCategoryDisplayName = cache(
  async (
    slug: string,
    fallback: string
  ): Promise<string> => {
    if (slug === 'topo') return 'Topo'
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      return fallback
    }

    const url = process.env.SUPABASE_URL
      ?.trim()
      .replace(/\/$/, '')

    const key =
      process.env.SUPABASE_PUBLISHABLE_KEY?.trim()

    if (!url || !key) {
      return fallback
    }

    try {
      const query = new URLSearchParams({
        select: 'name',
        slug: `eq.${slug}`,
        limit: '1',
      })

      const response = await fetch(
        `${url}/rest/v1/serenity_public_category_settings?${query.toString()}`,
        {
          headers: {
            apikey: key,
            Accept: 'application/json',
          },
          next: {
            revalidate: 60,
            tags: ['category-settings'],
          },
        }
      )

      if (!response.ok) {
        return fallback
      }

      const result: unknown = await response.json()

      if (!Array.isArray(result) || result.length !== 1) {
        return fallback
      }

      const item = result[0]

      if (
        !item ||
        typeof item !== 'object' ||
        typeof item.name !== 'string'
      ) {
        return fallback
      }

      return item.name.trim() || fallback
    } catch {
      return fallback
    }
  }
)
