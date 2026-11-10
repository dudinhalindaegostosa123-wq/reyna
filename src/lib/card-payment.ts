import { normalizeCheckoutDocument } from '@/lib/checkout-document'

export interface CardPaymentInput {
  token: string
  paymentMethodId: string
  issuerId?: string
  installments: number
  deviceSessionId?: string
  payer?: {
    email?: string
    identification?: { type: 'CPF' | 'CNPJ'; number: string }
  }
}

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => !keys.includes(key))) throw new Error('MP_CARD_INPUT_INVALID')
  return value as Record<string, unknown>
}

// Esta interface aceita somente o token do SDK. PAN, CVV e validade não são campos aceitos.
export function validateCardPaymentInput(value: unknown): CardPaymentInput {
  const input = record(value, ['token', 'paymentMethodId', 'issuerId', 'installments', 'deviceSessionId', 'payer'])
  if (typeof input.token !== 'string' || !/^[a-f0-9]{32}$/i.test(input.token) ||
    typeof input.paymentMethodId !== 'string' || !/^[a-z0-9_]{1,40}$/.test(input.paymentMethodId) ||
    typeof input.installments !== 'number' || !Number.isInteger(input.installments) ||
    input.installments < 1 || input.installments > 12 ||
    (input.issuerId !== undefined && (typeof input.issuerId !== 'string' || !/^\d{1,20}$/.test(input.issuerId))) ||
    (input.deviceSessionId !== undefined && (typeof input.deviceSessionId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(input.deviceSessionId)))) {
    throw new Error('MP_CARD_INPUT_INVALID')
  }
  const result: CardPaymentInput = {
    token: input.token, paymentMethodId: input.paymentMethodId,
    installments: input.installments,
    ...(input.issuerId ? { issuerId: input.issuerId as string } : {}),
    ...(input.deviceSessionId ? { deviceSessionId: input.deviceSessionId as string } : {}),
  }
  if (input.payer !== undefined) {
    const payer = record(input.payer, ['email', 'identification'])
    result.payer = {}
    if (payer.email !== undefined) {
      if (typeof payer.email !== 'string' || payer.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payer.email.trim())) throw new Error('MP_CARD_INPUT_INVALID')
      result.payer.email = payer.email.trim().toLowerCase()
    }
    if (payer.identification !== undefined) {
      const identification = record(payer.identification, ['type', 'number'])
      let number: string
      try { number = normalizeCheckoutDocument(identification.number) } catch { throw new Error('MP_CARD_INPUT_INVALID') }
      if (!/^\d{11}$|^\d{14}$/.test(number) ||
        identification.type !== (number.length === 11 ? 'CPF' : 'CNPJ')) throw new Error('MP_CARD_INPUT_INVALID')
      result.payer.identification = { type: identification.type as 'CPF' | 'CNPJ', number }
    }
  }
  return result
}
