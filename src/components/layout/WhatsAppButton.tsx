'use client'

import { useCartStore } from '@/lib/cart'
import { STORE_INFORMATION } from '@/lib/store-information'

export default function WhatsAppButton() {
  const cartOpen = useCartStore(state => state.isOpen)
  if (cartOpen || !STORE_INFORMATION.whatsapp) return null
  return <a href={STORE_INFORMATION.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Falar com a Lunarity pelo WhatsApp (abre em nova aba)" title="Fale com a Lunarity" className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-[#217A50] text-white shadow-lg transition-colors hover:bg-[#185D3C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#217A50] sm:bottom-6 sm:right-6">
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-7 w-7"><path d="M20.52 3.48A11.86 11.86 0 0 0 12.08 0C5.5 0 .14 5.35.14 11.93c0 2.1.55 4.15 1.6 5.96L.04 24l6.25-1.64a11.95 11.95 0 0 0 5.78 1.47h.01c6.58 0 11.94-5.35 11.94-11.93 0-3.19-1.24-6.18-3.5-8.42ZM12.08 21.8a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.71.97.99-3.62-.23-.37a9.87 9.87 0 0 1-1.51-5.26c0-5.47 4.45-9.92 9.93-9.92a9.85 9.85 0 0 1 7.02 2.91 9.85 9.85 0 0 1 2.9 7.02c0 5.47-4.45 9.92-9.99 9.86Zm5.44-7.43c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.09 4.49.71.31 1.27.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" /></svg>
  </a>
}
