import Link from 'next/link'
import {getCatalogFacets} from '@/lib/catalog-facets-server'
import {getSiteBanners} from '@/lib/site-banners'
import {homeImageMap} from '@/lib/home-images'
import { notFound } from 'next/navigation'
import { getStoneDefinitions } from '@/lib/stone-definitions-server'
import { getStoneCollections, getStonePage } from '@/lib/stone-collections-server'
import { normalizeArea, normalizeSubarea } from '@/lib/catalog-area'
import CategoryPageClient from '@/app/categoria/[slug]/CategoryPageClient'
import StoneColorCarousel from '@/components/home/StoneColorCarousel'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
interface Props { params: { cor: string }; searchParams?: Record<string, string | string[] | undefined> }
const text = (value: string | string[] | undefined) => typeof value === 'string' ? value : ''

export async function generateMetadata({ params }: Props) {
  const color = (await getStoneDefinitions()).find(color => color.id === params.cor)
  return { title: color ? `Joias por cor: ${color.name}` : 'Cor não encontrada' }
}

export default async function Page({ params, searchParams = {} }: Props) {
  const [collections,banners]=await Promise.all([getStoneCollections(true),getSiteBanners()])
  const images=homeImageMap(banners,'stone')
  const color = collections.find(color => color.id === params.cor)
  if (!color) notFound()
  const area = normalizeArea(text(searchParams.area))
  const subarea = normalizeSubarea(area, text(searchParams.subarea))
  const material = text(searchParams.material) || 'all'
  const sort = ['price-asc', 'price-desc', 'name-asc'].includes(text(searchParams.sort)) ? text(searchParams.sort) : 'default'
  const requested = Number(text(searchParams.page))
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, 100000) : 1
  const result = await getStonePage(color, { area, subarea, material, sort, page })
  const facets=await getCatalogFacets(color.products.map(product=>product.id),{area,subarea,jewelry:'all',material})
  return <>
    <nav aria-label="Caminho da página" className="mx-auto flex max-w-7xl items-center gap-2 px-4 pt-6 text-xs text-store-muted"><Link href="/" className="inline-flex min-h-[44px] items-center underline">Início</Link><span aria-hidden="true">/</span><span>Joias por cor</span></nav>
    <StoneColorCarousel colors={collections.map(({ id, name, color }) => ({ id, name, color, image:images[`/cores/${id}`] }))} selected={params.cor} />
    <CategoryPageClient products={result.products} categoryName={color.name} categoryDescription="Uma seleção pelas cores das pedras. Escolha a categoria e a subcategoria para encontrar suas joias. Nas peças com variações, selecione a cor desejada ao abrir o produto."
      materials={facets.materials} material={material} sort={sort} area={area}
      areas={facets.areas.map(option => option.value === 'all' ? { value: 'all', label: 'Todas as categorias' } : option)}
      areaLabel="Categoria" subarea={subarea} subareas={facets.subareas}
      page={result.page} total={result.total} totalPages={result.totalPages} />
  </>
}
