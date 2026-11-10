import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { publishedProjects } from '@/lib/ready-project-server'
import { storageUrl } from '@/lib/catalog-server'
import { STORE_INFORMATION } from '@/lib/store-information'
import EarProjectClient from './EarProjectClient'

export const metadata: Metadata = {
  title: 'Monte seu projeto auricular',
  description: 'Escolha regiões, cores e estilos e monte suas preferências com joias da Lunarity.',
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export default async function EarProjectPage() {
  const projects = await publishedProjects()
  return <>
    {projects.length > 0 && <section className="bg-store-raised px-5 py-12 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs uppercase tracking-[0.2em] text-store-accent">Curadoria Lunarity</p>
        <h1 className="mt-3 font-display text-4xl">Projetos prontos</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-store-muted">Inspire-se nas nossas composições ou compre todas as joias do seu projeto favorito. O valor é a soma das peças escolhidas.</p>
        <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{projects.slice(0, 6).map(project => <Link key={project.id} href={`/projeto-auricular/prontos?projeto=${project.id}`} className="overflow-hidden rounded-3xl border border-store-border bg-store-surface">
          {project.image_path && <Image src={storageUrl(project.image_path)} alt={project.title} width={600} height={750} className="aspect-[4/5] w-full object-cover" />}
          <div className="p-5"><h2 className="font-display text-2xl">{project.title}</h2><p className="mt-3 text-sm underline">Ver joias e comprar projeto →</p></div>
        </Link>)}</div>
        <Link href="/projeto-auricular/prontos" className="mt-6 inline-block text-sm underline">Ver todos os projetos →</Link>
        <a href="#montar-projeto" className="ml-6 mt-6 inline-block text-sm underline">Montar meu projeto ↓</a>
      </div>
    </section>}
    <div id="montar-projeto"><EarProjectClient whatsapp={STORE_INFORMATION.whatsapp.replace(/^https:\/\/wa.me\//, '')} /></div>
  </>
}
