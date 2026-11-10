'use client'

import type { LabelScope } from '@/lib/label-scope'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadQuickLabel } from '@/app/admin/frete/quick-label-actions'
import LabelPreparation from './LabelPreparation'
import LabelOperations from './LabelOperations'
import LabelPurchase from './LabelPurchase'

export default function QuickLabelFlow({ orderId, stage, title, scope = 'current', autoOpen = false }: { orderId: string; stage: string; title: string; scope?: LabelScope; autoOpen?: boolean }) {
  const router = useRouter()
  const [data, setData] = useState<Awaited<ReturnType<typeof loadQuickLabel>> | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const started = useRef(false)
  const show = useCallback(async () => {
    setOpen(true)
    if (data && !data.error) return
    setBusy(true)
    try { setData(await loadQuickLabel(orderId, scope)) }
    catch { setData({ error: 'Não foi possível carregar. Tente novamente.' }) }
    finally { setBusy(false) }
  }, [data,orderId,scope])

  useEffect(() => {
    if (autoOpen && !started.current) { started.current = true; void show() }
  },[autoOpen,show])

  return <div className="mt-4">
    <button type="button" onClick={() => open ? setOpen(false) : void show()} disabled={busy}
      aria-expanded={open} aria-controls={`quick-label-${orderId}`}
      className="min-h-[44px] rounded-full bg-[#292621] px-5 text-xs text-white disabled:opacity-40">
      {busy ? 'Carregando…' : open ? 'Recolher envio' : title}
    </button>
    {/* Recolher mantém a operação montada, inclusive durante a confirmação de compra. */}
    <div id={`quick-label-${orderId}`} hidden={!open} className="mt-4 rounded-2xl border border-[#E5DED3] bg-[#FAF8F4] p-3 sm:p-5">
      {busy && <p role="status" className="text-sm">Carregando os dados do envio…</p>}
      {data?.error && <div role="alert" className="text-sm"><p>{data.error}</p><button type="button" disabled={busy} onClick={() => void show()} className="mt-3 min-h-[44px] underline">Tentar novamente</button></div>}
      {data && !data.error && data.job && data.draft && (
        ['purchased', 'shipped'].includes(stage) || data.job.state === 'prepared'
          ? <LabelPurchase orderId={orderId} scope={scope} />
          : <>
            <details open={data.draft.issues.length > 0 || data.job.issues.length > 0} className="mb-4"><summary className="min-h-[44px] cursor-pointer py-3 text-sm font-medium">Dados do envio · editar se necessário</summary><LabelPreparation initial={data.draft} scope={scope} /></details>
            <p className="mb-4 text-xs leading-6 text-[#625B51]">Usamos os dados salvos do pedido e consultamos o frete automaticamente. Prepare a etiqueta e depois confirme a compra pelo valor exibido.</p>
            {'automaticError' in data && data.automaticError && <p role="alert" className="mb-3 text-xs text-amber-800">{data.automaticError}</p>}
            <LabelOperations scope={scope} initial={data.job} onPrepared={() => router.refresh()} />
          </>
      )}
    </div>
  </div>
}
