import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import { adminDatabase } from '@/lib/admin-auth'
import type { ReadyProject } from '@/lib/ready-project'
import { getStoreProduct, storageUrl } from '@/lib/catalog-server'
import { projectSelection } from '@/lib/ready-project'
import ProjectEditor from './ProjectEditor'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const metadata = { title: 'Projetos auriculares | Administração' }
export default async function Page({ searchParams = {} }: { searchParams?: { edit?: string } }) {
  const { db } = await adminDatabase()
  const { data, error } = await db.from('serenity_ready_projects').select('*').order('position').order('id').limit(100)
  if (error && !['42P01', 'PGRST205'].includes(error.code)) throw new Error('ADMIN_PROJECT_READ')
  const projects = (data || []) as ReadyProject[]
  const selected = projects.find(project => project.id === searchParams.edit)
  const draft: ReadyProject = selected || { id: randomUUID(), title: '', description: '', image_path: '', enabled: false, position: 0, version: 0, items: [] }
  const labels: Record<string, string> = {}
  await Promise.all(draft.items.map(async line => {
    const result = await getStoreProduct(line.slug)
    const selection = result ? projectSelection({ product: result.product, ...line }) : null
    labels[`${line.slug}:${line.variationId}`] = result
      ? `${result.product.name}${line.variationId ? ` — ${selection?.name || 'Variação indisponível'}` : ''}`
      : `${line.slug} — indisponível no catálogo`
  }))
  return <main className="mx-auto max-w-6xl px-5 py-10">
    <h1 className="text-3xl">Projetos auriculares</h1>
    <p className="mt-3 text-sm text-[#756B5D]">Cadastre composições para inspirar e comprar. O valor será a soma das joias escolhidas.</p>
    <Link href="/projeto-auricular/prontos" className="mt-4 inline-block text-sm underline">Ver na loja →</Link>
    {error ? <p role="alert" className="mt-8 rounded-2xl bg-amber-50 p-5 text-sm">Falta instalar a tabela de projetos no Supabase. Execute o SQL de projetos e atualize esta página.</p> : <div className="mt-8 grid gap-7 lg:grid-cols-[260px_1fr]">
      <aside><Link href="/admin/projetos" className="inline-block rounded-full bg-[#292621] px-5 py-3 text-sm text-white">+ Novo projeto</Link>
        <ul className="mt-5 space-y-3">{projects.map(project => <li key={project.id}><Link href={`/admin/projetos?edit=${project.id}`} className="block rounded-2xl border border-[#E5DED3] p-4 text-sm"><span className="block">{project.title}</span><span className="mt-1 block text-xs text-[#756B5D]">{project.enabled ? 'Publicado' : 'Rascunho'} · {project.items.length} tipos de joia</span></Link></li>)}</ul>
      </aside>
      <ProjectEditor key={`${draft.id}:${draft.version}`} project={JSON.parse(JSON.stringify(draft))} labels={labels} imageUrl={draft.image_path ? storageUrl(draft.image_path) : ''} />
    </div>}
  </main>
}
