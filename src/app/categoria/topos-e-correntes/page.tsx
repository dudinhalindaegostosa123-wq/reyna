import type { Metadata } from 'next'
import LabretCategoryPage from '@/components/catalog/LabretCategoryPage'

export const dynamic = 'force-dynamic'

const description = 'Topos para compor suas joias. Confira a medida e a compatibilidade de cada peça.'

export const metadata: Metadata = { title: 'Topos', description }

export default function CategoryPage({ searchParams = {} }: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  return <LabretCategoryPage categorySlug="topos-e-correntes" categoryName="Topos" description={description} searchParams={searchParams} />
}
