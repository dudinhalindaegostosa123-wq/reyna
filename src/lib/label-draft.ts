import { shippingPhone } from './shipping-phone'
import { CHECKOUT_STATES } from '@/lib/checkout'
import { normalizeCheckoutDocument } from '@/lib/checkout-document'

export type LabelFields = Record<string, string>

export const PARTY_FIELDS = [
  ['name', 'Nome / razão social', 180],
  ['email', 'E-mail', 254],
  ['phone', 'Telefone com DDD', 25],
  ['document', 'CPF ou CNPJ', 30],
  ['state_register', 'Inscrição estadual / ISENTO', 30],
  ['cep', 'CEP', 10],
  ['street', 'Rua ou avenida', 180],
  ['number', 'Número', 30],
  ['complement', 'Complemento', 180],
  ['district', 'Bairro', 100],
  ['city', 'Cidade', 100],
  ['state', 'Estado (UF)', 2],
] as const

export type PartyFieldName = typeof PARTY_FIELDS[number][0]

const REQUIRED_PARTY_FIELDS: readonly PartyFieldName[] = [
  'name',
  'email',
  'phone',
  'document',
  'cep',
  'street',
  'number',
  'district',
  'city',
  'state',
]

export interface SenderData {
  fields: LabelFields
  version: number
}

export interface LabelData {
  id: string
  version: number
  orderVersion: string
  senderVersion: number
  documentNotice?: string
  fields: LabelFields
  issues: string[]
  company: string
  service: string
  status: string
  products: { name: string; quantity: number; value: number }[]
}

export function readLabelFields(
  data: FormData,
  kind: 'sender' | 'draft'
): LabelFields {
  const allowed: readonly (readonly [string, string, number])[] =
    kind === 'sender'
      ? PARTY_FIELDS
      : [
          ...PARTY_FIELDS,
          ['height', 'Altura', 20],
          ['width', 'Largura', 20],
          ['length', 'Comprimento', 20],
          ['weight_g', 'Peso', 20],
          ['document_mode', 'Documentação', 30],
          ['invoice_key', 'Chave da NF-e', 44],
          ['notes', 'Observações', 2000],
        ]

  const result: LabelFields = {}

  for (const [key, label, max] of allowed) {
    const value = data.get(key)

    if (value !== null && typeof value !== 'string') {
      throw new Error('Confira o campo ' + label + '.')
    }

    const text = String(value || '').trim()

    if (
      text.length > max ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)
    ) {
      throw new Error('Confira o campo ' + label + '.')
    }

    result[key] = key === 'phone' ? shippingPhone(text) : text
  }

  if (
    kind === 'draft' &&
    !['pending', 'invoice'].includes(result.document_mode)
  ) {
    throw new Error('Confira a documentação do envio.')
  }

  return result
}

export function partyFieldError(
  name: PartyFieldName,
  value: string,
  documentOptional = false
): string {
  const text = value.trim()
  const definition = PARTY_FIELDS.find(([key]) => key === name)

  if (!definition) return ''

  const [, label, max] = definition

  if (!text) {
    if (name === 'document' && documentOptional) return ''
    return REQUIRED_PARTY_FIELDS.includes(name)
      ? `Preencha o campo ${label}.`
      : ''
  }

  if (
    text.length > max ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)
  ) {
    return `Confira o campo ${label}.`
  }

  switch (name) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
        ? ''
        : 'Confira o e-mail.'

    case 'phone':
      return /^\d{10,11}$/.test(shippingPhone(text))
        ? ''
        : 'Confira o telefone com DDD.'

    case 'cep':
      return /^\d{8}$/.test(text.replace(/\D/g, ''))
        ? ''
        : 'Confira o CEP: informe oito números.'

    case 'state':
      return CHECKOUT_STATES.includes(text.toUpperCase())
        ? ''
        : 'Informe uma UF válida, por exemplo SP.'

    case 'document':
      try {
        normalizeCheckoutDocument(text)
        return ''
      } catch (error) {
        return error instanceof Error
          ? error.message
          : 'Informe um CPF ou CNPJ válido.'
      }

    default:
      return ''
  }
}

export function partyIssues(
  fields: LabelFields,
  who: string,
  documentOptional = false
): string[] {
  const result: string[] = []

  for (const [name] of PARTY_FIELDS) {
    const error = partyFieldError(name, fields[name] || '', documentOptional)

    if (error) {
      result.push(`${who}: ${error}`)
    }
  }

  return result
}
