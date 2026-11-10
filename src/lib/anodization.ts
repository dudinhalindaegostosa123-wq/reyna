export const ANODIZATION_FEE = 15

export const ANODIZATION_COLORS = [
  { code: '12', label: 'Bronze Claro', voltage: 12, swatch: '#98723d' },
  { code: '15', label: 'Bronze Escuro', voltage: 15, swatch: '#804020' },
  { code: '18', label: 'Berinjela', voltage: 18, swatch: '#5d1b50' },
  { code: '20', label: 'Roxo Escuro', voltage: 20, swatch: '#231449' },
  { code: '22', label: 'Roxo', voltage: 22, swatch: '#5d137c' },
  { code: '25', label: 'Azul Escuro', voltage: 25, swatch: '#102c68' },
  { code: '28', label: 'Azul', voltage: 28, swatch: '#006485' },
  { code: '30', label: 'Azul Médio', voltage: 30, swatch: '#007b97' },
  { code: '33', label: 'Azul Céu', voltage: 33, swatch: '#378b9e' },
  { code: '36', label: 'Azul Claro', voltage: 36, swatch: '#77aab6' },
  { code: '40', label: 'Azul Gelo', voltage: 40, swatch: '#95b8bf' },
  { code: '42', label: 'Azul Prateado', voltage: 42, swatch: '#a2b6b7' },
  { code: '48', label: 'Amarelo Pálido', voltage: 48, swatch: '#c5c39b' },
  { code: '55', label: 'Amarelo Claro', voltage: 55, swatch: '#d5ca88' },
  { code: '61', label: 'Amarelo', voltage: 61, swatch: '#d7b918' },
  { code: '64', label: 'Dourado', voltage: 64, swatch: '#c9a719' },
  { code: '70', label: 'Rose Gold', voltage: 70, swatch: '#c47a59' },
  { code: '72', label: 'Rosa Claro', voltage: 72, swatch: '#cf689e' },
  { code: '75', label: 'Rosa', voltage: 75, swatch: '#b42c7d' },
  { code: '80', label: 'Fúcsia', voltage: 80, swatch: '#9c279f' },
  { code: '85', label: 'Fúcsia Escuro', voltage: 85, swatch: '#58317d' },
  { code: '90', label: 'Roxo Vibrante', voltage: 90, swatch: '#354684' },
  { code: '92', label: 'Roxo Azulado', voltage: 92, swatch: '#127d92' },
  { code: '95', label: 'Roxo Petróleo', voltage: 95, swatch: '#087b82' },
  { code: '103', label: 'Verde Azulado', voltage: 103, swatch: '#168c72' },
  { code: '105', label: 'Verde', voltage: 105, swatch: '#258343' },
]

export function canAnodize(tags: string[] = []): boolean {
  return tags.some((value) =>
    /^(anodizavel|anodizaveis|permite anodizacao|aceita anodizacao)$/.test(
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
    )
  )
}

export function getAnodization(tags: string[], code?: string, fee = ANODIZATION_FEE) {
  if (code === undefined || code === '') return null

  if (typeof code !== 'string' || !canAnodize(tags)) {
    throw new Error('Esta peça não está disponível para anodização.')
  }

  const color = ANODIZATION_COLORS.find((item) => item.code === code)

  if (!color) {
    throw new Error('Escolha uma cor de anodização válida.')
  }

  return {
    code: color.code,
    label: `${color.label} ${color.voltage} V`,
    fee: fee === 0 ? 0 : ANODIZATION_FEE,
  }
}

export function anodizedPrice(base: number, fee: number): number {
  return (Math.round(base * 100) + Math.round(fee * 100)) / 100
}
