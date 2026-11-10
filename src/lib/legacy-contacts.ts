import { parseLegacyCsv } from './legacy-import'
import { shippingPhone } from './shipping-phone'
type Fields = Record<string, string>
const clean = (value: unknown) => typeof value === 'string' && !/^(null|undefined|\\N)$/i.test(value.trim()) ? value.trim() : ''
const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export function parseLegacyContacts(csv: string) {
  const rows = parseLegacyCsv(csv)
  if (!rows.length || rows.length > 20000) throw new Error('Use o CSV completo de contatos e endereços, com até 20 mil linhas.')
  const groups = new Map<string, { order_id: string; billing?: Fields; shipping?: Fields }>()
  for (const row of rows) {
    if (!/^[1-9][0-9]{0,14}$/.test(row.pedido_antigo || '') || !['billing','shipping'].includes(row.tipo_endereco) || !('campos_adicionais' in row)) throw new Error('Use o CSV de contatos e endereços exportado do banco antigo.')
    const group = groups.get(row.pedido_antigo) || { order_id: row.pedido_antigo }
    const type = row.tipo_endereco as 'billing' | 'shipping'
    if (group[type]) throw new Error('Há um endereço repetido no arquivo. Exporte novamente todo o resultado.')
    let metadata: unknown
    try { metadata = JSON.parse(row.campos_adicionais) } catch { throw new Error('Os campos adicionais do CSV estão incompletos.') }
    if (!Array.isArray(metadata)) throw new Error('Formato de campos adicionais inválido.')
    const unique = (field: string) => {
      const values = Array.from(new Set((metadata as { campo: string; valor: unknown }[]).filter(m => m.campo === field).map(m => clean(m.valor)).filter(Boolean)))
      return values.length === 1 ? values[0] : ''
    }
    const phone = shippingPhone(clean(row.telefone))
    group[type] = { name: [clean(row.primeiro_nome),clean(row.sobrenome)].filter(Boolean).join(' '), email: clean(row.email_endereco), phone: /^\d{10,11}$/.test(phone) ? phone : '', cep: clean(row.cep), street: clean(row.endereco), complement: clean(row.complemento), city: clean(row.cidade), state: clean(row.estado), number: unique(`_${type}_number`), district: unique(`_${type}_neighborhood`) }
    if (!group[type]!.phone && type === 'billing') {
      const cell = shippingPhone(unique('_billing_cellphone'))
      if (/^\d{10,11}$/.test(cell)) group[type]!.phone = cell
    }
    groups.set(row.pedido_antigo, group)
  }
  for (const group of Array.from(groups.values())) if (!group.billing || !group.shipping) throw new Error('Faltam endereços de cobrança ou entrega. Exporte todas as linhas do resultado.')
  return Array.from(groups.values())
}
// Só completa campos ausentes do mesmo destinatário e do mesmo endereço.
// Nunca usa número/bairro da cobrança em outro endereço de entrega.
export function recoveredLegacyFields(current: Fields, saved: { billing?: Fields; shipping?: Fields } | null): Fields {
  if (!saved?.shipping) return current
  const shipping = saved.shipping, billing = saved.billing
  const samePerson = (other: Fields) => Boolean(key(current.name || '') && key(current.name || '') === key(other.name || ''))
  const sameAddress = (other: Fields) => ['cep','street','city','state'].every(field => !clean(current[field]) || key(current[field]) === key(other[field] || ''))
  const result = { ...current }
  if (!samePerson(shipping) || !sameAddress(shipping)) return result
  for (const field of ['phone','email','cep','street','number','district','city','state']) if (!clean(result[field]) && shipping[field]) result[field] = shipping[field]
  if (!result.phone && billing && samePerson(billing)) result.phone = billing.phone || ''
  return result
}
