'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { startLegacyLabel, linkLegacyLabel } from '@/app/admin/historico/label-actions'
import QuickLabelFlow from './QuickLabelFlow'

export default function LegacyLabelStart({ oldId, shipmentId, intent, linked = false }: { oldId: string; shipmentId?: string; intent?: string; linked?: boolean }) {
  const router = useRouter()
  const [id, setId] = useState(shipmentId || '')
  const [mode, setMode] = useState<'new' | 'existing'>(intent === 'existing' ? 'existing' : 'new')
  const [started, setStarted] = useState(Boolean(shipmentId && (intent === 'new' || linked)))
  const [confirmed, setConfirmed] = useState(false)
  const [remoteId, setRemoteId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (started) return <QuickLabelFlow orderId={id} stage="to_buy" title="Abrir envio do pedido antigo" scope="legacy" />
  return <section className="mt-4 rounded-2xl border border-[#E5DED3] bg-[#FAF8F4] p-5">
    <h3 className="text-sm font-medium">Etiqueta do pedido antigo #{oldId}</h3>
    <p className="mt-2 text-xs leading-6 text-[#625B51]">Escolha a situação do envio. O pedido permanece no histórico, com seus valores originais.</p>
    <form className="mt-3 space-y-4" onSubmit={async event => {
      event.preventDefault()
      if (busy || !confirmed) return
      setBusy(true); setError('')
      try {
        const result = mode === 'new' ? await startLegacyLabel(oldId, mode, confirmed) : await linkLegacyLabel(oldId, remoteId.trim(), confirmed)
        if (result.error) setError(result.error)
        else if (result.id) { setId(result.id); setStarted(true); router.refresh() }
      } catch { setError('Não foi possível confirmar o resultado. Atualize a central antes de tentar novamente.') }
      finally { setBusy(false) }
    }}>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="sr-only">Situação da etiqueta</legend>
        <label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="radio" name={`legacy-mode-${oldId}`} checked={mode === 'new'} onChange={() => { setMode('new'); setConfirmed(false) }} />Ainda preciso comprar a etiqueta</label>
        <label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="radio" name={`legacy-mode-${oldId}`} checked={mode === 'existing'} onChange={() => { setMode('existing'); setConfirmed(false) }} />Já comprei no Melhor Envio</label>
        {mode === 'existing' && <label className="block text-xs">ID do envio no Melhor Envio<input required value={remoteId} onChange={event => setRemoteId(event.target.value)} maxLength={36} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="mt-2 min-h-[44px] w-full rounded-xl border bg-white px-3 text-sm" /><span className="mt-2 block leading-6 text-[#625B51]">Abra a etiqueta no Melhor Envio e copie o ID completo do envio (36 caracteres). Usar uma etiqueta já paga não faz outra compra.</span></label>}
        <label className="flex min-h-[44px] items-start gap-3 text-xs leading-6"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />{mode === 'new' ? 'Conferi que o pedido foi pago, ainda precisa de envio e não possui uma etiqueta comprada.' : 'Conferi que a etiqueta foi paga e pertence ao destinatário e ao pedido acima.'}</label>
        <button disabled={!confirmed || busy} className="min-h-[44px] rounded-full bg-[#292621] px-5 text-xs text-white disabled:opacity-40">{busy ? 'Conferindo…' : mode === 'new' ? 'Preparar envio — sem comprar ainda' : 'Vincular etiqueta já paga'}</button>
      </fieldset>
      {error && <p role="alert" className="text-xs leading-6 text-amber-900">{error}</p>}
    </form>
  </section>
}
