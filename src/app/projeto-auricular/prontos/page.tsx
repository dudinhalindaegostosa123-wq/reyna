import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { publishedProjects, projectPieces } from '@/lib/ready-project-server'
import { projectTotal, projectSelection } from '@/lib/ready-project'
import { storageUrl } from '@/lib/catalog-server'
import { formatPrice } from '@/lib/data'
import ProjectPurchase from './ProjectPurchase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const metadata = { title: 'Projetos auriculares prontos' }

export default async function Page({ searchParams = {} }: { searchParams?: { projeto?: string } }) {
  const projects = await publishedProjects()
  const selected = searchParams.projeto ? projects.find(project => project.id === searchParams.projeto) : null
  if (searchParams.projeto && !selected) notFound()
  const detail = selected ? await projectPieces(selected) : null
  const total = detail?.complete ? projectTotal(detail.pieces) : null
  return <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
    <Link href="/projeto-auricular" className="text-sm text-store-muted underline">← Monte seu projeto</Link>
    <p className="mt-8 text-xs uppercase tracking-[0.2em] text-store-accent">Curadoria Lunarity</p>
    <h1 className="mt-3 font-display text-4xl sm:text-5xl">{selected?.title || 'Projetos prontos para inspirar'}</h1>
    {selected && detail ? <>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {selected.image_path && <Image src={storageUrl(selected.image_path)} alt={selected.title} width={1000} height={1200} className="aspect-[4/5] w-full rounded-3xl object-cover" />}
        <div><p className="whitespace-pre-line leading-relaxed text-store-muted">{selected.description}</p>
          <p className="mt-6 text-xs uppercase tracking-widest">Projeto completo</p>
          <p className="mt-2 text-3xl">{total === null ? 'Preço em conferência' : formatPrice(total)}</p>
          <p className="mt-3 text-sm text-store-muted">Valor correspondente à soma das joias abaixo. Cada peça será adicionada individualmente ao carrinho.</p>
          <ProjectPurchase pieces={detail.pieces} complete={detail.complete} />
          <h2 className="mt-8 text-xl">Joias deste projeto</h2>
          <ul className="mt-4 divide-y divide-store-border">{detail.pieces.map((piece, index) => {
            const selection = projectSelection(piece)
            return <li key={index} className="py-4"><Link className="underline" href={`/produto/${piece.product.slug}`}>{piece.quantity} × {piece.product.name}</Link>
              {piece.variationId && <p className="mt-1 text-sm text-store-muted">{selection?.name || 'Variação indisponível'}</p>}
              <p className="mt-2 text-sm">{selection?.priceAvailable ? formatPrice(selection.price * piece.quantity) : 'Preço em conferência'}</p></li>
          })}</ul>
          {!detail.complete && <p role="alert" className="text-sm text-store-warning">Uma ou mais joias desta composição não estão disponíveis no catálogo.</p>}
        </div>
      </div>
      <Link href="/projeto-auricular/prontos" className="mt-10 inline-block underline">Ver todos os projetos</Link>
    </> : <>
      <p className="mt-4 max-w-2xl text-store-muted">Conheça as composições da nossa curadoria. Inspire-se nos detalhes ou escolha todas as joias para comprar o conjunto.</p>
      {!projects.length && <p className="mt-10 text-store-muted">Em breve, novas composições por aqui. Enquanto isso, monte suas preferências no simulador.</p>}
      <div className="mt-10 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">{projects.map(project => <Link key={project.id} href={`/projeto-auricular/prontos?projeto=${project.id}`} className="overflow-hidden rounded-3xl border border-store-border bg-store-surface">
        {project.image_path && <Image src={storageUrl(project.image_path)} alt={project.title} width={600} height={750} className="aspect-[4/5] w-full object-cover" />}
        <div className="p-6"><h2 className="font-display text-2xl">{project.title}</h2><p className="mt-2 line-clamp-2 text-sm text-store-muted">{project.description}</p><span className="mt-5 inline-block text-sm underline">Ver composição e comprar →</span></div>
      </Link>)}</div>
    </>}
  </main>
}
