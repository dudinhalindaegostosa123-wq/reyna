export const PACKAGE_FIELDS = [
  ['height', 'Altura (cm)', 1000],
  ['width', 'Largura (cm)', 1000],
  ['length', 'Comprimento (cm)', 1000],
  ['weight_g', 'Peso total embalado (g)', 1000000],
] as const

export type PackageFieldName =
  typeof PACKAGE_FIELDS[number][0]

export function packageFieldError(
  name: PackageFieldName,
  value: string
): string {
  const definition = PACKAGE_FIELDS.find(
    ([key]) => key === name
  )

  if (!definition) return ''

  const [, label, max] = definition
  const text = value.trim()

  if (!text) {
    return `Preencha ${label.toLowerCase()}.`
  }

  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) {
    return 'Informe um número com até duas casas decimais.'
  }

  const number = Number(text.replace(',', '.'))

  if (!Number.isFinite(number) || number <= 0) {
    return 'Informe um valor maior que zero.'
  }

  if (number > max) {
    return `O limite deste campo é ${max.toLocaleString('pt-BR')}.`
  }

  return ''
}

export function invoiceKeyError(
  mode: string,
  value: string
): string {
  if (mode !== 'invoice') return ''

  return /^\d{44}$/.test(value)
    ? ''
    : 'Informe a chave de acesso da NF-e com 44 números.'
}
