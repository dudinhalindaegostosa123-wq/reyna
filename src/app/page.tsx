import Image from 'next/image'
import Link from 'next/link'
import { getSiteBanners } from '@/lib/site-banners'
import { getStorePage } from '@/lib/catalog-server'
import ProductCard from '@/components/ui/ProductCard'
import { LunarMark } from '@/components/brand/Brand'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CATEGORIES = [
  { name: 'Orelha', note: 'Uma composição, infinitas versões.', href: '/orelha', image: '/banners/orelha.webp', number: '01' },
  { name: 'Nariz', note: 'O detalhe que muda tudo.', href: '/nariz', image: '/banners/nariz.webp', number: '02' },
  { name: 'Umbigo', note: 'Seu brilho em novos lugares.', href: '/categoria/umbigo', image: '/banners/umbigo.webp', number: '03' },
]

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="ln-arrow"><path d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h16m-6-6 6 6-6 6'} stroke="currentColor" strokeWidth="1.3" /></svg>
}

async function selection() {
  try {
    const arrivals = await getStorePage({ category: 'novidades', perPage: 4 })
    if (arrivals.products.length) return arrivals.products
    return (await getStorePage({ perPage: 4 })).products
  } catch {
    console.error('[lunarity-home]', { code: 'CATALOG_UNAVAILABLE' })
    return []
  }
}

export default async function HomePage() {
  const [products, banners] = await Promise.all([selection(), getSiteBanners().catch(() => null)])
  const heroImage = banners?.find(banner => banner.slot === 'hero')?.image_desktop || '/banners/titanio.webp'

  return (
    <div className="lunarity-home">
      <section className="ln-hero ln-container" aria-labelledby="home-title">
        <div className="ln-hero-copy">
          <p className="ln-eyebrow"><span className="ln-tiny-star" aria-hidden="true">✦</span> PIERCINGS PARA A SUA ÓRBITA</p>
          <h1 id="home-title">Seu brilho.<br />Em cada <em>fase.</em></h1>
          <p className="ln-hero-description">Um detalhe pode dizer muito sobre você. Encontre joias que acompanham seu estilo, suas mudanças e tudo o que faz você ser única.</p>
          <div className="ln-hero-actions">
            <Link href="/categoria/todos" className="ln-button">Encontrar minha joia <Arrow /></Link>
            <Link href="/materiais/titanio" className="ln-text-link">Por que titânio? <Arrow diagonal /></Link>
          </div>
          <div className="ln-hero-signature"><LunarMark className="ln-signature-mark" /><span>Feita de fases.<br /><strong>Cheia de possibilidades.</strong></span></div>
        </div>
        <div className="ln-hero-art">
          <div className="ln-orbit ln-orbit-one" aria-hidden="true" />
          <span className="ln-orbit-star" aria-hidden="true">✦</span>
          <div className="ln-hero-photo"><Image src={heroImage} alt="Detalhes e acabamento de joias para piercing" fill priority sizes="(max-width: 767px) 90vw, 48vw" className="ln-cover" /></div>
          <div className="ln-photo-note"><span className="ln-photo-dot" aria-hidden="true" /><span>O extraordinário<br /><strong>mora nos detalhes.</strong></span></div>
          <span className="ln-image-caption">LUNARITY — UM UNIVERSO SEU</span>
        </div>
      </section>

      <nav className="ln-discover" aria-label="Explore as joias por região">
        <div className="ln-container ln-discover-inner"><span className="ln-eyebrow">ENCONTRE SEU PRÓXIMO DETALHE</span><div className="ln-discover-links">
          {CATEGORIES.map(item => <Link key={item.href} href={item.href}>{item.name} <Arrow diagonal /></Link>)}
          <Link href="/boca">Boca <Arrow diagonal /></Link><Link href="/categoria/todos">Todas as joias <Arrow diagonal /></Link>
        </div></div>
      </nav>

      <section className="ln-container ln-section" aria-labelledby="collections-title">
        <div className="ln-section-heading"><div><p className="ln-eyebrow">ESCOLHAS QUE SÃO A SUA CARA</p><h2 id="collections-title">Um universo de<br /><em>possibilidades.</em></h2></div><p>Discreta, marcante ou um pouco dos dois.<br />A sua composição começa por você.</p></div>
        <div className="ln-categories">
          {CATEGORIES.map(item => <Link href={item.href} key={item.href} className="ln-category">
            <div className="ln-category-image"><Image src={item.image} alt={`Joias para ${item.name.toLowerCase()}`} fill sizes="(max-width: 767px) 85vw, 33vw" className="ln-cover" /><span className="ln-category-number">{item.number}</span></div>
            <div className="ln-category-label"><div><h3>{item.name}</h3><p>{item.note}</p></div><span className="ln-circle-arrow"><Arrow diagonal /></span></div>
          </Link>)}
        </div>
      </section>

      <section className="ln-selection" aria-labelledby="arrivals-title"><div className="ln-container ln-section">
        <div className="ln-section-heading"><div><p className="ln-eyebrow">PARA ENTRAR NA SUA ÓRBITA</p><h2 id="arrivals-title">Seu próximo <em>favorito.</em></h2></div><Link className="ln-text-link" href="/categoria/todos">Explorar o catálogo <Arrow diagonal /></Link></div>
        {products.length > 0 ? <div className="ln-products">{products.map(product => <ProductCard key={product.id} product={product} />)}</div> : <div className="ln-catalog-empty"><LunarMark className="ln-signature-mark" /><p>Novas descobertas estão chegando por aqui.</p><Link href="/categoria/todos" className="ln-text-link">Conhecer o catálogo <Arrow /></Link></div>}
      </div></section>

      <section className="ln-container ln-material-section" aria-labelledby="material-title">
        <div className="ln-material-art"><div className="ln-material-photo"><Image src="/banners/titanio.webp" alt="Encaixe e acabamento de uma joia de titânio" fill sizes="(max-width: 767px) 90vw, 42vw" className="ln-cover" /></div><span className="ln-material-seal" aria-hidden="true">Ti<span>TITÂNIO</span></span></div>
        <div className="ln-material-copy"><p className="ln-eyebrow">BELEZA QUE VAI ALÉM DO BRILHO</p><h2 id="material-title">O material também<br />faz parte da <em>escolha.</em></h2><p>O desenho encanta. O acabamento e a composição merecem a mesma atenção. Conheça o titânio e confira o material, as medidas e o encaixe de cada joia antes de escolher a sua.</p><Link href="/materiais/titanio" className="ln-text-link">Descobrir o titânio <Arrow diagonal /></Link></div>
      </section>

      <section className="ln-manifesto" aria-labelledby="manifesto-title"><div className="ln-container"><LunarMark className="ln-manifesto-mark" /><p className="ln-eyebrow">O SEU ESTILO NÃO PRECISA SER SEMPRE O MESMO.</p><h2 id="manifesto-title">Você muda.<br />Seu brilho <em>continua.</em></h2><p>Uma joia para cada momento. Um universo inteiro para ser você.</p><Link href="/categoria/todos" className="ln-button ln-button-light">Descobrir a Lunarity <Arrow /></Link></div></section>
    </div>
  )
}
