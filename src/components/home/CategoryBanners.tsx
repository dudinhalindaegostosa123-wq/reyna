'use client'

import { Fragment, useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface Banner {
  name: string
  subtitle: string
  href: string
  image?: string
  mobileImage?: string
  textTone?: 'dark' | 'light'
}

interface Props {
  items: Banner[]
  afterEar?: ReactNode
}

const DEFAULT_IMAGES: Record<string, string> = {
  '/orelha': '/banners/orelha.webp',
  '/nariz': '/banners/nariz.webp',
  '/busca?q=nariz': '/banners/nariz.webp',
  '/busca?q=boca': '/banners/boca.webp',
  '/busca?q=umbigo': '/banners/umbigo.webp',
  '/busca?q=sobrancelha': '/banners/sobrancelha.webp',
  '/busca?q=mamilo': '/banners/mamilo.webp',
  '/busca?q=intimo': '/banners/intimos.webp',
}

const DEFAULT_MOBILE_IMAGES: Record<string, string> = {
  '/orelha': '/banners/orelha-mobile.webp',
  '/nariz': '/banners/nariz-mobile.webp',
  '/busca?q=nariz': '/banners/nariz-mobile.webp',
  '/busca?q=boca': '/banners/boca-mobile.webp',
  '/busca?q=umbigo': '/banners/umbigo-mobile.webp',
  '/busca?q=sobrancelha': '/banners/sobrancelha-mobile.webp',
  '/busca?q=mamilo': '/banners/mamilo-mobile.webp',
  '/busca?q=intimo': '/banners/intimos-mobile.webp',
}

export default function CategoryBanners({ items, afterEar }: Props) {
  const earIndex = items.findIndex(item => /^(?:\/categoria)?\/orelha\/?$/.test(item.href.split('?')[0]) || /\borelha\b/i.test(item.name))
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    const banners = Array.from(
      section.querySelectorAll<HTMLAnchorElement>(
        '[data-category-banner]'
      )
    )

    const motionPreference = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    )

    let frame: number | null = null

    function update() {
      frame = null

      const viewportHeight = window.innerHeight
      const viewportCenter = viewportHeight * 0.52

      const measurements = banners.map((banner) => ({
        banner,
        rect: banner.getBoundingClientRect(),
      }))

      measurements.forEach(({ banner, rect }) => {
        const center = rect.top + rect.height / 2
        const distance = Math.abs(center - viewportCenter)

        const range = Math.max(
          viewportHeight * 0.75,
          rect.height * 0.85
        )

        const focus = Math.max(0, 1 - distance / range)
        const darkness = (1 - focus) * 0.52

        const entrance = Math.max(
          0,
          Math.min(
            1,
            (viewportHeight - rect.top) /
              (viewportHeight * 0.5)
          )
        )

        const offset = motionPreference.matches
          ? 0
          : (1 - entrance) * 40

        const imageOffset = motionPreference.matches
          ? 0
          : Math.max(
              -14,
              Math.min(
                14,
                (center - viewportCenter) * 0.025
              )
            )

        banner.style.setProperty(
          '--banner-darkness',
          darkness.toFixed(3)
        )

        banner.style.setProperty(
          '--banner-offset',
          `${offset.toFixed(1)}px`
        )

        banner.style.setProperty(
          '--banner-image-offset',
          `${imageOffset.toFixed(1)}px`
        )
      })
    }

    function scheduleUpdate() {
      if (frame !== null) return
      frame = window.requestAnimationFrame(update)
    }

    update()

    window.addEventListener('scroll', scheduleUpdate, {
      passive: true,
    })

    window.addEventListener('resize', scheduleUpdate)

    motionPreference.addEventListener(
      'change',
      scheduleUpdate
    )

    return () => {
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)

      motionPreference.removeEventListener(
        'change',
        scheduleUpdate
      )

      if (frame !== null) {
        window.cancelAnimationFrame(frame)
      }
    }
  }, [items])

  return (
    <section
      ref={sectionRef}
      aria-label="Categorias de piercings"
    >
      {items.map((item, index) => {
        const image =
          item.image || DEFAULT_IMAGES[item.href]

        const mobileImage =
          item.mobileImage ||
          DEFAULT_MOBILE_IMAGES[item.href]

        const hasImage = Boolean(image || mobileImage)
        const hasMobileImage = Boolean(mobileImage)
        const lightText = item.textTone === 'light'

        return (
          <Fragment key={item.href}>
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            data-category-banner
            aria-label={`Explorar piercings: ${item.name}`}
            style={
              {
                '--banner-darkness': '0',
                '--banner-offset': '0px',
                '--banner-image-offset': '0px',
              } as CSSProperties
            }
            className={[
              'group relative isolate flex w-full overflow-hidden',
              'md:aspect-[5/2] md:h-auto md:min-h-0 md:items-center',
              hasMobileImage
                ? 'aspect-[2/3] items-start'
                : 'h-[70svh] min-h-[420px] items-center',
              'focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-offset-[-6px]',
              'focus-visible:outline-[#B8986A]',
              lightText
                ? 'text-white'
                : 'text-[#25231F]',
              hasImage
                ? 'bg-[#F3E8D8]'
                : index % 2 === 0
                  ? 'bg-[#EAE6DE]'
                  : 'bg-[#F4F1EB]',
            ].join(' ')}
          >
            {hasImage && (
              <>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-y-5 inset-x-0 z-0"
                  style={{
                    transform:
                      'translate3d(0, var(--banner-image-offset), 0)',
                  }}
                >
                  <picture className="absolute inset-0 block">
                    {mobileImage && (
                      <source
                        media="(max-width: 767px)"
                        srcSet={mobileImage}
                      />
                    )}

                    <Image
                      src={image || mobileImage!}
                      alt=""
                      fill
                      unoptimized
                      sizes="100vw"
                      className="object-cover object-center"
                    />
                  </picture>
                </div>

                {lightText && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-black/55 via-black/20 to-transparent"
                  />
                )}

                {!lightText && !hasMobileImage && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-[#F3E8D8]/90 via-[#F3E8D8]/30 to-transparent md:hidden"
                  />
                )}
              </>
            )}

            {!hasImage && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-2 bottom-0 select-none font-display text-[40vw] leading-none text-black/[0.035] md:right-12 md:text-[28vw]"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
            )}

            <div
              className={[
                'relative z-10 mx-auto w-full max-w-7xl px-6',
                'md:px-10 md:py-10 lg:py-16',
                hasMobileImage
                  ? 'pb-6 pt-8 sm:pt-12'
                  : 'py-12',
              ].join(' ')}
              style={{
                transform:
                  'translate3d(0, var(--banner-offset), 0)',
              }}
            >
              <div
                className={[
                  hasMobileImage
                    ? 'max-w-sm'
                    : hasImage
                      ? 'max-w-[75%]'
                      : 'max-w-full',
                  hasImage ? 'md:max-w-[42%]' : '',
                ].join(' ')}
              >
                <p
                  className={[
                    'text-[9px] uppercase tracking-[0.3em] opacity-70',
                    'md:mb-4 md:text-[10px] lg:mb-6',
                    hasMobileImage ? 'mb-3' : 'mb-5',
                  ].join(' ')}
                >
                  Serenity Piercings
                </p>

                <h3 className="font-banner text-[clamp(2.5rem,12vw,4.5rem)] leading-[0.95] tracking-[-0.025em] md:text-[clamp(3.5rem,8vw,8rem)]">
                  {item.name}
                </h3>

                <p
                  className={[
                    'max-w-xs leading-relaxed opacity-80',
                    'md:mt-4 md:text-[13px] lg:mt-6 lg:text-[15px]',
                    hasMobileImage
                      ? 'mt-3 text-[12px]'
                      : 'mt-5 text-[13px]',
                  ].join(' ')}
                >
                  {item.subtitle}
                </p>

                <span
                  className={[
                    'inline-flex items-center gap-6 border-b border-current uppercase tracking-[0.2em]',
                    'md:mt-6 md:pb-2 md:text-[11px]',
                    'lg:mt-10 lg:gap-8 lg:pb-3',
                    hasMobileImage
                      ? 'mt-5 pb-2 text-[10px]'
                      : 'mt-7 pb-3 text-[11px]',
                  ].join(' ')}
                >
                  Explorar

                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    aria-hidden="true"
                    className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none"
                  >
                    <path d="M4 12h15M13 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>

            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20 bg-black"
              style={{
                opacity: 'var(--banner-darkness)',
              }}
            />
          </Link>
          {index === earIndex && afterEar}
          </Fragment>
        )
      })}
    </section>
  )
}
