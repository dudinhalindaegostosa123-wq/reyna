'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useCartStore } from '@/lib/cart'

// Existing product and auricular-project actions open the full cart page.
export default function CartDrawer() {
  const { isOpen, closeCart } = useCartStore()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!isOpen) return
    closeCart()
    if (pathname !== '/carrinho') router.push('/carrinho')
  }, [isOpen, closeCart, pathname, router])

  return null
}
