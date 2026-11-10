import { parseLegacyCsv } from './legacy-import'
import { normalizeCheckoutDocument } from './checkout-document'
const SOURCES = ['_billing_cpf', '_billing_cnpj', '_billing_document']
export function parseLegacyDocuments(csv: string) {
  const rows = parseLegacyCsv(csv)
  if (!rows.length || rows.length > 30000) throw new Error('O arquivo está vazio ou excede o limite de registros.')
  const groups = new Map<string, { order_id: string; documents: string[]; invalid: boolean; fields: string[] }>()
  for (const row of rows) {
    if (!/^[1-9][0-9]{0,14}$/.test(row.pedido_antigo || '') || !SOURCES.includes(row.campo) || typeof row.valor !== 'string') throw new Error('Use o CSV com pedido_antigo, campo e valor exportado do banco antigo.')
    const group = groups.get(row.pedido_antigo) || { order_id: row.pedido_antigo, documents: [], invalid: false, fields: [] }
    if (!group.fields.includes(row.campo)) group.fields.push(row.campo)
    try {
      const document = normalizeCheckoutDocument(row.valor.trim())
      if (!group.documents.includes(document)) group.documents.push(document)
    } catch { group.invalid = true }
    groups.set(row.pedido_antigo, group)
  }
  if (groups.size > 10000) throw new Error('Exporte até 10 mil pedidos por arquivo.')
  return Array.from(groups.values())
}
