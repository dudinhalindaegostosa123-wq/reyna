'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCartStore } from '@/lib/cart'
import { useCollectionQuote } from './useCollectionQuote'
import { collectionProgressMessage, COLLECTION_TIER_SUMMARY, COLLECTION_MAX_PERCENT } from '@/lib/collection-progress'
export default function CollectionNotice() {
  const pathname = usePathname()
  const items = useCartStore(state => state.items)
  const cartOpen = useCartStore(state => state.isOpen)
  const [minimized, setMinimized] = useState(false)
  const [available, setAvailable] = useState<{ path: string; enabled: boolean; pix: boolean } | null>(null)
  const visiblePage = !pathname.startsWith('/minha-conta') && pathname !== '/carrinho'
  const enabled = visiblePage && available?.path === pathname && available.enabled
  const quote = useCollectionQuote(items, Boolean(enabled) && !cartOpen)
  useEffect(() => {
    if (!visiblePage) return
    const controller = new AbortController()
    fetch('/api/collection/status', { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : { enabled: false, pix: false })
      .then(result => setAvailable({ path: pathname, enabled: result.enabled === true, pix: result.pix === true }))
      .catch(() => { if (!controller.signal.aborted) setAvailable({ path: pathname, enabled: false, pix: false }) })
    return () => controller.abort()
  }, [pathname, visiblePage])
  if (!enabled || cartOpen || (items.length > 0 && (!quote?.progressive || quote.pricing_mode === 'wholesale'))) return null
  const message = collectionProgressMessage(quote?.progressive?.quantity || 0)
  return <aside aria-label="Desconto progressivo" className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 z-20 max-w-[calc(100vw-2rem)] text-store-text sm:bottom-6 sm:left-6">
    {minimized ? <button type="button" onClick={() => setMinimized(false)} aria-expanded={false} aria-controls="collection-floating-details" className="inline-flex min-h-[44px] items-center gap-3 rounded-full border border-store-border bg-store-raised px-4 py-2 text-xs shadow-lg transition-colors hover:bg-store-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#947B57]">
      <span aria-hidden="true" className="text-store-accent">✧</span> Até {COLLECTION_MAX_PERCENT}% OFF nas suas joias <span aria-hidden="true">＋</span>
    </button> : <div id="collection-floating-details" className="w-[290px] max-w-full rounded-2xl border border-store-border bg-store-raised p-4 shadow-[0_8px_32px_rgba(41,38,33,0.12)]">
      <div className="flex items-center justify-between gap-2"><p className="text-[10px] uppercase tracking-[0.16em] text-store-accent">Lunarity Collection</p><button type="button" aria-label="Minimizar aviso de desconto" aria-expanded={true} aria-controls="collection-floating-details" onClick={() => setMinimized(true)} className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-store-muted hover:bg-store-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#947B57]"><span aria-hidden="true">−</span></button></div>
      <p className="text-sm font-medium">Mais joias, mais benefícios.</p>
      <p className="mt-2 text-[11px] leading-5 text-store-muted">{COLLECTION_TIER_SUMMARY}</p>
      <p role="status" aria-live="polite" className="mt-2 text-xs leading-5">{message}</p>
      <p className="mt-2 text-[10px] leading-4 text-store-muted">Ouro 18K e Bioflex não participam do progressivo.</p>
      <Link href={items.length ? '/carrinho' : '/categoria/todos'} className="mt-3 inline-flex min-h-[44px] items-center gap-3 text-xs font-medium underline underline-offset-4">{items.length ? 'Ver meu carrinho' : 'Escolher minhas joias'} <span aria-hidden="true">→</span></Link>
      <p className="mt-1 text-[10px] leading-4 text-store-muted">{available?.pix ? 'Acumulável com cupom e 5% OFF no Pix.' : 'Acumulável com cupom.'}</p>
    </div>}
  </aside>
}
