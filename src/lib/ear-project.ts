export const REGIONS = [
  { id: 'helix', name: 'Hélix', x: 82, y: 29 },
  { id: 'flat', name: 'Flat', x: 54, y: 27 },
  { id: 'conch', name: 'Conch', x: 60, y: 54 },
  { id: 'daith', name: 'Daith', x: 40, y: 43 },
  { id: 'tragus', name: 'Tragus', x: 29, y: 59 },
  { id: 'lobulo', name: 'Lóbulo', x: 52, y: 82 },
  { id: 'transversal', name: 'Transversal', x: 53, y: 16 },
] as const

export const COLORS = {
  livre: 'Sem preferência',
  dourado: 'Dourado',
  prateado: 'Prateado',
} as const

export const TYPES = {
  livre: 'Todos os tipos',
  argola: 'Argola',
  topo: 'Labret',
  pingente: 'Pingente',
  'ponto-de-luz': 'Ponto de luz',
} as const

export const DETAILS = {
  livre: 'Sem preferência',
  cristais: 'Cristais e brilho',
  'pedras-naturais': 'Pedras naturais',
  swarovski: 'Swarovski',
} as const

export type RegionId = typeof REGIONS[number]['id']
export type Color = keyof typeof COLORS
export type JewelType = keyof typeof TYPES
export type Detail = keyof typeof DETAILS

export interface ProjectProduct {
  id: string
  slug: string
  name: string
  image: string
  price: number
  variable: boolean
}

export interface Choice {
  color: Color
  type: JewelType
  detail: Detail
  intention: 'tenho' | 'quero'
  product: ProjectProduct | null
}

export type Choices = Partial<Record<RegionId, Choice>>

export function newChoice(): Choice {
  return {
    color: 'livre',
    type: 'livre',
    detail: 'livre',
    intention: 'quero',
    product: null,
  }
}

export function suggestionUrl(region: RegionId, choice: Choice, page = 1): string {
  const query = new URLSearchParams({
    region,
    color: choice.color,
    type: choice.type,
    detail: choice.detail,
  })
  if (page > 1) query.set('page', String(page))
  return `/api/projeto-auricular?${query}`
}

export function projectMessage(
  choices: Choices,
  side: string,
  notes: string,
  origin: string
): string {
  const lines = [
    'Olá! Montei minhas preferências para um projeto auricular na Lunarity.',
    `Orelha: ${side}.`,
    '',
  ]

  REGIONS.forEach((region) => {
    const choice = choices[region.id]
    if (!choice) return
    lines.push(
      `${region.name} — ${choice.intention === 'tenho' ? 'Já tenho o furo' : 'Tenho interesse em perfurar'}`,
      `Cor: ${COLORS[choice.color]}. Tipo: ${TYPES[choice.type]}. Estilo: ${DETAILS[choice.detail]}.`
    )
    if (choice.product) {
      lines.push(
        `Joia de interesse: ${choice.product.name}`,
        `${origin}/produto/${encodeURIComponent(choice.product.slug)}`
      )
    } else {
      lines.push('Gostaria de ajuda para escolher a joia.')
    }
    lines.push('')
  })

  if (notes.trim()) lines.push(`Observações: ${notes.trim()}`, '')
  lines.push('Quero confirmar com a equipe a anatomia, as medidas, os encaixes e a disponibilidade das peças.')
  return lines.join('\n')
}
