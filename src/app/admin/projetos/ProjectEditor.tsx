'use client'
import { useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { saveReadyProject, searchProjectProducts } from './actions'
import type { ReadyProject } from '@/lib/ready-project'

type SearchProduct = Awaited<ReturnType<typeof searchProjectProducts>>['products'][number]
const input = 'min-h-[44px] w-full rounded-xl border border-[#DCD4C8] bg-white px-3 py-2 text-sm'
const button = 'min-h-[44px] rounded-full border border-[#DCD4C8] px-5 py-2 text-sm disabled:opacity-40'

export default function ProjectEditor({ project, labels, imageUrl }: { project: ReadyProject; labels: Record<string, string>; imageUrl: string }) {
  const router = useRouter()
  const [names, setNames] = useState(labels)
  const [items, setItems] = useState(project.items)
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<SearchProduct[]>([])
  const [message, setMessage] = useState('')
  const [pending, start] = useTransition()
  return <form action={form => start(async () => {
    try {
      const result = await saveReadyProject(form)
      setMessage(result.error || 'Projeto salvo.')
      if (!result.error) { router.push(`/admin/projetos?edit=${result.id}`); router.refresh() }
    } catch { setMessage('Não foi possível salvar agora. Confira a lista antes de tentar novamente.') }
  })} className="space-y-5 rounded-3xl border border-[#E5DED3] bg-white p-6">
    <input type="hidden" name="id" value={project.id} /><input type="hidden" name="version" value={project.version} />
    <input type="hidden" name="items" value={JSON.stringify(items)} />
    <h2 className="text-xl">{project.version ? 'Editar projeto' : 'Novo projeto'}</h2>
    <label className="block text-sm">Nome do projeto<input name="title" required maxLength={120} defaultValue={project.title} className={`${input} mt-2`} /></label>
    <label className="block text-sm">Descrição<textarea name="description" maxLength={2000} defaultValue={project.description} rows={4} className={`${input} mt-2`} /></label>
    {imageUrl && <Image src={imageUrl} alt={project.title} width={320} height={400} className="h-60 w-48 rounded-2xl object-cover" />}
    <label className="block text-sm">Foto da composição {project.image_path && '(já possui foto; envie outra para substituir)'}<input type="file" name="image" accept="image/jpeg,image/png,image/webp" className={`${input} mt-2`} /><span className="mt-1 block text-xs text-[#756B5D]">JPG, PNG ou WebP, até 3 MB.</span></label>
    <label className="block text-sm">Ordem na página<input name="position" type="number" min={0} max={10000} defaultValue={project.position} className={`${input} mt-2`} /></label>
    <fieldset className="space-y-4 rounded-2xl border border-[#E5DED3] p-4"><legend className="px-2">Joias incluídas</legend>
      <p className="text-sm text-[#756B5D]">Busque pelo nome ou código da joia. Escolha a variação exata usada na composição, incluindo medida e cor.</p>
      <div className="flex gap-2"><input aria-label="Buscar joia" placeholder="Nome ou código da joia" value={query} onChange={e => setQuery(e.target.value)} className={input} /><button type="button" disabled={pending} className={button} onClick={() => start(async () => {
        try { const result = await searchProjectProducts(query); setProducts(result.products); setMessage(result.error || (!result.products.length ? 'Nenhuma joia encontrada.' : '')) }
        catch { setMessage('Não foi possível buscar agora.') }
      })}>Buscar</button></div>
      <div className="max-h-80 space-y-3 overflow-y-auto">{products.map(product => <div key={product.id} className="rounded-xl bg-[#F6F3EE] p-3">
        <p className="text-sm">{product.name}</p>
        {product.product_type === 'variable' ? <select aria-label={`Variação de ${product.name}`} value="" className={`${input} mt-2`} disabled={pending} onChange={e => {
          if (e.target.value && !items.some(item => item.slug === product.slug && item.variationId === e.target.value)) {
            setNames({ ...names, [`${product.slug}:${e.target.value}`]: `${product.name} — ${product.variations.find(variant => variant.id === e.target.value)?.name}` })
            setItems([...items, { slug: product.slug, variationId: e.target.value, quantity: 1 }])
          }
        }}><option value="">Escolher variação para adicionar…</option>{product.variations.map(variant => <option key={variant.id} value={variant.id}>{variant.name}</option>)}</select>
          : <button type="button" disabled={pending || items.some(item => item.slug === product.slug)} className={`${button} mt-2`} onClick={() => { setNames({ ...names, [`${product.slug}:`]: product.name }); setItems([...items, { slug: product.slug, variationId: '', quantity: 1 }]) }}>Adicionar joia</button>}
      </div>)}</div>
      {items.map((item, index) => <div key={`${item.slug}:${item.variationId}`} className="rounded-xl border border-[#E5DED3] p-3">
        <p className="break-words text-sm">{names[`${item.slug}:${item.variationId}`] || item.slug}</p>
        <div className="mt-3 flex items-center gap-3"><label className="text-sm">Quantidade<input type="number" min={1} max={100} value={item.quantity} className={`${input} ml-2 !w-20`} onChange={e => setItems(items.map((line, i) => i === index ? { ...line, quantity: Number(e.target.value) } : line))} /></label>
          <button type="button" className={button} onClick={() => setItems(items.filter((_, i) => i !== index))}>Remover</button></div>
      </div>)}
      {!items.length && <p className="text-sm text-[#756B5D]">Nenhuma joia adicionada.</p>}
      <p className="text-sm text-[#756B5D]">O preço é calculado automaticamente a partir dos preços atuais das joias, conforme o acesso do comprador.</p>
    </fieldset>
    <label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" name="enabled" defaultChecked={project.enabled} />Publicar na loja</label>
    <p role="status" className="text-sm">{message}</p>
    <button disabled={pending} className="min-h-[48px] rounded-full bg-[#292621] px-6 text-sm text-white disabled:opacity-40">{pending ? 'Aguarde…' : 'Salvar projeto'}</button>
  </form>
}
