export const STONE_COLORS = [
  { id: 'verde', name: 'Verde e esmeralda', color: '#17654D', words: /\b(verd\w*|esmerald\w*|emerald|green|jade|seraphin\w*|peridot)\b/ },
  { id: 'azul', name: 'Azul e safira', color: '#294B94', words: /\b(azul|blue|safira|sapphire)\b/ },
  { id: 'turquesa', name: 'Turquesa e paraíba', color: '#50B9B4', words: /\b(turquesa|paraiba|aqua|acqua|sky blue|azul claro|oceano|oceanica|opalite green)\b/ },
  { id: 'rosa', name: 'Rosa e pink', color: '#D78BA5', words: /\b(rosa\w*|pink|rose)\b/ },
  { id: 'roxo', name: 'Roxo e ametista', color: '#825598', words: /\b(rox\w*|ametista|lilas|lavand\w*|lavend\w*|lilac|violeta|tanzanit\w*|purple)\b/ },
  { id: 'vermelho', name: 'Vermelho e rubi', color: '#A82F43', words: /\b(vermelh\w*|rubi|ruby|garnet|carmesim|red)\b/ },
  { id: 'laranja', name: 'Laranja', color: '#DA8A42', words: /\b(laranja|orange|sunset)\b/ },
  { id: 'amarelo', name: 'Amarelo', color: '#D5B64F', words: /\b(amarel\w*|yellow|citrin\w*|citrico)\b/ },
  { id: 'champanhe', name: 'Champanhe', color: '#BC9A75', words: /\b(champanhe|champagne)\b/ },
  { id: 'preto', name: 'Preto e ônix', color: '#383639', words: /\b(pret\w*|black|onix|onyx)\b/ },
  { id: 'cristal', name: 'Cristal e branco', color: '#DDE1DF', words: /\b(cristal\w*|crystal|branc\w*|white|transluc\w*|incolor)\b/ },
  { id: 'boreal', name: 'Boreal e multicolor', color: '#A18CAF', words: /\b(boreal|vitrail|rainbow|furta|colorid\w*|multicolor\w*)\b/ },
  { id: 'marrom', name: 'Marrom e café', color: '#85664F', words: /\b(marrom|cafe|coffee|brown)\b/ },
] as const

export type StoneColorId = typeof STONE_COLORS[number]['id']

export function normalizeStoneText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function stoneColorIds(value: string): StoneColorId[] {
  const text = normalizeStoneText(value)
  const matched = STONE_COLORS.filter(color => color.words.test(text)).map(color => color.id)
  const chromatic = matched.filter(id => id !== 'cristal')
  // "Zircônia cristal azul" é azul; combinações explícitas preservam o cristal.
  const crystalCombination = /\b(?:cristal\w*|branc\w*|white)\s*(?:e\b|&|\/)|(?:e\b|&|\/)\s*(?:cristal\w*|branc\w*|white)\b/.test(text)
  return matched.filter(id => !(id === 'azul' && matched.includes('turquesa')) &&
    !(id === 'cristal' && chromatic.length && !crystalCombination))
}

export function stoneAttributeColors(attributes: unknown, productName = ''): StoneColorId[] {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return []
  const found = new Set<StoneColorId>()
  Object.entries(attributes).forEach(([key, value]) => {
    const name = normalizeStoneText(key)
    const isColor = /\bcor(?:es)?\b/.test(name)
    const isStone = /\bpedras?\b/.test(name) && !/tamanho|medida/.test(name)
    const explicitStone = /pedra|zirc|cristal|opala|gota|navete/.test(name)
    const stoneProduct = /pedra|gema|cravejad|zirc|cristal|opala|swarovski|rubi|esmeralda|ametista|onix|garnet|turquesa|paraiba|jade|seraphin|peridot|tanzanit|ponto.de.luz/.test(normalizeStoneText(productName))
    if (!explicitStone && !stoneProduct) return
    if ((!isColor && !isStone) || /plaquinha|placa|porta|pinca|metal|acabamento|haste/.test(name) || typeof value !== 'string') return
    stoneColorIds(value).forEach(id => found.add(id))
  })
  return Array.from(found)
}

export function namedStoneColors(name: string): StoneColorId[] {
  const text = normalizeStoneText(name).split(/\s[-–—]\s(?:titanio|ouro|aco|prata)/)[0].replace(/\b(?:rose\s+gold|ouro\s+rose|(?:titanio|aco)\s+(?:pvd\s+)?(?:black|preto|natural)|pvd\s+black)\b/g,'')
  if (!/pedra|gema|cravejad|zirc|cristal|crystal|opala|swarovski|rubi|esmeralda|ametista|onix|garnet|turquesa|paraiba|jade|seraphin|peridot|tanzanit/.test(text)) return []
  return stoneColorIds(text)
}

// A bare color query also finds manually curated products and colors present only in variations.
export function resolveStoneSearch(query:string,selected=''):{color:StoneColorId|'';search:string} {
 const explicit=STONE_COLORS.find(color=>color.id===selected)
 const normalized=normalizeStoneText(query).trim()
 const matches=stoneColorIds(normalized)
 if(matches.length===1){
  const color=STONE_COLORS.find(color=>color.id===matches[0])!
  const remaining=normalized.replace(new RegExp(color.words.source,'g'),'').replace(/\b(?:joias?|piercings?|pedras?|cor|cores|de|da|do|e|em)\b/g,'').replace(/[^a-z0-9]+/g,'').trim()
  if(!remaining)return {color:explicit?.id || color.id,search:explicit && explicit.id!==color.id ? query : ''}
 }
 return {color:explicit?.id || '',search:query}
}
