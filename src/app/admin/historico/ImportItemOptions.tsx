'use client'
import { useFormState, useFormStatus } from 'react-dom'
import { importLegacyItemOptions } from './options-actions'
function Submit() {
  const { pending } = useFormStatus()
  return <button disabled={pending} className="min-h-[44px] rounded-full bg-[#292621] px-5 text-xs text-white disabled:opacity-40">{pending ? 'Importando opções…' : 'Importar medidas e opções'}</button>
}
export default function ImportItemOptions() {
  const [state, action] = useFormState(importLegacyItemOptions, { error: '' })
  return <details className="rounded-xl border bg-white p-5"><summary className="min-h-[44px] cursor-pointer text-sm font-medium">Complementar medidas e opções dos pedidos antigos</summary><p className="my-3 text-xs leading-6 text-[#756B5D]">Envie o CSV de opções exportado do site antigo, depois de instalar o SQL desta etapa. Complementa apenas as opções dos itens; preços e quantidades são preservados.</p><form action={action} className="space-y-4"><input type="file" name="options" accept=".csv,text/csv" required aria-label="CSV de medidas e opções dos pedidos antigos" className="block w-full text-xs" /><Submit />{state.error && <p role="alert" className="text-xs text-red-700">{state.error}</p>}{state.changed !== undefined && <p role="status" className="text-sm">{state.changed} item(ns) complementado(s). Itens já iguais não são alterados novamente.</p>}</form></details>
}
