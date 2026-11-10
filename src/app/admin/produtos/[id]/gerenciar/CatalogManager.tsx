'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Image from 'next/image'
import type { ProductBundle } from '@/lib/admin-product-editor'
import { manageProduct } from '../../catalog-actions'

export interface CatalogMedia {
  id: string
  media_type: string
  storage_path: string | null
  thumbnail_path: string | null
  youtube_id: string | null
  variant_id: string | null
  alt_text: string
  position: number
}

const field = 'mt-2 min-h-[44px] min-w-0 w-full rounded-xl border border-[#DFD7CB] bg-white px-3 py-2 text-base sm:text-sm'
const card = 'rounded-3xl border border-[#E5DED3] bg-white p-5 sm:p-7'

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return <button disabled={pending} className="min-h-[40px] rounded-full bg-[#292621] px-5 py-2 text-xs text-white disabled:opacity-50">{pending ? 'Salvando…' : label}</button>
}

function ActionForm({ id, operation, label, children, confirm = false }: { id: string; operation: string; label: string; children?: ReactNode; confirm?: boolean }) {
  const [state, action] = useFormState(manageProduct.bind(null, id, operation), { error: '' })
  return <form action={action} className="space-y-3" onSubmit={event => { if (confirm && !window.confirm('Remover esta mídia da galeria do produto?')) event.preventDefault() }}>
    {children}
    {state.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}
    <Submit label={label} />
  </form>
}

function Input({ name, label, value = '', required = false }: { name: string; label: string; value?: string | number | null; required?: boolean }) {
  return <label className="block text-xs text-[#625B51]">{label}<input name={name} defaultValue={value ?? ''} maxLength={300} required={required} className={field} /></label>
}

