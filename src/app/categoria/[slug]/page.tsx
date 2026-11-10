import {getCatalogFacets} from '@/lib/catalog-facets-server'
import { notFound } from 'next/navigation'

import { getStoreCategory } from '@/lib/catalog-server'
import { getCategoryDisplayName } from '@/lib/category-settings-server'

import {
  getAreaPage,
  normalizeArea,
  normalizeSubarea,
  normalizeJewelry,
  supportsAreaFilter,
  supportsJewelryFilter,
} from '@/lib/catalog-area'

import CategoryPageClient from './CategoryPageClient'

interface Props {
  params: {
    slug: string
  }
  searchParams?: Record<
    string,
    string | string[] | undefined
  >
}

function value(
  input: string | string[] | undefined
): string {
  return Array.isArray(input)
    ? input[0] || ''
    : input || ''
}

export async function generateMetadata({
  params,
}: Props) {
  const category = await getStoreCategory(params.slug)

  if (!category) {
    return {
      title: 'Categoria não encontrada',
    }
  }

  const name = await getCategoryDisplayName(
    params.slug,
    category.name
  )

  return {
    title: name,
    description: category.description || undefined,
  }
}

export default async function CategoryPage({
  params,
  searchParams = {},
}: Props) {
  const category = await getStoreCategory(params.slug)

  if (!category) notFound()

  const categoryName = await getCategoryDisplayName(
    params.slug,
    category.name
  )

  const sort = value(searchParams.sort) || 'default'
  const material = value(searchParams.material) || 'all'

  const showAreaFilter = supportsAreaFilter(params.slug)

  const showJewelryFilter = supportsJewelryFilter(
    params.slug
  )

  const area = showAreaFilter
    ? normalizeArea(value(searchParams.area) || 'all')
    : 'all'

  const subarea = normalizeSubarea(
    area,
    value(searchParams.subarea) || 'all'
  )

  const jewelry = showJewelryFilter
    ? normalizeJewelry(
        value(searchParams.jewelry) || 'all'
      )
    : 'all'

  const result = await getAreaPage({
    category: params.slug,
    area,
    subarea,
    jewelry,
    material,
    sort,
    page: Number(value(searchParams.page)) || 1,
    perPage: 12,
  })

  const facets=await getCatalogFacets(params.slug,{area,subarea,jewelry,material})

  return (
    <CategoryPageClient
      products={result.products}
      categoryName={categoryName}
      categoryDescription={category.description}
      materials={facets.materials}
      material={material}
      sort={sort}
      area={area}
      areas={showAreaFilter ? facets.areas : []}
      subarea={subarea}
      subareas={
        showAreaFilter ? facets.subareas : []
      }
      jewelry={jewelry}
      jewelryOptions={
        showJewelryFilter ? facets.jewelry : []
      }
      page={result.page}
      total={result.total}
      totalPages={result.totalPages}
    />
  )
}
