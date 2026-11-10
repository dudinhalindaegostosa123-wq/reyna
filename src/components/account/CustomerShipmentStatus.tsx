'use client'
import { useState } from 'react'
import { customerOrderStatus, type CustomerShipment } from '@/lib/customer-order-status'

export default function CustomerShipmentStatus(props: CustomerShipment) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const status = customerOrderStatus(props)
  async function copyCode() {
    try { await navigator.clipboard.writeText(status.code); setCopied(true); setCopyError(false) }
    catch { setCopyError(true) }
  }
  return <div className="mt-4">
    <p className="flex items-center gap-2 text-sm font-medium text-store-text"><span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.tone === 'success' ? 'bg-[#588069]' : status.tone === 'attention' ? 'bg-[#A77D47]' : 'bg-[#B89C77]'}`} />{status.title}</p>
    <p className="mt-2 text-xs leading-5 text-store-muted">{status.message}</p>
    {status.code && <div className="mt-4 rounded-xl bg-store-raised px-4 py-3"><p className="text-[10px] uppercase tracking-[0.12em] text-store-muted">Código de rastreio</p><div className="flex flex-wrap items-center justify-between gap-x-3"><p className="select-all break-all text-sm font-medium tracking-wide">{status.code}</p><button type="button" onClick={copyCode} aria-label="Copiar código de rastreio" className="inline-flex min-h-[44px] items-center text-xs underline underline-offset-4">{copied ? 'Copiado' : 'Copiar código'}</button></div><a href="https://www.melhorrastreio.com.br/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-2 text-xs font-medium underline underline-offset-4">Acompanhar envio <span aria-hidden="true">↗</span><span className="sr-only"> no Melhor Rastreio, em nova aba</span></a>{copyError && <p role="status" className="text-xs text-store-muted">Selecione o código acima para copiar.</p>}</div>}
  </div>
}
