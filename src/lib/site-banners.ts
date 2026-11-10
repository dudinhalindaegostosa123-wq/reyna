import 'server-only'

import {
  bannerImage,
  safeBannerHref,
} from '@/lib/banner-ui'

import type { SiteBanner } from '@/lib/banner-ui'

export async function getSiteBanners():
  Promise<SiteBanner[] | null> {
  const base = process.env.SUPABASE_URL
    ?.trim()
    .replace(/\/$/, '')

  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!base || !key) {
    return null
  }

  try {
    const response = await fetch(
      `${base}/rest/v1/serenity_public_banners` +
      '?select=*&order=position.asc,id.asc',
      {
        headers: {
          apikey: key,
        },
        next: {
          revalidate: 60,
          tags: ['site-banners'],
        },
      }
    )

    if (!response.ok) {
      return null
    }

    const data: unknown = await response.json()

    if (!Array.isArray(data)) {
      return null
    }

    const banners: SiteBanner[] = []

    for (const input of data) {
      if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input)
      ) {
        continue
      }

      const row = input as Record<string, unknown>

      if (
        row.slot !== 'hero' &&
        row.slot !== 'category'
      ) {
        continue
      }

      const href = String(row.href || '')

      if (!safeBannerHref(href)) {
        continue
      }

      const desktop = bannerImage(
        String(row.image_desktop || ''),
        base
      )

      if (!desktop) {
        continue
      }

      const mobile = bannerImage(
        String(row.image_mobile || ''),
        base
      )

      banners.push({
        id: String(row.id),
        slot: row.slot,
        title: String(row.title || ''),
        subtitle: String(row.subtitle || ''),
        href,
        cta: String(row.cta || 'Explorar agora'),
        alt: String(row.alt || row.title || ''),
        image_desktop: desktop,
        image_mobile: mobile,
        text_tone:
          row.text_tone === 'dark'
            ? 'dark'
            : 'light',
        position: Number(row.position) || 0,
      })
    }

    return banners
  } catch {
    return null
  }
}
