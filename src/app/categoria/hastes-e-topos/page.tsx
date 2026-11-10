import type { Metadata } from 'next'
import LabretCategoryPage from '@/components/catalog/LabretCategoryPage'

export const dynamic = 'force-dynamic'

const description = 'Hastes e conectores para compor suas joias. Confira a medida e a compatibilidade de cada peça.'

export const metadata: Metadata = { title: 'Hastes e conectores', description }

export default function CategoryPage({ searchParams = {} }: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  return <LabretCategoryPage categorySlug="hastes-e-conectores" categoryName="Hastes e conectores" description={description} searchParams={searchParams} />
}
