'use client'

import { useId, useRef } from 'react'
import { ChevronDown, X } from 'lucide-react'
import {
  ANODIZATION_COLORS,
  ANODIZATION_FEE,
  canAnodize,
} from '@/lib/anodization'
import { formatPrice } from '@/lib/data'

interface Props {
  tags: string[]
  enabled: boolean
  color: string
  fee?: number
  disabled?: boolean
  onChange: (enabled: boolean, color: string) => void
}

export default function AnodizationOptions({
  tags,
  enabled,
  color,
  disabled = false,
  fee = ANODIZATION_FEE,
  onChange,
}: Props) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const selectedColor = ANODIZATION_COLORS.find(item => item.code === color)

  if (!canAnodize(tags)) return null

  return (
    <section
      aria-label="Personalização da cor do titânio"
      className="rounded-2xl border border-store-border bg-store-raised p-4 sm:p-5"
    >
      <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              event.target.checked,
              event.target.checked ? color : ''
            )
          }
          className="mt-1 h-4 w-4 shrink-0"
        />
        <span>
          Quero anodizar minha joia{' '}
          <span className="whitespace-nowrap font-medium">
            {fee === 0 ? '(gratuita)' : `(+ ${formatPrice(fee)} por unidade)`}
          </span>
        </span>
      </label>

      {enabled && (
        <div className="mt-3">
          <button type="button" disabled={disabled} aria-haspopup="dialog" aria-controls={id} onClick={() => dialog.current?.showModal()} className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-store-border bg-store-surface px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A08051] disabled:opacity-50">
            {selectedColor && <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full border border-white/25" style={{ backgroundColor: selectedColor.swatch }} />}
            <span className="min-w-0 flex-1 text-sm text-store-text">{selectedColor ? `${selectedColor.label} · ${selectedColor.voltage} V` : 'Selecionar variação de cor'}</span>
            <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-store-muted" />
          </button>
          <dialog ref={dialog} id={id} aria-labelledby={`${id}-title`} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }} className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-md overflow-hidden rounded-2xl border border-store-border bg-store-raised p-0 text-store-text shadow-2xl backdrop:bg-black/35">
            <div className="p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><h3 id={`${id}-title`} className="text-base font-medium">Escolha a cor do titânio</h3><p className="mt-1 text-[11px] text-store-muted">Selecione uma bolinha para confirmar.</p></div>
                <button type="button" aria-label="Fechar escolha de cor" onClick={() => dialog.current?.close()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-store-border bg-store-surface"><X size={18} aria-hidden="true" /></button>
              </div>
              <fieldset disabled={disabled} className="max-h-[55dvh] overflow-y-auto overscroll-contain p-1">
                <legend className="sr-only">Cores disponíveis</legend>
                <div className="grid grid-cols-2 gap-1.5">
                  {ANODIZATION_COLORS.map(item => {
                    const selected = color === item.code
                    return <label key={item.code} className={`flex min-h-[54px] cursor-pointer items-center backdrop-blur-md text-white gap-2 rounded-xl border p-2 focus-within:ring-2 focus-within:ring-store-selected ${selected ? 'border-store-selected bg-store-choice-selected' : 'border-store-border bg-store-choice hover:bg-store-choice-selected'}`}>
                      <input type="radio" name={`${id}-color`} value={item.code} checked={selected} onChange={() => { onChange(true, item.code); dialog.current?.close() }} className="sr-only" />
                      <span aria-hidden="true" className="h-7 w-7 shrink-0 rounded-full border border-white/25" style={{ backgroundColor: item.swatch }} />
                      <span className="min-w-0 text-[11px] leading-4"><span className="block font-medium">{item.label}</span><span className="block text-[10px] text-white/90">{item.voltage} V{selected ? ' · Selecionada' : ''}</span></span>
                    </label>
                  })}
                </div>
              </fieldset>
              <p className="mt-3 text-[10px] leading-4 text-store-muted">Tons de referência: podem variar conforme a tela e o acabamento da joia.</p>
            </div>
          </dialog>
        </div>
      )}
    </section>
  )
}
