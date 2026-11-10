// Informações comerciais e contatos confirmados para a vitrine.
// Não substitui a conferência de valores e elegibilidade feita no checkout.
export const STORE_INFORMATION = {
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_URL?.trim() || '',
  googleMaps: process.env.NEXT_PUBLIC_GOOGLE_MAPS_URL?.trim() || '',
  instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL?.trim() || '',
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || '',
  retailShipping: 'Frete grátis a partir de R$ 450',
  retailShippingConditions: 'Frete grátis a partir de R$ 450 em joias, após o desconto progressivo e o cupom, antes do desconto no Pix. A opção elegível aparece no checkout.',
  installments: '5% OFF no Pix ou 3x sem juros',
  couponCombination: 'O cupom pode acumular com o desconto progressivo e os 5% OFF no Pix. Frete e serviços adicionais, como esterilização, não recebem esses descontos.',
} as const
