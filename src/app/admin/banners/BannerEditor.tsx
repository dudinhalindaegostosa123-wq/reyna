'use client'

/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveBanner } from './actions'
import { bannerPlacement,MINI_BANNER_TARGETS,COLOR_BANNER_TARGETS } from '@/lib/home-images'
import { bannerImage } from '@/lib/banner-ui'
import type { AdminBanner } from '@/lib/banner-ui'

const inputClass =
  'mt-2 block min-h-[44px] min-w-0 w-full rounded-xl border border-[#DDD4C7] bg-white px-3 py-2 text-base sm:text-sm'

interface Props {
  initial?: AdminBanner
  id: string
  base: string
}

export default function BannerEditor({
  initial,
  id,
  base,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [placement,setPlacement]=useState(initial?bannerPlacement(initial):'hero')

  return (
    <section className="min-w-0 rounded-3xl border bg-white p-5 sm:p-7">
      <h2 className="text-xl font-medium">
        {initial ? 'Editar banner' : 'Novo banner'}
      </h2>

      <p className="mt-3 text-xs leading-relaxed text-[#81796C]">
        Salvar com “Ativo na loja” marcado publica
        as alterações na vitrine. Para testar,
        deixe desmarcado.
      </p>

      <form
        className="mt-5"
        onSubmit={async event => {
          event.preventDefault()

          if (busy) return

          const data = new FormData(
            event.currentTarget
          )

          setBusy(true)
          setMessage('')

          try {
            const result = await saveBanner(data)

            if (result.error) {
              setMessage(result.error)
            } else if (result.id) {
              setMessage('Banner salvo.')

              const currentId = new URLSearchParams(
                window.location.search
              ).get('edit')

              if (currentId === result.id) {
                router.refresh()
              } else {
                router.replace(
                  '/admin/banners?edit=' + result.id
                )
              }
            }
          } catch {
            setMessage(
              'Resultado não confirmado. Confira a lista antes de repetir.'
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        <input
          type="hidden"
          name="id"
          value={id}
        />

        <input
          type="hidden"
          name="version"
          value={initial?.version || 0}
        />

        <fieldset
          disabled={busy}
          className="grid min-w-0 gap-4 sm:grid-cols-2"
        >
          <label className="min-w-0 text-xs">
            Local

            <select
              name="slot"
              value={placement}
              onChange={event=>setPlacement(event.target.value as typeof placement)}
              className={inputClass}
            >
              <option value="hero">
                Banner principal
              </option>

              <option value="category">
                Grade de categorias
              </option>
              <option value="mini">Mini banners abaixo de Orelha</option>
              <option value="stone">Círculos de cores das pedras</option>
            </select>
          </label>

          <label className={`min-w-0 text-xs ${placement==='mini' || placement==='stone'?'hidden':''}`}>
            Posição

            <input
              name="position"
              type="number"
              min="0"
              max="9999"
              required
              defaultValue={initial?.position || 0}
              className={inputClass}
            />
          </label>

          <label className="min-w-0 text-xs sm:col-span-2">
            {placement==='mini' || placement==='stone'?'Nome no painel':'Título'}

            <input
              name="title"
              maxLength={180}
              required
              defaultValue={initial?.title || ''}
              className={inputClass}
            />
          </label>

          <label className={`min-w-0 text-xs sm:col-span-2 ${placement==='mini' || placement==='stone'?'hidden':''}`}>
            Subtítulo

            <input
              name="subtitle"
              maxLength={500}
              defaultValue={initial?.subtitle || ''}
              className={inputClass}
            />
          </label>

          <label className="min-w-0 text-xs">
            {placement==='mini' || placement==='stone'?'Destino':'Link interno'}

            {placement==='mini' || placement==='stone' ? <select key={placement} name="href" required defaultValue={initial?.href || ''} className={inputClass}><option value="">Selecione o destino</option>{(placement==='mini'?MINI_BANNER_TARGETS:COLOR_BANNER_TARGETS).map(target=><option key={target.href} value={target.href}>{target.name}</option>)}</select> : <input name="href" maxLength={1000} required placeholder="/categoria/novidades" defaultValue={initial?.href || ''} className={inputClass} />}
          </label>

          <label className={`min-w-0 text-xs ${placement==='mini' || placement==='stone'?'hidden':''}`}>
            Texto do botão

            <input
              name="cta"
              maxLength={80}
              defaultValue={
                initial?.cta && !['home-mini-v1','home-stone-v1'].includes(initial.cta) ? initial.cta : 'Explorar agora'
              }
              className={inputClass}
            />
          </label>

          <label className="min-w-0 text-xs sm:col-span-2">
            Descrição da imagem para acessibilidade

            <input
              name="alt"
              required
              maxLength={300}
              defaultValue={initial?.alt || ''}
              className={inputClass}
            />
          </label>

          <label className="min-w-0 text-xs">
            {placement==='mini' || placement==='stone'?'Imagem':'Imagem para computador'}
            <span className="mt-1 block text-[#81796C]">
              JPG, PNG ou WebP de até 3 MB. {placement==='mini'?'Recomendado: 1200 × 800 px.':placement==='stone'?'Recomendado: imagem quadrada de 600 × 600 px.':''}
            </span>

            <input
              type="file"
              name="desktop"
              accept="image/jpeg,image/png,image/webp"
              className={inputClass}
            />
          </label>

          <label className={`min-w-0 text-xs ${placement==='mini' || placement==='stone'?'hidden':''}`}>
            Imagem para celular
            <span className="mt-1 block text-[#81796C]">
              Opcional · JPG, PNG ou WebP de até 3 MB
            </span>

            <input
              type="file"
              name="mobile"
              accept="image/jpeg,image/png,image/webp"
              className={inputClass}
            />
          </label>

          {initial?.image_desktop && (
            <div className="sm:col-span-2">
              <p className="mb-2 text-xs">
                Imagem atual para computador
              </p>

              <img
                src={bannerImage(
                  initial.image_desktop,
                  base
                )}
                alt={initial.alt}
                className="max-h-48 w-full rounded-xl object-contain"
              />
            </div>
          )}

          <label className={`min-w-0 text-xs ${placement==='mini' || placement==='stone'?'hidden':''}`}>
            Cor do texto

            <select
              name="text_tone"
              defaultValue={
                initial?.text_tone || 'light'
              }
              className={inputClass}
            >
              <option value="light">
                Claro
              </option>

              <option value="dark">
                Escuro
              </option>
            </select>
          </label>

          <div className="space-y-3 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={
                  initial?.enabled || false
                }
              />

              Ativo na loja
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="remove_mobile"
              />

              Remover imagem específica do celular
            </label>
          </div>

          <p className="text-xs leading-relaxed text-[#81796C] sm:col-span-2">
            Menor posição aparece primeiro.
            No banner principal é usado o primeiro
            ativo; na grade aparecem todos os ativos.
            Sem imagem para celular, é usada a de
            computador.
          </p>

          <button
            type="submit"
            disabled={busy}
            className="min-h-[44px] rounded-full bg-[#292621] px-6 py-3 text-xs text-white disabled:opacity-40"
          >
            {busy
              ? 'Salvando…'
              : 'Salvar banner'}
          </button>
        </fieldset>

        <p
          role="status"
          className="mt-4 text-sm"
        >
          {message}
        </p>
      </form>
    </section>
  )
}
