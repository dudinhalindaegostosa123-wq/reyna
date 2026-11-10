export const COLLECTION_TIERS = [
  { quantity: 2, percent: 5 },
  { quantity: 3, percent: 7 },
  { quantity: 4, percent: 10 },
  { quantity: 5, percent: 15 },
] as const
export const COLLECTION_MAX_QUANTITY = 5
export const COLLECTION_MAX_PERCENT = 15
export const COLLECTION_TIER_SUMMARY = '2 joias: 5% · 3 joias: 7% · 4 joias: 10% · 5 ou mais: 15%'

export function collectionProgressMessage(quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 0) return ''
  const next = COLLECTION_TIERS.find(tier => quantity < tier.quantity)
  if (!next) return `Parabéns! Você alcançou ${COLLECTION_MAX_PERCENT}%, o limite máximo do desconto progressivo. Suas joias elegíveis receberam ${COLLECTION_MAX_PERCENT}% de desconto.`
  const remaining = next.quantity - quantity
  return `Falta${remaining === 1 ? '' : 'm'} ${remaining} ${remaining === 1 ? 'joia' : 'joias'} para alcançar ${next.percent}% de desconto.`
}
