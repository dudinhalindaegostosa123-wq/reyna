/** Exibe somente opções preservadas no pedido, sem consultar o catálogo atual. */
export function orderItemOptions(input: unknown): string[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return []
  const item = input as Record<string, unknown>
  const result: string[] = []
  if (typeof item.variation === 'string' && item.variation.trim()) result.push(item.variation.trim())
  const attributes = item.opcoes_compra || item.variant_attributes || item.attributes
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    for (const [key, value] of Object.entries(attributes)) {
      if (typeof value === 'string' && value.trim()) {
        const label = `${key.replace(/^_?attribute[_-]/i, '').replace(/^pa[_-]/i, '').replace(/^_+/, '').replace(/[_-]+/g, ' ')}: ${value.trim()}`
        if (!result.includes(label)) result.push(label)
      }
    }
  }
  const stem = String(item.stem_length_mm || '').trim()
  if (/^[1-9][0-9]{0,2}(?:[.,][0-9]{1,2})?$/.test(stem) && !result.some(line => /haste/i.test(line) && line.includes(stem + ' mm'))) result.push(`Haste${typeof item.stem_fee==='number' && item.stem_fee>0 ? ` (+ ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(item.stem_fee)} por peça)` : ' incluída'}: ${stem} mm`)
  if (typeof item.sterilized === 'boolean' && !result.some(line => /esteriliza/i.test(line))) result.push(`Esterilização solicitada: ${item.sterilized ? typeof item.sterilization_fee === 'number' && item.sterilization_fee > 0 ? `Sim (+ ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(item.sterilization_fee)} por peça)` : 'Sim (solicitada)' : 'Não'}`)
  return result
}
