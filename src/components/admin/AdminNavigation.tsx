'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import {
  LayoutDashboard,
  ShoppingBag,
  CreditCard,
  ShoppingCart,
  Users,
  Store,
  Package,
  FolderOpen,
  Sparkles,
  ClipboardCheck,
  Tag,
  Ticket,
  Image,
  Truck,
  Settings,
  Mail,
  Menu,
  X,
  ExternalLink,
} from 'lucide-react'

const groups = [
  { label: 'Dia a dia', links: [
    { href: '/admin/operacao', label: 'Visão geral', icon: LayoutDashboard },
    { href: '/admin/pedidos', label: 'Vendas e pedidos', icon: ShoppingBag },
    { href: '/admin/produtos', label: 'Produtos', icon: Package },
    { href: '/admin/clientes', label: 'Clientes', icon: Users },
    { href: '/admin/frete', label: 'Envios', icon: Truck },
    { href: '/admin/pagamentos', label: 'Pagamentos', icon: CreditCard },
  ] },
  { label: 'Catálogo', links: [
    { href: '/admin/categorias', label: 'Categorias', icon: FolderOpen },
    { href: '/admin/cores', label: 'Cores das pedras', icon: Sparkles },
    { href: '/admin/projetos', label: 'Projetos auriculares', icon: Sparkles },
    { href: '/admin/qualidade', label: 'Revisão do catálogo', icon: ClipboardCheck },
    { href: '/admin/precos', label: 'Reajuste de preços', icon: Tag },
    { href: '/admin/compras', label: 'Compras do fornecedor', icon: ShoppingCart },
  ] },
  { label: 'Loja e promoções', links: [
    { href: '/admin/banners', label: 'Banners', icon: Image },
    { href: '/admin/campanhas', label: 'Campanhas', icon: Tag },
    { href: '/admin/cupons', label: 'Cupons', icon: Ticket },
    { href: '/admin/atacado', label: 'Atacado', icon: Store },
    { href: '/admin/mais-vendidos', label: 'Mais vendidos', icon: ShoppingBag },
    { href: '/admin/checkouts', label: 'Checkouts não concluídos', icon: ShoppingCart },
    { href: '/admin/mensuracao', label: 'Mensuração', icon: LayoutDashboard },
  ] },
  { label: 'Configurações', links: [
    { href: '/admin/emails', label: 'E-mails', icon: Mail },
    { href: '/admin/configuracoes', label: 'Configurações', icon: Settings },
  ] },
  { label: 'Histórico', links: [
    { href: '/admin/historico', label: 'Histórico do site antigo', icon: ShoppingBag },
  ] },
]

export default function AdminNavigation() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  if (pathname === '/admin/login') {
    return null
  }

  return (
    <aside className="w-full border-b border-[#E5DED3] bg-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-4 px-5 py-4 lg:px-6 lg:py-7">
        <Link
          href="/admin/operacao"
          onClick={() => setMobileOpen(false)}
          className="inline-flex min-h-[44px] flex-col justify-center"
        >
          <span className="text-sm font-medium tracking-[0.2em]">
            LUNARITY
          </span>

          <span className="mt-1 text-xs text-[#81796C]">
            Administração
          </span>
        </Link>

        <button
          type="button"
          aria-label={
            mobileOpen ? 'Fechar menu' : 'Abrir menu'
          }
          aria-expanded={mobileOpen}
          aria-controls="admin-navigation"
          onClick={() =>
            setMobileOpen(current => !current)
          }
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#E5DED3] lg:hidden"
        >
          {mobileOpen ? (
            <X size={20} aria-hidden="true" />
          ) : (
            <Menu size={20} aria-hidden="true" />
          )}
        </button>
      </div>

      <div
        id="admin-navigation"
        className={`${
          mobileOpen ? 'block' : 'hidden'
        } px-4 pb-5 lg:block`}
      >
        <nav
          aria-label="Administração"
          className="space-y-6"
        >
          {groups.map(group => <section key={group.label} aria-label={group.label}>
            <h2 className="mb-2 px-4 text-[10px] font-medium uppercase tracking-[0.16em] text-[#947B57]">{group.label}</h2>
            <div className="space-y-1">{group.links.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              pathname.startsWith(`${href}/`)

            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                aria-current={
                  active ? 'page' : undefined
                }
                className={`flex min-h-[44px] items-center gap-3 rounded-xl px-4 py-2 text-[13px] transition-colors ${
                  active
                    ? 'bg-[#292621] text-white'
                    : 'text-[#756B5D] hover:bg-[#F1EBE1]'
                }`}
              >
                <Icon
                  size={18}
                  className="shrink-0"
                  aria-hidden="true"
                />

                <span>{label}</span>
              </Link>
            )
          })}</div></section>)}
        </nav>

        <div className="mt-6 border-t border-[#E5DED3] pt-4">
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className="flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-sm text-[#756B5D] transition-colors hover:bg-[#F1EBE1]"
          >
            <ExternalLink
              size={18}
              aria-hidden="true"
            />

            <span>Ver loja</span>
          </Link>
        </div>
      </div>
    </aside>
  )
}
