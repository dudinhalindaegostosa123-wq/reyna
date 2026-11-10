import Image from 'next/image'
import { productStructuredData } from '@/lib/google-merchant'
import { refineProductCopy } from '@/lib/product-copy'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getStoreProduct } from '@/lib/catalog-server'
import ProductPageClient from './ProductPageClient'
import ProductCard from '@/components/ui/ProductCard'

export const dynamic = 'force-dynamic'

interface Props {
  params: { slug: string }
  searchParams?: { variacao?: string }
}

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const result = await getStoreProduct(params.slug)

  if (!result) {
    return { title: 'Produto não encontrado' }
  }

  const copy = refineProductCopy(result.product)
  const description = copy.refined ? copy.summary.slice(0,180) : result.seoDescription
  return {
    title: result.seoTitle,
    description,
    alternates: { canonical: `/produto/${result.product.slug}` },
    openGraph: {
      title: result.seoTitle,
      description,
      images: result.product.images[0]
        ? [{ url: result.product.images[0] }]
        : [],
    },
  }
}

export default async function ProductPage({
  params, searchParams,
}: Props) {
  const result = await getStoreProduct(params.slug)

  if (!result) notFound()
  const copy = refineProductCopy(result.product)
  const product = copy.refined ? {...result.product,description:copy.summary,longDescription:copy.longDescription,technicalPreview:copy.facts.filter(f=>/dimens|comprimento|espessura|diâmetro|rosca|encaixe|mecanismo|fecho/i.test(f.label)).slice(0,3)} : result.product

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productStructuredData(product)).replace(/</g, '\\u003c') }} />
      <ProductPageClient
        initialVariation={searchParams?.variacao}
        product={product}
        related={[]}
      />

      {result.descriptionImages.length > 0 && (
        <section className="bg-store-canvas px-4 pb-12">
          <div className="mx-auto max-w-4xl space-y-6">
            {result.descriptionImages.map((src, index) => (
              <Image
                key={src}
                src={src}
                alt={`${result.product.name} — detalhe ${index + 1}`}
                width={1600}
                height={1600}
                sizes="(max-width: 768px) 100vw, 900px"
                className="h-auto w-full object-contain"
              />
            ))}
          </div>
        </section>
      )}

      {result.related.length > 0 && (
        <section className="border-t border-store-border bg-store-canvas py-16">
          <div className="mx-auto max-w-7xl px-4">
            <h2 className="mb-8 font-display text-4xl font-light">
              Você também pode gostar
            </h2>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
              {result.related.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
