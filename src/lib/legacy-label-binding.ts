type Row = Record<string, unknown>
const row = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {}
const digits = (v: unknown) => String(v || '').replace(/\D/g, '')
const normalized = (v: unknown) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
export function legacyRemoteRecipient(input: unknown) {
  const root = row(input), value = root.data && typeof root.data === 'object' ? row(root.data) : root
  const to = row(value.to)
  return { value, name: String(to.name || ''), email: String(to.email || ''), postalCode: digits(to.postal_code), document: digits(to.document || to.company_document) }
}
export function verifyLegacyBinding(input: unknown, id: string, binding: unknown) {
  const expected = row(binding), remote = legacyRemoteRecipient(input)
  const savedDocument = digits(expected.document)
  const nameOrEmailMatches = (Boolean(expected.name) && normalized(expected.name) === normalized(remote.name)) ||
    (Boolean(expected.email) && normalized(expected.email) === normalized(remote.email))
  // Vínculos antigos tinham só CPF e CEP. O mesmo UUID + CEP continua válido
  // se o provedor omitir o documento; um documento divergente continua bloqueado.
  const recipientMatches = savedDocument && remote.document
    ? savedDocument === remote.document
    : expected.name || expected.email ? nameOrEmailMatches : Boolean(savedDocument)
  if (String(remote.value.id).toLowerCase() !== id.toLowerCase() || !remote.postalCode || remote.postalCode !== expected.postalCode || !recipientMatches) throw new Error('LEGACY_LABEL_RECIPIENT')
  return remote.value
}
export function matchLegacyRecipient(input: unknown, payload: Record<string, unknown>) {
  const remote = legacyRemoteRecipient(input)
  const shipping = payload.entrega_endereco && payload.entrega_endereco !== 'NULL'
  const prefix = shipping ? 'entrega_' : ''
  const zip = digits(payload[prefix + 'cep'])
  const name = normalized([payload[prefix + 'primeiro_nome'], payload[prefix + 'sobrenome']].filter(v => v && v !== 'NULL').join(' '))
  const email = normalized(payload.email)
  if (!zip || zip !== remote.postalCode || !(
    (name && name === normalized(remote.name)) || (email && email === normalized(remote.email))
  )) throw new Error('LEGACY_LABEL_RECIPIENT')
  return remote
}
