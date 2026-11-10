import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'

import { getStoreCategories } from '@/lib/catalog-server'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Piercings e Brincos para Orelha',
  description:
    'Explore as regiões da orelha, encontre brincos e descubra as joias da Lunarity para seu projeto auricular.',
}

interface EarCategory {
  name: string
  term: string
  image: string
  aliases: string[]
  fallbackHref?: string
}

const REGIONS: EarCategory[] = [
  {
    name: 'Conch',
    term: 'conch',
    image: '/banners/lunarity-orelha/conch.webp',
    aliases: ['conch', 'concha', 'orelha-conch'],
  },
  {
    name: 'Daith',
    term: 'daith',
    image: '/banners/lunarity-orelha/daith.webp',
    aliases: ['daith', 'orelha-daith'],
  },
  {
    name: 'Flat',
    term: 'flat',
    image: '/banners/lunarity-orelha/flat.webp',
    aliases: ['flat', 'orelha-flat'],
  },
  {
    name: 'Hélix',
    term: 'helix',
    image: '/banners/lunarity-orelha/helix.webp',
    aliases: ['helix', 'orelha-helix'],
  },
  {
    name: 'Lóbulo',
    term: 'lobulo',
    image: '/banners/lunarity-orelha/lobulo.webp',
    aliases: ['lobulo', 'lobulos', 'orelha-lobulo'],
  },
  {
    name: 'Tragus',
    term: 'tragus',
    image: '/banners/lunarity-orelha/tragus.webp',
    aliases: ['tragus', 'orelha-tragus'],
  },
  {
    name: 'Transversal',
    term: 'transversal',
    image: '/banners/lunarity-orelha/transversal.webp',
    aliases: [
      'transversal',
      'industrial',
      'orelha-transversal',
    ],
  },
  {
    name: 'Brincos',
    term: 'brincos',
    image: '/banners/lunarity-orelha/brincos.webp',
    aliases: [
      'brincos',
      'brinco',
      'orelha-brincos',
      'orelha-brinco',
    ],
    fallbackHref: '/categoria/brincos',
  },
]

const PROJECT_IMAGES = [
  {
    image: '/banners/lunarity-orelha/projeto-verde.webp',
    position: 'md:translate-y-4',
  },
  {
    image: '/banners/lunarity-orelha/projeto-dourado.webp',
    position: 'md:-translate-y-4',
  },
  {
    image: '/banners/lunarity-orelha/projeto-azul.webp',
    position: 'md:translate-y-4',
  },
]

