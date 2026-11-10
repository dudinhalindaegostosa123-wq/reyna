import Image from 'next/image'
import Link from 'next/link'
import MaterialChoices from '@/components/materials/MaterialChoices'

export default function MaterialsSection() {
  return (
    <section aria-labelledby="materials-title" className="lunarity-materials mx-auto max-w-7xl px-4 py-10 sm:px-6 md:px-10 md:py-16">
      <div className="grid items-center gap-7 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-[#101010]">
          <Image src="/banners/lunarity-materiais.webp" alt="Joias com acabamentos prateado, dourado e transparente sobre pedras pretas" fill sizes="(max-width: 1023px) 92vw, 550px" className="object-cover" />
        </div>
        <div>
          <p className="mb-4 text-[10px] uppercase tracking-[0.2em] text-[#947B57]">Conheça nossos materiais</p>
          <h2 id="materials-title" className="text-[38px] leading-[1.02] tracking-[-0.025em] sm:text-[46px]" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>Cada detalhe começa na escolha do material.</h2>
          <p className="mb-5 mt-4 text-[13px] leading-6 text-[color:var(--home-muted,#746D63)]">Conheça os materiais, seus acabamentos e os cuidados para escolher sua próxima joia.</p>
          <div className="lunarity-material-choices"><MaterialChoices /></div>
          <Link href="/materiais" className="mt-6 flex min-h-[48px] items-center justify-between gap-6 rounded-lg border border-[#947B57]/50 bg-[#171511] px-5 py-3 text-[12px] text-[#F2F1ED] transition-colors hover:border-[#C5AD86] hover:bg-[#242019]">Explorar materiais <span aria-hidden="true">⟶</span></Link>
        </div>
      </div>
    </section>
  )
}
