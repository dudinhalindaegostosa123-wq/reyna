import Link from 'next/link'
import { MapPin, ArrowUpRight } from 'lucide-react'
import { STORE_INFORMATION } from '@/lib/store-information'

export default function Footer() {
  return (
    <footer className="bg-[#000000] text-white">
      <div className="max-w-7xl mx-auto px-4 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {/* Brand */}
        <div className="space-y-4">
          <span className="font-display text-2xl tracking-[0.2em] font-light">LUNARITY</span>
          <p className="text-[13px] text-[#B9B7B1] leading-relaxed max-w-52">
            Joias para piercing em titânio e ouro 18K. Conheça os materiais, medidas e acabamentos de cada peça.
          </p>
        </div>

        {/* Atendimento */}
        <div className="space-y-4">
          <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#B9B7B1]">Atendimento</h3>
          <ul className="space-y-3 text-[13px]">
            {[
              { label: 'Fale conosco', href: STORE_INFORMATION.whatsapp },
              { label: 'Meus pedidos e rastreamento', href: '/minha-conta' },
              { label: 'Entrega, pagamento e ajuda', href: '/ajuda' },
              { label: 'Solicitar troca ou devolução', href: `mailto:${STORE_INFORMATION.email}` },

            ].filter(l => l.href && l.href !== 'mailto:').map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-[#B9B7B1] hover:text-white transition-colors">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Sobre */}
        <div className="space-y-4">
          <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#B9B7B1]">Sobre</h3>
          <ul className="space-y-3 text-[13px]">
            {[
              { label: 'Projetos auriculares', href: '/projeto-auricular' },
              { label: 'Materiais & Segurança', href: '/materiais' },
              { label: 'Todas as joias', href: '/categoria/todos' },

            ].filter(l => l.href && l.href !== 'mailto:').map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-[#B9B7B1] hover:text-white transition-colors">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Social */}
        {(STORE_INFORMATION.instagram || STORE_INFORMATION.whatsapp || STORE_INFORMATION.email) && <div className="space-y-4">
          <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#B9B7B1]">Siga a Lunarity</h3>
          <ul className="space-y-3 text-[13px]">
            {STORE_INFORMATION.instagram && <li>
              <a
                href={STORE_INFORMATION.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#B9B7B1] hover:text-white transition-colors"
              >
                Instagram
              </a>
            </li>}
            {STORE_INFORMATION.whatsapp && <li>
              <a
                href={STORE_INFORMATION.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#B9B7B1] hover:text-white transition-colors"
              >
                WhatsApp
              </a>
            </li>}

          </ul>
          {STORE_INFORMATION.email && <div className="pt-2 text-[12px] text-[#B9B7B1]">
            <a href={`mailto:${STORE_INFORMATION.email}`} className="break-all hover:text-white">{STORE_INFORMATION.email}</a>
          </div>}
        </div>}
      </div>

      {STORE_INFORMATION.googleMaps && <section aria-labelledby="physical-store-title" className="mx-auto max-w-7xl border-t border-[#292621] px-4 py-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3"><MapPin size={23} strokeWidth={1.4} aria-hidden="true" className="mt-1 shrink-0 text-[#B8986A]" /><div><h3 id="physical-store-title" className="text-base font-light tracking-wide">Conheça nossa loja física</h3><p className="mt-2 max-w-xl text-xs leading-6 text-[#B9B7B1]">Veja nossa localização, os horários de atendimento e as avaliações atualizadas diretamente no Google.</p></div></div>
          <a href={STORE_INFORMATION.googleMaps} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-full border border-[#786446] px-5 text-xs text-[#E2C9A3] transition-colors hover:bg-[#292621]">Ver loja e avaliações no Google<ArrowUpRight size={16} aria-hidden="true" /></a>
        </div>
      </section>}
      {/* Bottom bar */}
      <div className="border-t border-[#222] py-4 px-4">
        <p className="max-w-7xl mx-auto text-[11px] text-[#B9B7B1] text-center">
          © {new Date().getFullYear()} Lunarity. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  )
}
