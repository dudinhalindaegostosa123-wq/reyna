/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import type { SiteBanner } from '@/lib/banner-ui'

export default function ManagedHero({
  banner,
}: {
  banner: SiteBanner
}) {
  const darkText = banner.text_tone === 'dark'
  const lunar = banner.id === 'lunarity-hero'

  return (
    <section
      className={
        'relative isolate flex min-h-[70vh] items-center ' +
        'justify-center overflow-hidden md:min-h-[80vh] ' +
        (lunar ? 'lunarity-brand-hero ' : '') +
        (
          darkText
            ? 'text-[#25231F]'
            : 'text-white'
        )
      }
    >
      <picture className="absolute inset-0 -z-20">
        {banner.image_mobile && (
          <source
            media="(max-width: 767px)"
            srcSet={banner.image_mobile}
          />
        )}

        <img
          src={banner.image_desktop}
          alt={banner.alt}
          fetchPriority="high"
          className="h-full w-full object-cover object-center"
        />
      </picture>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: lunar
            ? 'linear-gradient(180deg, rgba(0,0,0,0.16), rgba(0,0,0,0.04) 60%, rgba(0,0,0,0.12))'
            : darkText
            ? 'rgba(255,255,255,0.25)'
            : (
                'linear-gradient(180deg, ' +
                'rgba(0,0,0,0.65) 0%, ' +
                'rgba(0,0,0,0.44) 28%, ' +
                'rgba(0,0,0,0.42) 55%, ' +
                'rgba(0,0,0,0.20) 100%)'
              ),
        }}
      />

      <div className={`relative z-10 max-w-6xl space-y-6 px-6 py-12 text-center${lunar ? ' lunarity-brand-hero-content' : ''}`}>
        <h1
          className="font-banner break-words text-6xl leading-none tracking-[0.08em] md:text-8xl"
          style={{
            textShadow: darkText
              ? undefined
              : '0 2px 18px rgba(0,0,0,0.25)',
          }}
        >
          {banner.title}
        </h1>

        {banner.subtitle && (
          <p
            className="text-sm uppercase leading-relaxed tracking-[0.3em] md:text-base"
            style={{
              textShadow: darkText
                ? undefined
                : '0 1px 10px rgba(0,0,0,0.35)',
            }}
          >
            {banner.subtitle}
          </p>
        )}

        <Link
          href={banner.href}
          className={
            'inline-block border border-current px-8 py-4 ' +
            'text-[11px] uppercase tracking-[0.2em] ' +
            'transition-colors ' +
            (
              darkText
                ? 'hover:bg-[#25231F] hover:text-white'
                : 'bg-black/10 hover:bg-white hover:text-[#0A0A0A]'
            )
          }
        >
          {banner.cta || 'Explorar agora'}
        </Link>
      </div>
    </section>
  )
}
