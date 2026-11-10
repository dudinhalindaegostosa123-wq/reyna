import type { Metadata } from 'next'
import Link from 'next/link'
import MaterialChoices from '@/components/materials/MaterialChoices'

const title = 'Materiais para piercing: titânio, ouro 18K e Bioflex'
const description = 'Conheça as diferenças entre titânio grau implante, titânio revestido de ouro 24K, ouro maciço e Bioflex. Veja especificações, cuidados e como escolher sua joia.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/materiais' },
  openGraph: { title, description, url: '/materiais', type: 'website', images: [{ url: '/banners/titanio.webp', alt: 'Detalhe de uma joia de titânio' }] },
}


const faqs = [
  { question: 'Qual material escolher para a primeira perfuração?', answer: 'A escolha deve ser feita com um piercer, considerando anatomia, documentação do material, acabamento e tamanho. Titânio com certificação adequada é uma das opções citadas pela Association of Professional Piercers. Nem toda joia de titânio, ouro ou polímero é automaticamente indicada para a perfuração inicial.' },
  { question: 'Titânio dourado é a mesma coisa que ouro 18K?', answer: 'Não. Uma joia de titânio com acabamento dourado tem uma base diferente da joia de ouro 18K maciço. A cor também pode resultar de processos distintos, como anodização ou revestimento. Confira a composição e a descrição da peça.' },
  { question: 'PVD black e titânio natural são o mesmo acabamento?', answer: 'Não. O titânio natural apresenta o acabamento metálico da peça, enquanto PVD black indica um revestimento escuro aplicado por um processo de deposição. A indicação de uso e os cuidados dependem da especificação desse revestimento.' },
  { question: 'Um material pode garantir que não haverá alergia?', answer: 'Nenhum material garante ausência de reações para todas as pessoas. Confira a composição da joia e informe sensibilidades conhecidas ao seu profissional. Em caso de dor persistente, inchaço ou outros sinais de alteração, procure avaliação profissional.' },
  { question: 'Como saber a composição da joia que quero comprar?', answer: 'Consulte o campo de material e a descrição do produto, incluindo informações sobre revestimento, medidas e especificação. Se houver dúvida sobre a liga ou a documentação, fale com a equipe Serenity antes da compra.' },
]

export default function MaterialsPage() {
  const breadcrumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Início', item: 'https://serenitypiercings.com.br' },
    { '@type': 'ListItem', position: 2, name: 'Materiais', item: 'https://serenitypiercings.com.br/materiais' },
  ] }
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-store-text sm:px-6 md:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs).replace(/</g, '\\u003c') }} />
      <nav aria-label="Caminho da página" className="mb-10 text-xs text-store-muted"><Link href="/" className="underline underline-offset-4">Início</Link><span aria-hidden="true"> / </span>Materiais</nav>
      <header className="mb-10 max-w-3xl">
        <p className="mb-4 text-[10px] uppercase tracking-[0.2em] text-store-accent">Conheça nossos materiais</p>
        <h1 className="text-4xl leading-tight md:text-6xl" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>Materiais para piercing: cada detalhe começa na escolha.</h1>
        <p className="mt-5 text-sm leading-7 text-store-muted">Titânio, ouro e materiais flexíveis têm composições, acabamentos e cuidados diferentes. Este guia ajuda você a entender essas diferenças e a conferir as informações da sua próxima joia.</p>
      </header>
      <nav aria-label="Explore os materiais" className="mb-14 max-w-2xl"><MaterialChoices /></nav>
      <section aria-labelledby="choice-title" className="border-t border-store-border py-10">
        <h2 id="choice-title" className="mb-5 text-2xl font-medium">Antes de escolher sua joia</h2>
        <ul className="list-disc space-y-3 pl-5 text-sm leading-7 text-store-muted">
          <li>Confira o material da base e qualquer revestimento separadamente.</li>
          <li>Verifique espessura, comprimento ou diâmetro e o sistema de encaixe.</li>
          <li>Para perfurações recentes, peça avaliação e documentação ao profissional.</li>
          <li>Siga o cuidado indicado para a peça e para a fase de cicatrização. Não troque uma joia em cicatrização por conta própria.</li>
        </ul>
      </section>
      <section aria-labelledby="faq-title" className="border-t border-store-border py-10">
        <h2 id="faq-title" className="mb-5 text-2xl font-medium">Dúvidas sobre materiais para piercing</h2>
        {faqs.map(faq => <details key={faq.question} className="border-b border-store-border py-4"><summary className="cursor-pointer text-sm font-medium leading-6">{faq.question}</summary><p className="mt-3 max-w-3xl text-sm leading-7 text-store-muted">{faq.answer}</p></details>)}
      </section>
      <aside className="rounded-xl bg-store-raised p-6 text-sm leading-7 text-store-muted">
        <p>Este conteúdo é informativo e não substitui uma avaliação individual. A disponibilidade dos materiais e as especificações variam entre os produtos.</p>
        <p className="mt-3">Referência técnica: <a href="https://safepiercing.org/jewelry-for-initial-piercings/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Association of Professional Piercers — Jewelry for Initial Piercings (em inglês)</a>.</p>
        <Link href="/categoria/todos" className="mt-5 inline-flex min-h-[44px] items-center rounded-full bg-store-action px-6 text-xs text-white">Encontrar minha próxima joia →</Link>
      </aside>
    </main>
  )
}
