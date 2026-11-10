'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { UserRound } from 'lucide-react'
import CommerceSync from '@/components/cart/CommerceSync'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import CartDrawer from '@/components/cart/CartDrawer'
import CollectionNotice from '@/components/cart/CollectionNotice'
import WhatsAppButton from '@/components/layout/WhatsAppButton'

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname()

  if (path === '/acompanhar' || path.startsWith('/acompanhar/')) return <div className="storefront-theme min-h-screen bg-store-canvas text-store-text">{children}</div>

  if (path === '/admin' || path.startsWith('/admin/')) {
    return <>{children}</>
  }

  if (path === '/checkout' || path === '/pagamento' || path.startsWith('/pagamento/')) {
    return (
      <div className="storefront-theme min-h-screen bg-store-canvas text-store-text">
        <CommerceSync />
        <header className="border-b border-store-border bg-store-surface px-5 py-5">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <a href="/" className="inline-flex min-h-[44px] items-center text-sm tracking-[0.3em]" aria-label="Serenity Piercings — voltar à loja">SERENITY</a>
            <div className="flex items-center gap-2 sm:gap-4">
              <p className="hidden text-right text-[11px] leading-5 text-store-muted sm:block">Pagamento via Mercado Pago<br /><span className="text-store-text">Pix e cartão de crédito</span></p>
              <Link href="/minha-conta" aria-label="Minha conta" title="Minha conta" className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors hover:bg-store-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-current">
                <UserRound size={20} strokeWidth={1.5} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </header>
        {children}
        <footer className="border-t border-store-border px-5 py-6 text-center text-xs leading-6 text-store-muted">
          Serenity Piercings · <a href="/" className="underline underline-offset-4">Voltar à loja</a>
        </footer>
      </div>
    )
  }

  return (
    <div className="storefront-theme min-h-screen bg-store-canvas text-store-text">
      <CommerceSync />
      <Header />
      <main>{children}</main>
      <Footer />
      <CollectionNotice />
      <WhatsAppButton />
      <CartDrawer />
    </div>
  )
}
