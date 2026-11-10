import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { MATERIAL_ARTICLES } from '@/lib/material-articles'
import MaterialChoices from '@/components/materials/MaterialChoices'

type Props = { params: { material: string } }
export function generateStaticParams() {
  return MATERIAL_ARTICLES.filter(item => !['titanio', 'bioflex', 'ouro-18k'].includes(item.id))
    .map(item => ({ material: item.id }))
}
export function generateMetadata({ params }: Props): Metadata {
  const article = MATERIAL_ARTICLES.find(item => item.id === params.material)
  return {
    title: article?.title || 'Material não encontrado',
    description: article?.lead,
    alternates: { canonical: `/materiais/${params.material}` },
  }
}
export default function MaterialPage({ params }: Props) {
  const article = MATERIAL_ARTICLES.find(item => item.id === params.material)
  if (!article) notFound()
  return (
    <main className="bg-store-canvas text-store-text">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 md:py-12">
        <nav aria-label="Caminho da página" className="mb-10 flex flex-wrap gap-2 text-xs text-store-muted">
          <Link href="/">Início</Link><span aria-hidden="true">/</span>
          <Link href="/materiais" className="underline underline-offset-4">Materiais</Link>
          <span aria-hidden="true">/</span><span aria-current="page">{article.title}</span>
        </nav>
        <header className="max-w-3xl">
          <p className="mb-4 text-[10px] uppercase tracking-[0.2em] text-store-accent">Conheça o material</p>
          <h1 className="font-display text-4xl leading-tight tracking-tight md:text-6xl">{article.title}</h1>
          {article.lead && <p className="mt-6 text-base leading-8 text-store-muted">{article.lead}</p>}
        </header>
        <article className="mt-8 border-t border-store-border pt-8">
          <div className="max-w-3xl space-y-5 text-sm leading-8 text-store-muted">
            {article.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          </div>
          {article.sections?.map((section, index) => (
            <section key={section.title} aria-labelledby={`material-section-${index}`} className="mt-10 max-w-3xl border-t border-store-border pt-8 md:mt-12">
              <h2 id={`material-section-${index}`} className="font-display text-3xl leading-tight md:text-4xl">{section.title}</h2>
              <div className="mt-5 space-y-5 text-sm leading-8 text-store-muted">
                {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </section>
          ))}
          <section className="mt-10 rounded-3xl border border-store-border bg-store-surface p-6 sm:p-9">
            <h2 className="font-display text-2xl md:text-3xl">Cuidados com sua joia</h2>
            <p className="mt-4 max-w-3xl text-sm leading-8 text-store-muted">{article.care}</p>
          </section>
          <Link href={article.href} className="my-8 inline-flex min-h-11 items-center gap-4 rounded-full bg-store-action px-6 py-3 text-xs text-white">
            {article.label}<span aria-hidden="true">→</span>
          </Link>
        </article>
        <section className="mt-4 border-t border-store-border py-8">
          <h2 className="mb-6 font-display text-2xl">Conheça os outros materiais</h2><MaterialChoices />
        </section>
      </div>
    </main>
  )
}
