'use server'

import { getStoreProduct } from '@/lib/catalog-server'
import { resolveProductSelection } from '@/lib/data'
import type { Product } from '@/lib/data'
import { isStem, supportsSterilization } from '@/lib/commerce'
import { getAnodization } from '@/lib/anodization'

export async function quoteProductForCart(
  slug: string,
  selected: Record<string, string>,
  color?: string,
  stem?: string,
  sterilized?: boolean
): Promise<{ error: string; product?: Product }> {
  try {
    if (
      typeof slug !== 'string' ||
      slug.length > 180 ||
      !selected ||
      typeof selected !== 'object' ||
      Array.isArray(selected) ||
      Object.keys(selected).length > 20 ||
      Object.entries(selected).some(
        ([key, value]) =>
          key.length > 180 ||
          typeof value !== 'string' ||
          value.length > 500
      )
    ) {
      throw new Error('Confira as opções da peça.')
    }

    const result = await getStoreProduct(slug)
    if (!result) throw new Error('Produto não encontrado.')

    const product = result.product
    if(sterilized !== undefined && (typeof sterilized!=='boolean' || !product.preparationOptions || ![5,10].includes(product.sterilizationFee || 0) || !supportsSterilization(product,product.preparationAllProducts))) throw new Error('Atualize a página para conferir a opção de esterilização.')
    const selection = resolveProductSelection(product, selected)

    if (!selection?.inStock || !selection.priceAvailable) {
      throw new Error(
        'Esta opção está indisponível. Atualize a página para conferir.'
      )
    }

    if(stem && (!product.includesStem || (!isStem(stem) || !selection.stemLength && !['6','8'].includes(stem)) || selection.stemLength && selection.stemLength!==stem)) throw new Error('Confira a haste selecionada.')
    getAnodization(product.tags, color, product.anodizationFee)
    return { error: '', product }
  } catch (error) {
    return {
      error: error instanceof Error
        ? error.message
        : 'Não foi possível conferir a peça. Tente novamente.',
    }
  }
}
