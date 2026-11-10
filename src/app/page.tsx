import { TITANIUM_INTRO } from '@/lib/titanium-copy'
import { STORE_INFORMATION } from '@/lib/store-information'
import { bannerPlacement,homeImageMap } from '@/lib/home-images'
import Image from 'next/image'
import Link from 'next/link'

import { getSiteBanners } from '@/lib/site-banners'
import { getStoneCollections } from '@/lib/stone-collections-server'
import StoneColorCarousel from '@/components/home/StoneColorCarousel'
import { getStorePage } from '@/lib/catalog-server'
import type { SiteBanner } from '@/lib/banner-ui'

import ManagedHero from '@/components/home/ManagedHero'
import ProductCard from '@/components/ui/ProductCard'
import EarMiniBanners from '@/components/home/EarMiniBanners'
import CategoryBanners from '@/components/home/CategoryBanners'
import InstagramGrid from '@/components/home/InstagramGrid'
import MaterialsSection from '@/components/home/MaterialsSection'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FALLBACK_HERO: SiteBanner = {
  id: 'fallback-hero',
  slot: 'hero',
  title: 'NOVA COLEÇÃO',
  subtitle: 'Exclusivos Swarovski',
  href: '/categoria/swarovski',
  cta: 'Explorar agora',
  alt: 'Coleção Swarovski da Serenity Piercings',
  image_desktop: '/banners/banner-swarovski.webp',
  image_mobile: '',
  text_tone: 'light',
  position: 0,
}

const CATEGORY_BANNERS = [
  {
    name: 'Orelha',
    subtitle: 'Explore cada região e encontre sua composição.',
    href: '/orelha',
    image: '/banners/orelha.webp',
    mobileImage: '/banners/orelha-mobile.webp',
  },
  {
    name: 'Nariz',
    subtitle: 'Um detalhe que faz parte de você.',
    href: '/nariz',
    image: '/banners/nariz.webp',
    mobileImage: '/banners/nariz-mobile.webp',
  },
  {
    name: 'Boca',
    subtitle: 'Descubra novas possibilidades para sua expressão.',
    href: '/boca',
    image: '/banners/boca.webp',
    mobileImage: '/banners/boca-mobile.webp',
  },
  {
    name: 'Umbigo',
    subtitle: 'Joias para acompanhar seu movimento.',
    href: '/categoria/umbigo',
    image: '/banners/umbigo.webp',
    mobileImage: '/banners/umbigo-mobile.webp',
  },
  {
    name: 'Sobrancelha',
    subtitle: 'Um ponto de destaque no seu olhar.',
    href: '/categoria/sobrancelha',
    image: '/banners/sobrancelha.webp',
    mobileImage: '/banners/sobrancelha-mobile.webp',
  },
  {
    name: 'Microdermal',
    subtitle: 'Explore os detalhes desta seleção.',
    href: '/categoria/microdermal',
    image: '/banners/microdermal.webp',
    mobileImage: '/banners/microdermal-mobile.webp',
  },
  {
    name: 'Mamilo',
    subtitle: 'Detalhes escolhidos por você.',
    href: '/categoria/mamilo',
    image: '/banners/mamilo.webp',
    mobileImage: '/banners/mamilo-mobile.webp',
  },
  {
    name: 'Íntimos',
    subtitle: 'Explore as peças desta seleção.',
    href: '/intimos',
    image: '/banners/intimos.webp',
    mobileImage: '/banners/intimos-mobile.webp',
  },
]

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="h-4 w-4 shrink-0"
    >
      <path d="M4 12h15M13 5l7 7-7 7" />
    </svg>
  )
}

