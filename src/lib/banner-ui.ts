export interface SiteBanner {
  id: string
  slot: 'hero' | 'category'
  title: string
  subtitle: string
  href: string
  cta: string
  alt: string
  image_desktop: string
  image_mobile: string
  text_tone: 'light' | 'dark'
  position: number
}

export interface AdminBanner extends SiteBanner {
  enabled: boolean
  version: number
}

export function safeBannerHref(
  value: string
): boolean {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !/[\\\u0000-\u001f\u007f]/.test(value)
  )
}

export function bannerImage(
  path: string,
  base: string
): string {
  const localImage =
    /^\/banners\/[a-zA-Z0-9/_.-]+$/.test(path) &&
    !path.includes('..')

  if (localImage) {
    return path
  }

  const uploadedImage =
    /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/i.test(path)

  if (uploadedImage) {
    return (
      base.replace(/\/$/, '') +
      '/storage/v1/object/public/serenity-banners/' +
      path
    )
  }

  return ''
}