function categoryName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bpiercings?\b/g, ' ')
    .replace(/\b(para|de|da|do|na|no)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export default async function EarPage() {
  const categories = await getStoreCategories()

  return (
    <div className="min-h-screen bg-store-canvas text-store-text">
      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 md:px-10 md:pt-7">
        <nav
          aria-label="Caminho da página"
          className="flex items-center gap-2 text-[11px] text-store-muted"
        >
          <Link
            href="/"
            className="transition-colors hover:text-store-text"
          >
            Início
          </Link>

          <span aria-hidden="true">/</span>

          <span
            aria-current="page"
            className="text-store-text"
          >
            Orelha
          </span>
        </nav>
      </div>

      <section
        aria-labelledby="ear-regions-title"
        className="mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6 md:px-10 md:pb-10 md:pt-8"
      >
        <p className="mb-3 text-[10px] uppercase tracking-[0.22em] text-[#A99475]">Sua composição começa aqui</p>
        <div className="mb-6 flex items-end justify-between gap-4 md:mb-7">
          <h1
            id="ear-regions-title"
            className="font-display text-3xl font-light tracking-[-0.025em] md:text-4xl"
          >
            Explore por região
          </h1>

          <Link
            href="/categoria/todos"
            className="shrink-0 border-b border-[#A59A89] pb-1 text-[10px] uppercase tracking-[0.1em] text-store-muted transition-colors hover:border-store-selected hover:text-store-text"
          >
            Ver todas
          </Link>
        </div>

        <ul className="grid grid-cols-4 gap-x-3 gap-y-5 sm:gap-x-5 lg:grid-cols-8 lg:gap-x-5">
          {REGIONS.map(region => {
            const category = categories.find(item =>
              region.aliases.includes(item.slug) ||
              region.aliases.includes(
                categoryName(item.name)
              )
            )

            const href = category
              ? `/categoria/${category.slug}`
              : region.fallbackHref ||
                `/busca?q=${encodeURIComponent(region.term)}`

            return (
              <li key={region.term} className="min-w-0">
                <Link
                  href={href}
                  prefetch={false}
                  className="group block overflow-hidden rounded-xl border border-[#39352E] bg-gradient-to-b from-[#191917] to-[#0B0B0B] pb-3 text-center transition-colors hover:border-[#947B57] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B8986A]"
                >
                  <div className="mx-auto w-full p-1.5">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-store-raised">
                      <Image
                        src={region.image}
                        alt={
                          region.term === 'brincos'
                            ? 'Brincos para orelha'
                            : `Piercing na região ${region.name} da orelha`
                        }
                        fill
                        sizes="(max-width: 639px) 22vw, 150px"
                        className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
                        style={region.term === 'daith' ? { scale: '-1 1' } : undefined}
                      />
                    </div>
                  </div>

                  <h2 className="mt-2 whitespace-nowrap font-display text-[12px] font-light transition-colors group-hover:text-[#C5AD86] sm:text-[16px]">
                    {region.name}
                  </h2>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <section
        data-ear-project-entry
        aria-labelledby="ear-project-title"
        className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 md:px-10 md:pb-10"
      >
        <div className="relative isolate overflow-hidden rounded-xl border border-[#39352E] bg-gradient-to-br from-[#191917] via-[#0E0E0D] to-black px-6 py-8 sm:px-8 md:px-12 md:py-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-28 -z-10 h-80 w-80 rounded-full bg-[#947B57]/10 blur-3xl"
          />

          <div className="grid items-center gap-7 md:grid-cols-2 md:gap-10">
            <div className="max-w-lg">
              <p className="mb-4 text-[10px] uppercase tracking-[0.22em] text-[#A99475]">Feito do seu jeito</p>
              <h2
                id="ear-project-title"
                className="max-w-sm text-[36px] font-light leading-[1.08] tracking-[-0.025em] sm:text-4xl lg:text-5xl"
                style={{fontFamily: 'var(--font-cormorant), Georgia, serif'}}
              >
                Monte seu projeto auricular
              </h2>

              <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-store-muted md:text-[14px]">
                Combine regiões, cores e joias do nosso
                catálogo. Salve suas ideias em uma mensagem
                para a equipe Lunarity.
              </p>

              <Link
                href="/projeto-auricular"
                className="mt-6 inline-flex items-center justify-center gap-5 rounded-lg border border-[#947B57]/50 bg-[#171511] px-6 py-3.5 text-[11px] tracking-[0.04em] text-[#FAFAF8] transition-colors hover:border-[#C5AD86] hover:bg-[#242019] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#947B57]"
              >
                Começar meu projeto

                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  className="h-4 w-4"
                >
                  <path d="M4 12h15M13 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            <div
              aria-hidden="true"
              className="flex items-center justify-center gap-2 py-5 sm:gap-3 md:py-7"
            >
              {PROJECT_IMAGES.map(item => (
                <div
                  key={item.image}
                  className={`relative aspect-[3/4] w-[31%] max-w-[170px] overflow-hidden rounded-xl border border-[#75644C] shadow-[0_12px_32px_rgba(0,0,0,0.4)] ${item.position}`}
                >
                  <Image
                    src={item.image}
                    alt=""
                    fill
                    sizes="(max-width: 767px) 28vw, 170px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-5 max-w-2xl text-[11px] leading-relaxed text-store-muted">
          Cada anatomia pede uma escolha. Confirme as medidas
          e a adequação das joias com seu profissional.
        </p>
      </section>
    </div>
  )
}
