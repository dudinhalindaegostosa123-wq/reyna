import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getStoreCategory } from '@/lib/catalog-server'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Labret: topos, hastes e conectores',
  description: 'Explore topos ou escolha hastes e conectores para compor suas joias. Confira as medidas e a compatibilidade de cada peça.',
}

const sections = [
  {
    slug: 'topos-e-correntes',
    name: 'Topos',
    description: 'Explore os detalhes para o seu projeto e confira a compatibilidade com a haste escolhida.',
  },
  {
    slug: 'hastes-e-conectores',
    name: 'Hastes e conectores',
    description: 'Encontre a base para compor suas joias. Confira comprimento, espessura e sistema de encaixe.',
  },
]

export default async function LabretPage() {
  const categories = await Promise.all(sections.map(section => getStoreCategory(section.slug)))

  return (
    <main className="min-h-[65vh] bg-store-canvas px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <nav aria-label="Caminho da página" className="flex items-center gap-2 text-xs text-store-muted">
          <Link href="/" className="underline underline-offset-4">Início</Link>
          <span aria-hidden="true">/</span><span aria-current="page">Labret</span>
        </nav>
        <p className="mt-9 text-[10px] uppercase tracking-[0.25em] text-store-accent">Componha suas joias</p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl">Labret</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-store-muted">Escolha o que você procura: topos ou hastes e conectores. Antes de combinar as peças, confira as medidas e o sistema de encaixe de cada produto.</p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {sections.map((section, index) => {
            const category = categories[index]
            return (
              <Link key={section.slug} href={`/categoria/${section.slug}`} className="group overflow-hidden rounded-3xl border border-store-border bg-store-surface transition-colors hover:border-[#947B57] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#947B57]">
                {category?.image && <div className="relative aspect-[4/3] overflow-hidden bg-store-raised">
                  <Image src={category.image} alt="" fill sizes="(max-width: 640px) 100vw, 480px" className="object-contain p-6 transition-transform duration-300 motion-safe:group-hover:scale-105" />
                </div>}
                <div className="p-6 sm:p-7">
                  <h2 className="text-xl font-medium">{section.name}</h2>
                  <p className="mt-3 text-sm leading-6 text-store-muted">{section.description}</p>
                  <span className="mt-5 inline-flex min-h-[44px] items-center gap-3 text-sm font-medium">Explorar <span aria-hidden="true">→</span></span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </main>
  )
}
