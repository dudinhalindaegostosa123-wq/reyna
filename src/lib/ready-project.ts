import { resolveProductSelection } from './data'
import type { Product } from './data'
import type { CartItem } from './cart'

export interface ProjectLine { slug: string; variationId: string; quantity: number }
export interface ReadyProject {
  id: string; title: string; description: string; image_path: string
  enabled: boolean; position: number; version: number; items: ProjectLine[]
}
export interface ProjectPiece { product: Product; variationId: string; quantity: number }
export function projectSelection(piece: ProjectPiece) {
  if (!piece.product.variations && piece.variationId) return null
  return resolveProductSelection(piece.product, piece.variationId ? { 'Variação': piece.variationId } : {})
}

export function projectTotal(pieces: ProjectPiece[]): number | null {
  if (!pieces.length) return null
  let cents = 0
  for (const piece of pieces) {
    const selection = projectSelection(piece)
    if (!Number.isSafeInteger(piece.quantity) || piece.quantity < 1 || !selection || !selection.priceAvailable || !Number.isFinite(selection.price) || selection.price < 0) return null
    cents += Math.round(selection.price * 100) * piece.quantity
  }
  return cents / 100
}

// Prepare the entire addition before committing any change to the cart.
export function projectCart(existing: CartItem[], pieces: ProjectPiece[]): CartItem[] | null {
  if (!pieces.length) return null
  const result = existing.map(item => ({ ...item }))
  for (const piece of pieces) {
    const { product, quantity } = piece
    const selection = projectSelection(piece)
    if (!selection || !selection.inStock || !selection.priceAvailable ||
      !Number.isFinite(selection.price) || selection.price < 0 ||
      !Number.isSafeInteger(quantity) || quantity < 1) return null
    const variationId = product.variations ? selection.id : undefined
    const variantKey = JSON.stringify([product.id, variationId || '',...(selection.stemLength?['stem',selection.stemLength]:[])])
    const owned = result.filter(item => item.productId === product.id &&
      (item.variationId || '') === (variationId || '')).reduce((sum, item) => sum + item.quantity, 0)
    if (selection.stock !== null && owned + quantity > selection.stock) return null
    const index = result.findIndex(item => item.variantKey === variantKey)
    const item: CartItem = {
      ...(product.includesStem?{requiresStem:true}:{}),
      ...(selection.stemLength?{stem:selection.stemLength,stemLocked:true}:{}),
      id: variantKey, productId: product.id, variationId, slug: product.slug,
      name: product.name, originalName: product.originalName, price: selection.price+(selection.stemLength ? product.stemFee || 0 : 0),stemFee:selection.stemLength ? product.stemFee || 0 : 0, basePrice: selection.price,
      image: selection.image || product.images[0] || '',
      quantity: quantity + (index >= 0 ? result[index].quantity : 0),
      stock: selection.stock, variants: {...(variationId ? {'Variação':selection.name}:{}),...(selection.stemLength?{'Haste incluída':`${selection.stemLength} mm`}:{})}, variantKey,
    }
    if (index >= 0) result[index] = item
    else result.push(item)
  }
  return result
}