function AttributeFields({ initial = {} }: { initial?: Record<string, string> }) {
  const [pairs, setPairs] = useState<[string, string][]>(Object.keys(initial).length ? Object.entries(initial) : [['', '']])

  function update(index: number, part: 0 | 1, value: string) {
    setPairs(old => old.map((pair, i) => i === index ? part === 0 ? [value, pair[1]] : [pair[0], value] : pair))
  }

  return <div className="rounded-2xl bg-[#F8F5EF] p-4">
    <p className="mb-3 text-xs font-medium">Atributos · Exemplo: Cor → Azul; Medida → 8 mm</p>
    <input type="hidden" name="attributes" value={JSON.stringify(pairs)} />

    <div className="space-y-3">
      {pairs.map((pair, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
        <input aria-label={`Nome do atributo ${index + 1}`} placeholder="Cor" value={pair[0]} onChange={e => update(index, 0, e.target.value)} maxLength={120} required className={field} />
        <input aria-label={`Valor do atributo ${index + 1}`} placeholder="Azul" value={pair[1]} onChange={e => update(index, 1, e.target.value)} maxLength={180} required className={field} />
        <button type="button" aria-label={`Remover atributo ${index + 1}`} disabled={pairs.length === 1} onClick={() => setPairs(old => old.filter((_, i) => i !== index))} className="mt-2 min-h-[44px] px-2 text-lg disabled:opacity-30">×</button>
      </div>)}
    </div>

    <button type="button" disabled={pairs.length >= 20} onClick={() => setPairs(old => [...old, ['', '']])} className="mt-4 text-xs underline underline-offset-4 disabled:opacity-40">+ Outro atributo</button>
  </div>
}

function VariantSelect({ bundle, current = '' }: { bundle: ProductBundle; current?: string }) {
  return <label className="block text-xs text-[#625B51]">Vincular foto a
    <select name="variant_id" defaultValue={current} className={field}>
      <option value="">Produto geral</option>
      {bundle.variants.map(v => <option key={v.id} value={v.id}>{v.name} · {Object.values((v.attributes || {}) as Record<string, string>).join(' / ')}</option>)}
    </select>
  </label>
}

export default function CatalogManager({ bundle, media, storageUrl, requestId }: { bundle: ProductBundle; media: CatalogMedia[]; storageUrl: string; requestId: string }) {
  const id = String(bundle.product.id)
  const photos = media.filter(item => item.media_type === 'image')
  const videos = media.filter(item => item.media_type === 'youtube')
  const supported = ['simple', 'variable'].includes(String(bundle.product.product_type))
  const imageUrl = (path: string) => `${storageUrl}/storage/v1/object/public/produtos/${path.split('/').map(encodeURIComponent).join('/')}`

  return <div className="space-y-5">
    <section className={card}>
      <h2 className="mb-4 text-lg font-medium">Categorias e organização</h2>

      <ActionForm id={id} operation="organize" label="Salvar organização">
        <Input name="material" label="Material" value={String(bundle.product.material || '')} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs text-[#625B51]">Categorias · Uma por linha
            <textarea name="categories" rows={5} maxLength={16000} defaultValue={((bundle.product.categories || []) as string[]).join('\n')} className={field} />
          </label>
          <label className="block text-xs text-[#625B51]">Tags / termos de busca · Um por linha
            <textarea name="tags" rows={5} maxLength={16000} defaultValue={((bundle.product.tags || []) as string[]).join('\n')} className={field} />
          </label>
        </div>

        <p className="text-[11px] leading-relaxed text-[#81796C]">Use os mesmos nomes das categorias existentes para manter a peça nas regiões e filtros da loja. As categorias são usadas para organizar os produtos.</p>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="featured" defaultChecked={bundle.product.featured === true} />Marcar como destaque</label>
      </ActionForm>
    </section>

    <section className={card}>
      <h2 className="mb-3 text-lg font-medium">Fotos ({photos.length})</h2>
      <p className="mb-5 text-xs leading-relaxed text-[#81796C]">A capa é a primeira foto geral do produto. As fotos vinculadas a uma variação acompanham aquela opção. Use JPG, PNG ou WebP de até 3 MB por foto.</p>

      <ActionForm id={id} operation="image_add" label="Enviar foto">
        <label className="block text-xs">Escolher foto
          <input name="image" type="file" accept="image/jpeg,image/png,image/webp" required className={`${field} file:mr-3 file:rounded-full file:border-0 file:bg-[#F0EBE3] file:px-3 file:py-2 file:text-xs`} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="alt_text" label="Descrição da foto · Opcional" />
          <VariantSelect bundle={bundle} />
        </div>
      </ActionForm>

      <p className="mt-4 text-[11px] text-[#81796C]">O original é guardado, e as versões da loja e miniaturas são preparadas automaticamente.</p>

      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        {photos.map(photo => <article key={photo.id} className="min-w-0 rounded-2xl border border-[#E5DED3] p-4">
          {photo.storage_path && <div className="relative mb-4 aspect-square overflow-hidden rounded-xl bg-[#FAFAF8]">
            <Image src={imageUrl(photo.thumbnail_path || photo.storage_path)} alt={photo.alt_text || bundle.product.name} fill sizes="(max-width: 640px) 85vw, 400px" className="object-contain" />
          </div>}

          <p className="mb-3 text-[11px] text-[#81796C]">{photo.variant_id ? 'Foto de variação' : 'Foto geral do produto'}</p>

          <div className="space-y-4">
            {!photo.variant_id && <ActionForm id={id} operation="media_cover" label="Definir como capa">
              <input type="hidden" name="media_id" value={photo.id} />
            </ActionForm>}

            <div className="flex flex-wrap gap-2">
              {[['up', '← Antes'], ['down', 'Depois →']].map(([direction, label]) => <ActionForm key={direction} id={id} operation="media_move" label={label}>
                <input type="hidden" name="media_id" value={photo.id} />
                <input type="hidden" name="direction" value={direction} />
              </ActionForm>)}
            </div>

            <ActionForm id={id} operation="media_assign" label="Salvar vínculo">
              <input type="hidden" name="media_id" value={photo.id} />
              <VariantSelect bundle={bundle} current={photo.variant_id || ''} />
            </ActionForm>

            <ActionForm id={id} operation="media_remove" label="Remover da galeria" confirm>
              <input type="hidden" name="media_id" value={photo.id} />
            </ActionForm>
          </div>
        </article>)}
      </div>

      {!photos.length && <p className="mt-6 text-sm text-[#81796C]">Nenhuma foto cadastrada ainda.</p>}
    </section>

    <section className={card}>
      <h2 className="mb-3 text-lg font-medium">Vídeo do produto</h2>
      <p className="mb-5 text-xs text-[#81796C]">Adicione um link do YouTube ou Shorts. O vídeo será exibido dentro da página do produto. Esta versão permite um vídeo por produto.</p>

      {videos.map(video => <div key={video.id} className="mb-5 rounded-2xl bg-[#F8F5EF] p-4">
        <a href={`https://www.youtube.com/watch?v=${video.youtube_id}`} target="_blank" rel="noopener noreferrer" className="mb-4 block break-all text-xs underline">Conferir vídeo: {video.youtube_id}</a>
        <ActionForm id={id} operation="media_remove" label="Remover vídeo" confirm>
          <input type="hidden" name="media_id" value={video.id} />
        </ActionForm>
      </div>)}

      {!videos.length && <ActionForm id={id} operation="youtube_add" label="Adicionar vídeo">
        <input type="hidden" name="request_id" value={requestId} />
        <Input name="youtube" label="Link do YouTube / Shorts" required />
      </ActionForm>}
    </section>

    {supported && <section className={card}>
      <h2 className="mb-3 text-lg font-medium">Adicionar variação</h2>
      <p className="mb-5 text-xs leading-relaxed text-[#81796C]">Cadastre cada combinação disponível, por exemplo Cor: Azul e Medida: 8 mm. Ao adicionar a primeira variação, o produto passa a usar as opções e os preços das variações.</p>

      <ActionForm id={id} operation="variant_add" label="Adicionar variação">
        <input type="hidden" name="request_id" value={requestId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="name" label="Nome da variação" value={bundle.product.name} required />
          <Input name="sku" label="SKU · Opcional" />
        </div>

        <AttributeFields />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="regular_price" label="Preço base (R$)" value={bundle.product.regular_price} />
          <Input name="sale_price" label="Preço promocional (R$) · Opcional" />
          <Input name="stock_quantity" label="Quantidade · Vazio: sem quantidade definida" />

          <label className="block text-xs">Situação do estoque
            <select name="stock_status" defaultValue="outofstock" className={field}>
              <option value="outofstock">Sem estoque</option>
              <option value="instock">Em estoque</option>
              <option value="onbackorder">Sob encomenda</option>
            </select>
          </label>
        </div>
      </ActionForm>
    </section>}

    {bundle.variants.length > 0 && <section className={card}>
      <h2 className="mb-4 text-lg font-medium">Atributos das variações</h2>
      <p className="mb-5 text-xs text-[#81796C]">Preços, estoque e a opção de desabilitar continuam na tela de edição do produto.</p>

      <div className="space-y-3">
        {bundle.variants.map(variant => <details key={variant.id} className="rounded-2xl border border-[#E5DED3] p-4">
          <summary className="cursor-pointer text-sm">{variant.name} · {Object.values((variant.attributes || {}) as Record<string, string>).join(' / ')}</summary>

          <div className="mt-4">
            <ActionForm id={id} operation="variant_attributes" label="Salvar atributos">
              <input type="hidden" name="variant_id" value={variant.id} />
              <input type="hidden" name="original_name" value={variant.name} />
              <input type="hidden" name="original_attributes" value={JSON.stringify(variant.attributes || {})} />
              <Input name="name" label="Nome da variação" value={variant.name} required />
              <AttributeFields initial={(variant.attributes || {}) as Record<string, string>} />
            </ActionForm>
          </div>
        </details>)}
      </div>
    </section>}
  </div>
}
