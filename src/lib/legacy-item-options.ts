import { parseLegacyCsv } from './legacy-import'
export function parseLegacyItemOptions(csv: string) {
  const rows = parseLegacyCsv(csv)
  if (!rows.length || rows.length > 30000) throw new Error('O arquivo está vazio ou excede 30 mil opções.')
  const groups = new Map<string, { item_id: string; order_id: string; options: Record<string, string> }>()
  for (const row of rows) {
    if (!/^[1-9][0-9]{0,14}$/.test(row.item_antigo || '') || !/^[1-9][0-9]{0,14}$/.test(row.pedido_antigo || '')) throw new Error('O CSV precisa das colunas pedido_antigo, item_antigo, atributo e valor.')
    const key = (row.atributo || '').trim(), value = (row.valor || '').trim()
    if (!key || key.length > 200 || value.length > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(key + value)) throw new Error('Há uma opção inválida no arquivo.')
    if (key.startsWith('_') && !/attribute|comprimento|tamanho|espessura|di[aâ]metro|length|haste|medida/i.test(key)) throw new Error('O arquivo contém um campo interno que não é uma opção de compra.')
    if (!value || value === 'NULL') continue
    const group = groups.get(row.item_antigo) || { item_id: row.item_antigo, order_id: row.pedido_antigo, options: Object.create(null) as Record<string, string> }
    if (group.order_id !== row.pedido_antigo || (Object.hasOwn(group.options, key) && group.options[key] !== value)) throw new Error('O arquivo possui opções conflitantes para o mesmo item.')
    group.options[key] = value
    groups.set(row.item_antigo, group)
  }
  if (!groups.size) throw new Error('Nenhuma opção de compra preenchida foi encontrada no arquivo.')
  return Array.from(groups.values())
}
