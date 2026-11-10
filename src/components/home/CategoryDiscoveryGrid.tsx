import Image from 'next/image'
import Link from 'next/link'

interface DiscoveryBanner {
  name: string
  subtitle: string
  href: string
  image?: string
  mobileImage?: string
  alt?: string
}

export function arrangeDiscoveryBanners(items: DiscoveryBanner[]) {
  const unique = items.filter((item, index) => items.findIndex(other => other.href.replace(/\/+$/, '') === item.href.replace(/\/+$/, '')) === index)
  const preferred = ['/orelha', '/nariz', '/categoria/umbigo']
  const featured = preferred.map(href => unique.find(item => item.href.replace(/\/$/, '') === href)).filter((item): item is DiscoveryBanner => Boolean(item))
  for (const item of unique) {
    if (featured.length >= 3) break
    if (!featured.includes(item)) featured.push(item)
  }
  return { featured, more: unique.filter(item => !featured.includes(item)) }
}

function Arrow() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12" stroke="currentColor" strokeWidth="1.3" /></svg>
}

function BannerCard({ item, index, compact = false }: { item: DiscoveryBanner; index: number; compact?: boolean }) {
  return (
    <Link href={item.href} className={`lunarity-discovery-card${compact ? ' lunarity-discovery-card-small' : ''}`}>
      {item.image && <picture>{item.mobileImage && <source media="(max-width: 767px)" srcSet={item.mobileImage} />}<Image src={item.image} alt={item.alt || `Joias para ${item.name.toLowerCase()}`} fill sizes={compact ? '(max-width: 767px) 50vw, 20vw' : '(max-width: 767px) 100vw, 50vw'} className="lunarity-discovery-photo" /></picture>}
      <span className="lunarity-discovery-shade" aria-hidden="true" />
      <span className="lunarity-discovery-index" aria-hidden="true">{String(index + 1).padStart(2, '0')} <span>✧</span></span>
      <span className="lunarity-discovery-caption"><span><span className="lunarity-discovery-title">{item.name}</span>{!compact && <span className="lunarity-discovery-subtitle">{item.subtitle}</span>}</span><span className="lunarity-discovery-arrow"><Arrow /></span></span>
    </Link>
  )
}

export default function CategoryDiscoveryGrid({ items }: { items: DiscoveryBanner[] }) {
  if (!items.length) return null
  const { featured, more } = arrangeDiscoveryBanners(items)
  return (
    <section className="lunarity-discovery mx-auto max-w-7xl px-4 py-9 sm:px-6 md:px-10 md:py-14" aria-labelledby="discovery-title">
      <div className="lunarity-discovery-heading"><div><p className="lunarity-home-eyebrow">UM DETALHE. NOVAS POSSIBILIDADES.</p><h2 id="discovery-title" className="font-display text-2xl font-medium tracking-tight sm:text-3xl md:text-4xl">Qual vai ser sua próxima combinação?</h2></div><Link href="/categoria/todos" className="lunarity-discovery-all">Todas as joias <Arrow /></Link></div>
      <div className="lunarity-discovery-grid" data-count={featured.length}>{featured.map((item, index) => <BannerCard key={item.href} item={item} index={index} />)}</div>
      {more.length > 0 && <div className="lunarity-discovery-more">{more.map((item, index) => <BannerCard key={item.href} item={item} index={index + featured.length} compact />)}</div>}
    </section>
  )
}
