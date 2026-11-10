'use client'
import VariantStockSummary from '@/components/admin/VariantStockSummary'
import type { InventoryRow } from '@/lib/inventory'
import type { RefObject } from 'react'

// Serenity: seletores do catálogo e publicação visível
import ProductClassification from './ProductClassification'
import type { ClassificationOptions } from './ProductClassification'


import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { EditableProduct, Commercial } from '@/lib/admin-product-editor'
import { emptyProduct } from '@/lib/admin-unified'
import type { EditorBundle, EditorPhoto } from '@/lib/admin-unified'
import { saveUnifiedEditor, stageEditorPhoto } from './unified-actions'

interface Photo extends EditorPhoto {
  file?: File
  preview?: string
  staged?: boolean
}

const field = 'mt-2 min-h-[44px] min-w-0 w-full rounded-xl border border-[#DFD7CB] bg-white px-3 py-2 text-base outline-none focus:border-[#947B57] sm:text-sm'
const card = 'rounded-3xl border border-[#E5DED3] bg-white p-5 sm:p-7'
const smallButton = 'min-h-[38px] rounded-full border border-[#DFD7CB] px-4 py-2 text-xs disabled:opacity-40'

function Field({ name, label, value, long = false, limit = 300 }: {
  name: string
  label: string
  value: unknown
  long?: boolean
  limit?: number
}) {
  return <label className="block min-w-0 text-xs text-[#625B51]">
    {label}
    {long
      ? <textarea name={name} defaultValue={String(value ?? '')} maxLength={limit} rows={5} className={field} />
      : <input name={name} defaultValue={String(value ?? '')} maxLength={limit} className={field} />}
  </label>
}

function PriceStock({ row, prefix, variants, formRef, inventory }: { row: EditableProduct; prefix: string; variants?: EditableProduct[]; formRef?: RefObject<HTMLFormElement>; inventory?: InventoryRow }) {
  const calculated = prefix === 'p.' && (row.product_type === 'variable' || Boolean(variants?.length))

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field name={`${prefix}regular_price`} label="Preço base (R$)" value={row.regular_price} limit={40} />
      <Field name={`${prefix}sale_price`} label="Preço promocional (R$) · Opcional" value={row.sale_price} limit={40} />

      {calculated && formRef ? (
        <>
          <input type="hidden" name={`${prefix}stock_quantity`} value="" />
          <input type="hidden" name={`${prefix}stock_status`} value={row.stock_status || 'outofstock'} />
          <VariantStockSummary variants={variants || []} formRef={formRef} inventory={inventory} />
        </>
      ) : (
        <>
          <Field
            name={`${prefix}stock_quantity`}
            label={prefix === 'p.' ? 'Quantidade em estoque' : 'Quantidade em estoque da variação'}
            value={row.stock_quantity}
            limit={40}
          />

          <label className="block text-xs">
            Situação do estoque
            <select name={`${prefix}stock_status`} defaultValue={row.stock_status} className={field}>
              <option value="instock">Em estoque</option>
              <option value="outofstock">Sem estoque</option>
              <option value="onbackorder">Sob encomenda</option>
            </select>
          </label>

          <p className="text-[11px] text-[#81796C] sm:col-span-2">
            Quantidade vazia significa não definida. Use 0 quando não houver unidades.
          </p>
        </>
      )}

      {Boolean(row.sale_starts_at || row.sale_ends_at) && (
        <p className="text-[11px] text-[#81796C] sm:col-span-2">
          O agendamento de promoção existente será preservado.
        </p>
      )}
    </div>
  )
}
function CommercialFields({ value, prefix }: { value: Commercial; prefix: string }) {
  return <div className="rounded-2xl bg-[#F8F5EF] p-4">
    <p className="mb-4 text-xs font-medium">Fornecedor e custo · Opcionais, uso interno</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field name={`${prefix}supplier_name`} label="Fornecedor" value={value.supplier_name} limit={180} />
      <Field name={`${prefix}unit_cost`} label="Custo unitário (R$)" value={value.unit_cost} limit={40} />
    </div>
    <p className="mt-3 text-[11px] text-[#81796C]">Vazio significa não informado. Na variação, vazio permite usar o dado do produto.</p>
  </div>
}

