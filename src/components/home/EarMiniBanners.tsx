import Image from 'next/image'
import Link from 'next/link'

export default function EarMiniBanners({images={}}:{images?:Record<string,string>}={}) {
  const items = [
    { name: 'Hastes e conectores', slug: 'hastes-e-conectores' },
    { name: 'Correntes e pingentes', slug: 'correntes-e-pingentes' },
    { name: 'Argolas', slug: 'argolas' },
    { name: 'Labret', slug: 'labret' },
  ]
  return <nav aria-label="Explore as joias para orelha" className="grid w-full grid-cols-2 gap-[2px] bg-[color:var(--home-border,white)] py-[2px] md:grid-cols-4">
    {items.map(item => <Link key={item.slug} href={`/categoria/${item.slug}`} className="group min-w-0 overflow-hidden bg-[color:var(--home-surface,#F0EBE3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#947B57]">
      <div className="relative aspect-[4/3] overflow-hidden bg-[color:var(--home-surface,#F6F3EE)] sm:aspect-[3/2]"><picture>{!images[`/categoria/${item.slug}`] && <source media="(max-width: 639px)" srcSet={`/banners/lunarity-detalhes/${item.slug}-mobile.webp`} />}<Image src={images[`/categoria/${item.slug}`] || `/banners/lunarity-detalhes/${item.slug}-desktop.webp`} alt="" fill sizes="(max-width: 767px) 50vw, 25vw" className="object-cover object-center transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none" /></picture></div>
      <div className="flex min-h-[44px] items-center justify-between gap-2 px-3 py-2 sm:px-4"><span className="text-[10px] leading-4 text-[color:var(--home-muted,#625B51)] sm:text-[11px]">{item.name}</span><span aria-hidden="true" className="shrink-0 text-sm text-[color:var(--home-muted,#756B5D)]">→</span></div>
    </Link>)}
  </nav>
}
