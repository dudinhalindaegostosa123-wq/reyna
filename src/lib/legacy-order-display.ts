function text(value: unknown): string {
  if (typeof value !== 'string') return ''
  const clean = value.trim()
  return /^(null|undefined|\\N)$/i.test(clean) ? '' : clean
}

export function legacyPurchaseDate(value: unknown): string {
  const stamp = text(value)
  if (!stamp) return 'Data não informada no site antigo'
  const date = new Date(stamp)
  if (!Number.isFinite(date.getTime())) return 'Data não informada no site antigo'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
  }).format(date)
}

export function legacyOrderAddresses(payload: unknown) {
  const row = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown> : {}
  return [
    { title: 'Endereço de entrega', prefix: 'entrega_' },
    { title: 'Endereço de cobrança', prefix: '' },
  ].map(({ title, prefix }) => {
    const get = (key: string) => text(row[prefix + key])
    const hasAddress = ['endereco', 'complemento', 'cidade', 'estado', 'cep'].some(key => get(key))
    const lines = hasAddress ? [
      [get('primeiro_nome'), get('sobrenome')].filter(Boolean).join(' '),
      get('endereco'), get('complemento'),
      [get('cidade'), get('estado')].filter(Boolean).join(' — '),
      get('cep') ? `CEP: ${get('cep')}` : '', get('pais'),
    ].filter(Boolean) : []
    return { title, lines }
  })
}
