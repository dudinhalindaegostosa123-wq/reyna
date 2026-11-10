import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Piercings para Boca',
  description:
    'Explore joias para língua, lábio superior e lábio inferior no catálogo Serenity.',
}

const REGIONS = [
  {
    name: 'Língua',
    image: '/banners/lingua.png',
    href: '/categoria/boca-lingua',
  },
  {
    name: 'Lábio superior',
    image: '/banners/labio-superior.png',
    href: '/categoria/boca-labio-superior',
  },
  {
    name: 'Lábio inferior',
    image: '/banners/labio-inferior.png',
    href: '/categoria/boca-labio-inferior',
  },
]

export default function MouthPage() {
  return (
    <div className="min-h-screen bg-store-canvas text-store-text">
      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 md:px-10 md:pt-7">
        <nav
          aria-label="Caminho da página"
          className="flex items-center gap-2 text-[11px] text-store-muted"
        >
          <Link href="/" className="hover:text-store-text">
            Início
          </Link>

          <span aria-hidden="true">/</span>

          <span aria-current="page" className="text-store-text">
            Boca
          </span>
        </nav>
      </div>

      <section
        aria-labelledby="mouth-regions-title"
        className="mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6 md:px-10 md:pb-10 md:pt-8"
      >
        <div className="mb-6 flex items-end justify-between gap-4 md:mb-7">
          <h1
            id="mouth-regions-title"
            className="font-display text-3xl font-medium tracking-[-0.025em] md:text-4xl"
          >
            Explore por região
          </h1>
        </div>

        <ul className="mx-auto grid max-w-3xl grid-cols-3 gap-3 sm:gap-6 md:gap-12">
          {REGIONS.map((region) => (
            <li key={region.href} className="min-w-0">
              <Link
                href={region.href}
                prefetch={false}
                className="group block rounded-2xl text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B8986A]"
              >
                <div className="mx-auto w-full max-w-[190px] rounded-full border border-transparent p-1 transition-colors duration-300 group-hover:border-[#BDA98B] group-focus-visible:border-[#BDA98B]">
                  <div className="relative aspect-square overflow-hidden rounded-full bg-store-raised">
                    <Image
                      src={region.image}
                      alt={`Piercing na região ${region.name}`}
                      fill
                      sizes="(max-width: 639px) 29vw, 190px"
                      className="object-cover object-center transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
                    />
                  </div>
                </div>

                <h2 className="mt-3 font-display text-[13px] font-medium leading-snug transition-colors group-hover:text-store-accent sm:text-[18px]">
                  {region.name}
                </h2>

                <span
                  aria-hidden="true"
                  className="mt-2 inline-flex text-store-accent"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none"
                  >
                    <path d="M4 12h15M13 5l7 7-7 7" />
                  </svg>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-7 max-w-2xl text-[11px] leading-relaxed text-store-muted">
          Cada anatomia pede uma escolha. Confirme as medidas
          e a adequação das joias com seu profissional.
        </p>
      </section>
    </div>
  )
}
