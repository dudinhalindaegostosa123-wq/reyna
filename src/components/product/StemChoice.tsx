'use client'

import { useId } from 'react'
import Image from 'next/image'
import { STEM_LABELS } from '@/lib/commerce'

const cardClass = (selected: boolean) => `relative flex min-h-[96px] cursor-pointer flex-col rounded-xl backdrop-blur-md border px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-store-selected focus-within:ring-offset-2 ${selected ? 'border-store-selected bg-store-choice-selected shadow-[0_4px_14px_rgba(0,0,0,0.12)]' : 'border-store-border bg-store-choice hover:bg-store-choice-selected'}`

export function StemLengthChoice({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId()
  if (!value) return null
  return <fieldset disabled={disabled} className="disabled:opacity-50">
    <legend className="sr-only">Comprimento da haste</legend>
    <div className="mb-2 text-store-text"><p className="text-sm font-medium">Comprimento da haste</p></div>
    <div className="grid grid-cols-2 gap-2">
      {['6', '8', ...(!['6', '8'].includes(value) ? [value] : [])].map(length => <label key={length} className={`relative cursor-pointer rounded-xl backdrop-blur-md border px-3 py-2 focus-within:ring-2 focus-within:ring-store-selected focus-within:ring-offset-2 ${value === length ? 'border-store-selected bg-store-choice-selected shadow-[0_4px_14px_rgba(0,0,0,0.12)]' : 'border-store-border bg-store-choice'}`}>
        <input type="radio" name={id} value={length} checked={value === length} onChange={() => onChange(length)} className="sr-only" />
        <span className="block text-sm font-medium text-[#F5F5F5]">{length} mm</span>
        <span className="mt-1 block text-[10px] leading-4 text-white/90">{length === '6' ? 'Cicatrizada / downsize' : length === '8' ? 'Perfuração nova' : 'Seleção anterior'}</span>
        <span className="sr-only">{STEM_LABELS[length as '6' | '8'] || `${length} mm`}</span>
      </label>)}
    </div>
    <p className="text-[10px] leading-5 text-store-muted">Confirme a medida e o encaixe com seu profissional.</p>
  </fieldset>
}

export default function StemChoice({ value, onChange, disabled = false, showLength = true }: { value: string; onChange: (value: string) => void; disabled?: boolean; fee?: number; showLength?: boolean }) {
  const id = useId()
  const complete = Boolean(value)
  return <div className="space-y-3">
    <fieldset disabled={disabled} className="disabled:opacity-50">
      <legend className="mb-2 flex items-center gap-2 text-sm font-medium text-store-text">Formato de compra</legend>

      <div className="grid grid-cols-2 gap-2.5">
        <label className={cardClass(!complete)}>
          <div className="mb-1 flex h-8 items-center justify-between gap-2"><input type="radio" name={id} value="" checked={!complete} onChange={() => onChange('')} className="h-4 w-4 shrink-0 accent-white" /><Image src="/illustrations/piercing-top.webp" alt="" aria-hidden="true" width={36} height={36} className="h-8 w-9 object-contain" /></div>
          <span className="text-xs font-medium leading-5 text-[#F5F5F5]">Somente o topo</span>
          <span className="text-[10px] text-white/90">Sem adicional</span>
        </label>
        <label className={cardClass(complete)}>
          <div className="mb-1 flex h-8 items-center justify-between gap-2"><input type="radio" name={id} value="complete" checked={complete} onChange={() => onChange(value || '6')} className="h-4 w-4 shrink-0 accent-white" /><span aria-hidden="true" className="flex items-center gap-0.5"><Image src="/illustrations/piercing-top.webp" alt="" width={28} height={28} className="h-7 w-7 object-contain" /><span className="text-xs text-[#BDBDBD]">+</span><Image src="/illustrations/labret-stem.webp" alt="" width={28} height={36} className="h-8 w-7 object-contain" /></span></div>
          <span className="text-xs font-medium leading-5 text-[#F5F5F5]">Topo + haste</span>
          <span className="w-fit rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-medium text-[#F5F5F5]">+ R$ 5,00 / peça</span>
        </label>
      </div>
    </fieldset>
    {showLength && <StemLengthChoice value={value} onChange={onChange} disabled={disabled} />}
  </div>
}