function Attributes({ prefix, value, isNew }: {
  prefix: string
  value: Record<string, string>
  isNew: boolean
}) {
  const [pairs, setPairs] = useState<[string, string][]>(
    Object.entries(value).length
      ? Object.entries(value)
      : isNew ? [['', '']] : []
  )

  return <div className="rounded-2xl bg-[#F8F5EF] p-4">
    <input type="hidden" name={`${prefix}attributes`} value={JSON.stringify(pairs)} />
    <p className="mb-3 text-xs font-medium">Atributos · Exemplo: Cor / Azul; Medida / 8 mm</p>

    <div className="space-y-3">
      {pairs.map((pair, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
        {[0, 1].map(part => <input
          key={part}
          aria-label={`${part === 0 ? 'Atributo' : 'Valor'} ${index + 1}`}
          value={pair[part]}
          onChange={event => setPairs(old => old.map((p, i) =>
            i !== index ? p : part === 0
              ? [event.target.value, p[1]]
              : [p[0], event.target.value]
          ))}
          required
          maxLength={part === 0 ? 120 : 180}
          placeholder={part === 0 ? 'Cor' : 'Azul'}
          className={field}
        />)}

        <button type="button" className="px-2" aria-label="Remover atributo" onClick={() => setPairs(old => old.filter((_, i) => i !== index))}>×</button>
      </div>)}
    </div>

    <button type="button" disabled={pairs.length >= 20} onClick={() => setPairs(old => [...old, ['', '']])} className="mt-4 text-xs underline">+ Atributo</button>
  </div>
}

export default function UnifiedProductEditor({ bundle, storageUrl, isNew = false, options, inventory }: {
  bundle: EditorBundle
  storageUrl: string
  isNew?: boolean; options: ClassificationOptions; inventory?: InventoryRow
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const urls = useRef(new Set<string>())
  const staged = useRef(new Map<string, { id: string; path: string }>())
  const [variants, setVariants] = useState<EditableProduct[]>(bundle.variants)
  const [photos, setPhotos] = useState<Photo[]>(
    bundle.media.filter(m => m.media_type === 'image')
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const product = bundle.product
  const originalIds = new Set(bundle.variants.map(v => String(v.id)))
  const newIds = variants
    .filter(v => !originalIds.has(String(v.id)))
    .map(v => String(v.id))

  useEffect(() => {
    const created = urls.current
    return () => {
      created.forEach(url => URL.revokeObjectURL(url))
    }
  }, [])

  const imageUrl = (path: string) =>
    `${storageUrl}/storage/v1/object/public/produtos/${path.split('/').map(encodeURIComponent).join('/')}`

  function addPhotos(files: FileList | null, variant: string | null) {
    if (!files) return

    const added: Photo[] = []

    for (const file of Array.from(files)) {
      if (file.size > 3 * 1024 * 1024 || file.size < 1) {
        setError('Cada foto deve ter até 3 MB.')
        continue
      }

      const preview = URL.createObjectURL(file)
      urls.current.add(preview)

      added.push({
        id: crypto.randomUUID(),
        media_type: 'image',
        variant_id: variant,
        storage_path: null,
        alt_text: '',
        file,
        preview,
      })
    }

    setPhotos(old => [...old, ...added])
  }

  function movePhoto(photo: Photo, delta: number) {
    const group = photos.filter(p => p.variant_id === photo.variant_id)
    const neighbor = group[
      group.findIndex(p => p.id === photo.id) + delta
    ]

    if (!neighbor) return

    setPhotos(old => {
      const copy = [...old]
      const a = copy.findIndex(p => p.id === photo.id)
      const b = copy.findIndex(p => p.id === neighbor.id)
      ;[copy[a], copy[b]] = [copy[b], copy[a]]
      return copy
    })
  }

  function photoFields(variant: string | null) {
    return <div>
      <label className="block text-xs">
        {variant ? 'Fotos desta variação' : 'Fotos gerais do produto'}
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className={field}
          onChange={event => {
            addPhotos(event.target.files, variant)
            event.target.value = ''
          }}
        />
      </label>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.filter(p => p.variant_id === variant).map(photo => <div key={photo.id} className="min-w-0 rounded-2xl border border-[#E5DED3] p-3">
          <div className="relative aspect-square overflow-hidden rounded-xl bg-[#F8F5EF]">
            <Image
              src={photo.preview || imageUrl(photo.thumbnail_path || photo.storage_path || '')}
              alt={photo.alt_text || 'Foto da joia'}
              fill
              sizes="(max-width: 640px) 40vw, 250px"
              unoptimized
              className="object-contain"
            />
          </div>

          <input
            aria-label="Descrição da foto"
            value={photo.alt_text || ''}
            maxLength={300}
            placeholder="Descrição da foto"
            className={`${field} text-xs`}
            onChange={event => setPhotos(old => old.map(p =>
              p.id === photo.id
                ? { ...p, alt_text: event.target.value }
                : p
            ))}
          />

          <select
            aria-label="Vincular foto a"
            value={photo.variant_id || ''}
            className={`${field} text-xs`}
            onChange={event => setPhotos(old => old.map(p =>
              p.id === photo.id
                ? { ...p, variant_id: event.target.value || null }
                : p
            ))}
          >
            <option value="">Produto geral</option>
            {variants.map((v, i) => <option key={v.id} value={v.id}>Variação {i + 1} · {v.name}</option>)}
          </select>

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" aria-label="Mover foto antes" className={smallButton} onClick={() => movePhoto(photo, -1)}>←</button>
            <button type="button" aria-label="Mover foto depois" className={smallButton} onClick={() => movePhoto(photo, 1)}>→</button>
          </div>

          {!variant && <button type="button" className="mt-3 block text-xs underline" onClick={() => setPhotos(old => [photo, ...old.filter(p => p.id !== photo.id)])}>Usar como capa</button>}

          <button type="button" className="mt-3 block text-xs text-red-800" onClick={() => setPhotos(old => old.filter(p => p.id !== photo.id))}>Remover foto</button>
        </div>)}
      </div>
    </div>
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (saving || !formRef.current) return

    const form = new FormData(formRef.current)

    form.set('photos', JSON.stringify(
      photos.map(p => ({
        id: p.id,
        variant_id: p.variant_id,
        alt_text: p.alt_text || '',
      }))
    ))

    setSaving(true)
    setError('')
    setMessage('Conferindo os campos…')

    try {
      const validation = await saveUnifiedEditor(
        String(product.id),
        isNew,
        form,
        true
      )

      if (validation.error) throw new Error(validation.error)

      const finalPhotos = []
      let completed = 0

      for (const photo of photos) {
        let photoId = photo.id

        if (photo.file) {
          setMessage(
            `Preparando foto ${++completed} de ${photos.filter(p => p.file).length}…`
          )

          let result = staged.current.get(photo.id)

          if (!result) {
            const upload = new FormData()
            upload.set('image', photo.file)

            const response = await stageEditorPhoto(
              String(product.id),
              upload
            )

            if (response.error || !response.id || !response.path) {
              throw new Error(response.error || 'Não foi possível enviar a foto.')
            }

            result = {
              id: response.id,
              path: response.path,
            }

            staged.current.set(photo.id, result)
          }

          photoId = result.id
        }

        finalPhotos.push({
          id: photoId,
          variant_id: photo.variant_id,
          alt_text: photo.alt_text || '',
        })
      }

      form.set('photos', JSON.stringify(finalPhotos))
      setMessage('Salvando todas as alterações…')

      const result = await saveUnifiedEditor(
        String(product.id),
        isNew,
        form
      )

      if (result.error || !result.url) {
        throw new Error(result.error || 'Não foi possível salvar.')
      }

      router.replace(result.url)
      router.refresh()
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Não foi possível salvar.'
      )
      setSaving(false)
      setMessage('')
    }
  }

  return <form ref={formRef} onSubmit={save} className="space-y-5">
    <input type="hidden" name="version" value={bundle.version} />
    <input type="hidden" name="new_variants" value={JSON.stringify(newIds)} />
    <input type="hidden" name="p.product_type" value={String(product.product_type || 'simple')} />

    <fieldset disabled={saving} className="min-w-0 space-y-5 disabled:opacity-70">
      <section className={card}>
        <h2 className="mb-5 text-lg font-medium">Informações do produto</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="p.name" label="Nome" value={product.name} />
          <Field name="p.sku" label="SKU" value={product.sku} limit={180} />

          

          
        </div>

        <div className="mt-5 space-y-4">
          <Field name="p.short_description" label="Descrição curta" value={product.short_description} long limit={20000} />
          <Field name="p.description" label="Descrição completa · HTML existente é preservado" value={product.description} long limit={500000} />
        </div>
      </section>

      <ProductClassification product={product} options={options} />

      <section className={card}>
        <h2 className="mb-5 text-lg font-medium">Preços, estoque e fornecedor</h2>

        {variants.length > 0 && <p className="mb-4 text-xs text-[#81796C]">Os preços e as quantidades ficam nas variações abaixo. O estoque geral é calculado automaticamente.</p>}

        <PriceStock row={product} prefix="p." variants={variants} formRef={formRef} inventory={inventory} />

        <div className="mt-5">
          <CommercialFields value={bundle.commercial} prefix="p." />
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-3 text-lg font-medium">Galeria e vídeo</h2>
        <p className="mb-5 text-xs text-[#81796C]">A primeira foto geral é a capa. Envie JPG, PNG ou WebP de até 3 MB cada. As fotos das opções ficam dentro das variações.</p>

        {photoFields(null)}

        <div className="mt-6">
          <Field
            name="youtube"
            label="Vídeo do YouTube / Shorts · Vazio: remover vídeo"
            value={bundle.media.find(m => m.media_type === 'youtube')?.youtube_id || ''}
            limit={1000}
          />
        </div>
      </section>

      <section className={card}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-medium">Variações ({variants.length})</h2>

          <button
            type="button"
            className={smallButton}
            onClick={() => setVariants(old => [
              ...old,
              emptyProduct(
                crypto.randomUUID(),
                String(
                  (formRef.current?.elements.namedItem('p.name') as HTMLInputElement | null)?.value ||
                  product.name ||
                  'Nova variação'
                )
              ),
            ])}
          >
            + Adicionar variação
          </button>
        </div>

        {!variants.length && <p className="text-xs text-[#81796C]">Produto simples. Adicione variações se houver opções de cor, tamanho ou medida.</p>}

        <div className="space-y-4">
          {variants.map((variant, index) => {
            const prefix = `v.${variant.id}.`
            const fresh = !originalIds.has(String(variant.id))

            return <div key={variant.id} className="rounded-2xl border border-[#E5DED3] p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-medium">Variação {index + 1}{fresh ? ' · Nova' : ''}</h3>

                {fresh && <button
                  type="button"
                  className="text-xs text-red-800"
                  onClick={() => {
                    setVariants(old => old.filter(v => v.id !== variant.id))
                    setPhotos(old => old.map(p =>
                      p.variant_id === variant.id
                        ? { ...p, variant_id: null }
                        : p
                    ))
                  }}
                >
                  Remover variação
                </button>}
              </div>

              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field name={`${prefix}name`} label="Nome da variação" value={variant.name} />
                  <Field name={`${prefix}sku`} label="SKU da variação" value={variant.sku} limit={180} />
                </div>

                <Attributes
                  prefix={prefix}
                  value={(variant.attributes || {}) as Record<string, string>}
                  isNew={fresh}
                />

                <PriceStock row={variant} prefix={prefix} />

                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name={`${prefix}enabled`} defaultChecked={variant.enabled !== false} />
                  Variação habilitada
                </label>

                {photoFields(String(variant.id))}

                <CommercialFields
                  prefix={prefix}
                  value={variant.commercial || {}}
                />
              </div>
            </div>
          })}
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-5 text-lg font-medium">SEO do produto</h2>

        <div className="space-y-4">
          <Field name="p.seo_title" label="Título para buscadores" value={product.seo_title} />
          <Field name="p.seo_description" label="Descrição para buscadores" value={product.seo_description} long limit={2000} />
        </div>
      </section>
    </fieldset>

    {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}

    <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-[#E5DED3] bg-[#FAFAF8] py-4">
      <p role="status" className="text-xs text-[#81796C]">{message || 'Todas as alterações serão salvas juntas.'}</p>
      <label className="text-xs text-[#625B51]">Publicação<select name="p.status" defaultValue={String(product.status || "draft")} disabled={saving} className="ml-2 min-h-[44px] rounded-xl border border-[#B8986A] bg-white px-3 text-sm"><option value="draft">Rascunho</option><option value="published">Publicado</option></select></label><button type="submit" disabled={saving} className="min-h-[46px] rounded-full bg-[#292621] px-7 text-sm text-white disabled:opacity-50">
        {saving ? 'Salvando…' : 'Salvar alterações'}
      </button>
    </div>
  </form>
}

// Serenity: estoque geral das variações v2
