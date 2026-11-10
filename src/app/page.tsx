import { TITANIUM_INTRO } from '@/lib/titanium-copy'
import { STORE_INFORMATION } from '@/lib/store-information'
import { bannerPlacement,homeImageMap } from '@/lib/home-images'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'

import { getSiteBanners } from '@/lib/site-banners'
import { getStoneCollections } from '@/lib/stone-collections-server'
import StoneColorCarousel from '@/components/home/StoneColorCarousel'
import { getStorePage } from '@/lib/catalog-server'
import type { SiteBanner } from '@/lib/banner-ui'

import ManagedHero from '@/components/home/ManagedHero'
import ProductCard from '@/components/ui/ProductCard'
import EarMiniBanners from '@/components/home/EarMiniBanners'
import CategoryDiscoveryGrid from '@/components/home/CategoryDiscoveryGrid'
import InstagramGrid from '@/components/home/InstagramGrid'
import MaterialsSection from '@/components/home/MaterialsSection'

// Public fetches keep their tagged cache; customer access still makes rendering dynamic.
export const revalidate = 60
export const maxDuration = 60

const FALLBACK_HERO: SiteBanner = {
  id: 'lunarity-hero',
  slot: 'hero',
  title: 'Cada fase, um novo brilho.',
  subtitle: 'Piercings de titânio para composições que são a sua cara.',
  href: '/categoria/todos',
  cta: 'Encontre sua joia',
  alt: 'Composição ilustrativa de joias prateadas sobre pedra escura',
  image_desktop: '/banners/lunarity-hero.webp',
  image_mobile: '/banners/lunarity-hero-mobile.webp',
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

function ProductPlaceholders() {
  return <div aria-label="Carregando joias" role="status" className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
    {[0, 1, 2, 3].map(id => <div key={id} aria-hidden="true"><div className="aspect-square rounded-sm bg-[#111111]" /><div className="mt-3 h-4 w-3/4 bg-[#111111]" /><div className="mt-2 h-4 w-1/3 bg-[#111111]" /></div>)}
  </div>
}

async function HomeProducts({ category }: { category: string }) {
  const { products } = await getStorePage({ category, perPage: 4 })
  if (!products.length && category === 'after-care') {
    return <Link href="/categoria/after-care" className="inline-flex items-center gap-4 rounded-full bg-[color:var(--home-surface,#F0EBE3)] px-6 py-3.5 text-[12px] text-[color:var(--home-text,#62513A)]">Explorar os essenciais <Arrow /></Link>
  }
  return <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-4 md:grid-cols-4 md:gap-6">
    {products.map(product => <ProductCard key={product.id} product={product} />)}
  </div>
}

async function HomeColors({ banners }: { banners: SiteBanner[] | null }) {
  const colors = await getStoneCollections()
  const images = homeImageMap(banners, 'stone')
  return <StoneColorCarousel colors={colors.map(({ id, name, color }) => ({ id, name, color, image: images[`/cores/${id}`] }))} />
}

export default async function HomePage() {
  const banners = await getSiteBanners()

  const useDefaultBanners = banners === null || banners.length === 0

  const configuredHero = banners?.find(banner => banner.slot === 'hero')
  const legacyCampaign = configuredHero && /swarovski/i.test([
    configuredHero.title, configuredHero.subtitle, configuredHero.href, configuredHero.image_desktop,
  ].join(' '))
  const hero = configuredHero && !legacyCampaign ? configuredHero : FALLBACK_HERO

  const categoryBanners = (useDefaultBanners
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

        <Suspense fallback={<ProductPlaceholders />}>
          <HomeProducts category="novidades" />
        </Suspense>
      </section>


      {/* Categorias em uma composição mais compacta, mantendo os banners existentes. */}
      <CategoryDiscoveryGrid items={categoryBanners} />

      {categoryBanners.some(item => /orelha/i.test(item.name)) && <section aria-labelledby="ear-details-title" className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6 md:px-10 md:pb-14">
        <div className="lunarity-ear-heading"><span className="lunarity-home-sparkle" aria-hidden="true">✧</span><h2 id="ear-details-title" className="font-display text-xl sm:text-2xl">Os detalhes fazem a composição.</h2><span className="lunarity-home-rule" aria-hidden="true" /></div>
        <div className="lunarity-ear-grid"><EarMiniBanners images={homeImageMap(banners,'mini')} /></div>
      </section>}

      {/* 5. Materiais — depois do grid de detalhes. */}
      <MaterialsSection />

      {/* 6. Inspiração Lunarity e Essenciais. */}
      <aside className="mx-auto max-w-7xl px-4 pt-2 sm:px-6 md:px-10" aria-label="Inspiração Lunarity"><div className="lunarity-home-note"><div><p className="lunarity-home-eyebrow">LUNARITY · DO SEU JEITO</p><p className="font-display text-xl tracking-tight sm:text-2xl">Uma joia muda o detalhe.<br className="sm:hidden" /> A combinação conta a sua história.</p></div><Link href="/categoria/todos" className="lunarity-discovery-all">Encontrar minha próxima joia <Arrow /></Link><span className="lunarity-home-note-orbit" aria-hidden="true" /></div></aside>

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

        <Suspense fallback={<ProductPlaceholders />}>
          <HomeProducts category="after-care" />
        </Suspense>
      </section>

      <Suspense fallback={null}>
        <HomeColors banners={banners} />
      </Suspense>

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


      {STORE_INFORMATION.instagram && <InstagramGrid />}

      <div className="lunarity-home-divider mx-auto max-w-7xl px-4 sm:px-6 md:px-10" aria-hidden="true"><span /><span>✦</span><span /></div>

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
    </div>
  )
}
