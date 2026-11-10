'use client'
import { useEffect, useState } from 'react'
import { useCartStore, type CartItem } from '@/lib/cart'
import { reviewCheckout } from '@/app/checkout/actions'
import type { CouponCheckoutQuote } from '@/app/checkout/actions'

export function useCollectionQuote(items: CartItem[], enabled = true) {
  const commerceVersion = useCartStore(state=>state.commercePolicy.version)
  const key = JSON.stringify(items.map(item => ({ slug: item.slug, variant: item.variationId || '', quantity: item.quantity, color: item.anodization?.code || '', ...(typeof item.sterilized==='boolean'?{sterilized:item.sterilized}:{}), stem: item.stemLocked ? '' : item.stem || '' })))
  const identity = key+':'+commerceVersion
  const [result, setResult] = useState<{ key: string; quote: CouponCheckoutQuote } | null>(null)
  useEffect(() => {
    if (!enabled || !items.length) return
    let active = true
    const timer = setTimeout(async () => {
      try {
        const response = await reviewCheckout(JSON.parse(key))
        if (active) {
          if(response.quote) useCartStore.getState().applyCanonicalQuote(response.quote.items)
          setResult(response.quote ? { key:identity, quote: response.quote } : null)
        }
      } catch { if (active) setResult(null) }
    }, 350)
    return () => { active = false; clearTimeout(timer) }
  }, [key, identity, enabled, items.length, commerceVersion])
  return result?.key === identity && enabled ? result.quote : null
}
