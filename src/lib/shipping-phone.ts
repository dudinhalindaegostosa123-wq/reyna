/** Telefones brasileiros: remove o DDI apenas quando a quantidade de dígitos confirma +55. */
export function shippingPhone(value: unknown): string {
  if (typeof value !== 'string') return ''
  const digits = value.replace(/\D/g, '')
  return (digits.length === 12 || digits.length === 13) && digits.startsWith('55') ? digits.slice(2) : digits
}