export default async function HomePage() {
  const [
    arrivals,
    essentials,
    banners,
    colors,
  ] = await Promise.all([
    getStorePage({
      category: 'novidades',
      perPage: 4,
    }),

    getStorePage({
      category: 'after-care',
      perPage: 4,
    }),

    getSiteBanners(),
    getStoneCollections(),
  ])

  const hero = banners === null
    ? FALLBACK_HERO
    : banners.find(banner => banner.slot === 'hero')

  const categoryBanners = (banners === null
    ? CATEGORY_BANNERS
    : banners
        .filter(banner => bannerPlacement(banner) === 'category')
        .map(banner => ({
          name: banner.title,
          subtitle: banner.subtitle,
          href: banner.href,
          image: banner.image_desktop,
          mobileImage:
            banner.image_mobile ||
            banner.image_desktop,
          textTone: banner.text_tone,
          alt: banner.alt,
        }))).filter(banner => ![
          '/categoria/labret', '/categoria/hastes-e-conectores', '/categoria/hastes-e-topos',
        ].includes(banner.href.replace(/\/$/, '')) && !/labret|hastes e conectores/i.test(banner.name))

  return (
    <div className="serenity-home bg-[#000000] text-[#F2F1ED]">
      {/* Banner principal */}

      {hero && (
        <ManagedHero banner={hero} />
      )}

      {/* Recém-chegados */}

      <section
        aria-labelledby="arrivals-title"
        className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:px-10 md:py-12"
      >
        <div className="mb-5 flex items-center justify-between gap-3 md:mb-7">
          <h2
            id="arrivals-title"
            className="font-display text-[24px] font-medium leading-[1.2] tracking-[-0.025em] sm:text-[28px] md:text-4xl"
          >
            Recém-chegados
          </h2>

          <Link
            href="/categoria/novidades"
            className="shrink-0 border-b border-[#A59A89] pb-1 text-[10px] uppercase tracking-[0.1em] text-[color:var(--home-muted,#746A5B)] transition-colors hover:text-[color:var(--home-text,#25231F)]"
          >
            Ver todos
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-4 md:grid-cols-4 md:gap-6">
          {arrivals.products.map(product => (
            <ProductCard
              key={product.id}
              product={product}
            />
          ))}
        </div>
      </section>


      <StoneColorCarousel colors={colors.map(({ id, name, color }) => ({ id, name, color,image:homeImageMap(banners,'stone')[`/cores/${id}`] }))} />

      {/* Benefícios */}

      <section className="border-y border-[color:var(--home-border,#E5E5E5)] bg-[#101010]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-5 text-center md:grid-cols-4">
          {[
            {
              label: 'Joias em titânio',
              sub: 'Confira a composição de cada peça',
            },
            {
              label: 'Ouro 18K maciço',
              sub: 'Conheça as opções da coleção',
            },
            {
              label: 'Materiais e acabamentos',
              sub: 'Detalhes na página de cada joia',
            },
            {
              label: 'Frete grátis',
              sub: STORE_INFORMATION.retailShipping,
            },
          ].map(item => (
            <div
              key={item.label}
              className="py-2"
            >
              <p className="text-[12px] font-medium uppercase tracking-[0.1em]">
                {item.label}
              </p>

              <p className="mt-0.5 text-[11px] text-[color:var(--home-muted,#6B6B6B)]">
                {item.sub}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Banners de categorias */}

      <CategoryBanners items={categoryBanners} afterEar={<EarMiniBanners images={homeImageMap(banners,'mini')} />} />

      {/* Titânio grau implante */}

      <section
        aria-labelledby="titanium-title"
        className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 md:px-10 md:pb-12 md:pt-2"
      >
        <div className="grid items-center gap-5 md:grid-cols-2 md:gap-10">
          <div className="relative aspect-[5/4] overflow-hidden rounded-[20px] bg-[#EEE8DE] md:rounded-[28px]">
            <Image
              src="/banners/titanio.webp"
              alt="Haste labret e labret esfera de titânio sobre uma superfície metálica"
              fill
              sizes="(max-width: 767px) 92vw, 50vw"
              className="object-cover object-center"
            />
          </div>

          <div className="max-w-lg">
            <p className="mb-2 text-[9px] uppercase tracking-[0.18em] text-[#947B57] md:text-[10px]">
              Conheça o material
            </p>

            <h2
              id="titanium-title"
              className="font-display text-[24px] font-medium leading-[1.2] tracking-[-0.025em] sm:text-[28px] md:text-4xl"
            >
              Titânio grau implante
            </h2>

            <p className="mt-3 text-[13px] leading-6 text-[color:var(--home-muted,#746D63)] md:text-[14px]">
              {TITANIUM_INTRO}
            </p>

            <Link
              href="/materiais/titanio"
              className="mt-4 inline-flex min-h-[44px] items-center gap-4 rounded-full bg-[#292621] px-5 py-3 text-[11px] text-white transition-colors hover:bg-[#504638] md:mt-5 md:text-[12px]"
            >
              Descubra por que é o melhor
              <Arrow />
            </Link>
          </div>
        </div>
      </section>

      <InstagramGrid />
      <MaterialsSection />

      {/* Essenciais */}

      <section
        aria-labelledby="essentials-title"
        className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:px-10 md:py-12"
      >
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 md:mb-7">
          <div>
            <h2
              id="essentials-title"
              className="font-display text-[24px] font-medium leading-[1.2] tracking-[-0.025em] sm:text-[28px] md:text-4xl"
            >
              Essenciais
            </h2>

            <p className="mt-2 max-w-lg text-[12px] leading-6 text-[color:var(--home-muted,#746D63)] md:text-[13px]">
              Para guardar suas joias e acompanhar sua
              rotina de cuidados.
            </p>
          </div>

          <Link
            href="/categoria/after-care"
            className="shrink-0 border-b border-[#A59A89] pb-1 text-[10px] uppercase tracking-[0.1em] text-[color:var(--home-muted,#746A5B)] transition-colors hover:text-[color:var(--home-text,#25231F)]"
          >
            Ver todos
          </Link>
        </div>

        {essentials.products.length ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-4 md:grid-cols-4 md:gap-6">
            {essentials.products.map(product => (
              <ProductCard
                key={product.id}
                product={product}
              />
            ))}
          </div>
        ) : (
          <Link
            href="/categoria/after-care"
            className="inline-flex items-center gap-4 rounded-full bg-[color:var(--home-surface,#F0EBE3)] px-6 py-3.5 text-[12px] text-[color:var(--home-text,#62513A)]"
          >
            Explorar os essenciais
            <Arrow />
          </Link>
        )}
      </section>
    </div>
  )
}
