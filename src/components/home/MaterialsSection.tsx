import Image from 'next/image'
import Link from 'next/link'
import MaterialChoices from '@/components/materials/MaterialChoices'

export default function MaterialsSection() {
  return (
    <section aria-labelledby="materials-title" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 md:px-10 md:py-16">
      <div className="grid items-center gap-7 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div className="relative aspect-square overflow-hidden rounded-xl bg-[#F3EFE8]">
          <Image src="/banners/materiais.png" alt="Joias com acabamentos prateado, dourado e transparente sobre tecido claro" fill sizes="(max-width: 1023px) 92vw, 550px" className="object-cover" />
        </div>
        <div>
          <p className="mb-4 text-[10px] uppercase tracking-[0.2em] text-[#947B57]">Conheça nossos materiais</p>
          <h2 id="materials-title" className="text-[38px] leading-[1.02] tracking-[-0.025em] sm:text-[46px]" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>Cada detalhe começa na escolha do material.</h2>
          <p className="mb-5 mt-4 text-[13px] leading-6 text-[color:var(--home-muted,#746D63)]">Conheça os materiais, seus acabamentos e os cuidados para escolher sua próxima joia.</p>
          <MaterialChoices />
          <Link href="/materiais" className="mt-5 flex min-h-[46px] items-center justify-center gap-6 rounded-full bg-[#292621] px-6 py-3 text-[12px] text-white transition-colors hover:bg-[#504638]">Explorar materiais <span aria-hidden="true">⟶</span></Link>
        </div>
      </div>
    </section>
  )
}
