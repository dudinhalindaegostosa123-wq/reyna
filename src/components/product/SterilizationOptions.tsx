'use client'

import { useId } from 'react'
import { Info } from 'lucide-react'
import { formatPrice } from '@/lib/data'
import { STERILIZATION_GUIDANCE } from '@/lib/commerce'

export default function SterilizationOptions({ value, fee, disabled = false, onChange }: { value: boolean; fee: number; disabled?: boolean; onChange: (value: boolean) => void }) {
  const id = useId()
  return <section aria-label="Esterilização" className="rounded-2xl border border-[#252525] bg-black p-3 text-white sm:p-4">
    <fieldset disabled={disabled} className="min-w-0 disabled:opacity-50">
    <legend className="mb-3 text-base font-medium leading-tight sm:text-lg">Esterilização</legend>

    <div className="grid grid-cols-2 gap-2.5">
      {[false, true].map(option => <label key={String(option)} className={`flex min-h-[72px] min-w-0 cursor-pointer flex-col justify-center rounded-xl border bg-[#242424] px-3 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-black sm:min-h-[80px] sm:px-3.5 ${value === option ? 'border-[#626262]' : 'border-transparent hover:border-[#454545]'} ${disabled ? 'cursor-default' : ''}`}>
        <input type="radio" name={id} value={String(option)} checked={value === option} onChange={() => onChange(option)} className="sr-only" />
        <span className="text-sm font-medium leading-5 sm:text-base sm:leading-6">{option ? 'Sim, esterilizada' : 'Não'}</span>
        <span className="mt-1 text-xs leading-5 text-[#B5B5B5] sm:text-[13px]">{option ? fee > 0 ? `+ ${formatPrice(fee)} / peça` : 'Sem adicional' : 'Sem adicional'}</span>
      </label>)}
    </div>
    <p className="mt-3 text-xs leading-5 text-[#B5B5B5] sm:text-[13px] sm:leading-6">{STERILIZATION_GUIDANCE}</p>
  </fieldset>
    <div className="mt-3 flex items-start gap-2 border-t border-[#1D1D1D] pt-3 text-[11px] leading-5 sm:text-xs text-[#B5B5B5]">
      <Info size={16} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 shrink-0" />
      <p>* Todas as joias são enviadas previamente higienizadas. Selecione a esterilização caso a joia seja utilizada em uma nova perfuração ou na troca de uma joia em uma perfuração ainda não cicatrizada.</p>
    </div>
  </section>
}
