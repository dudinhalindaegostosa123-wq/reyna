export interface AsaasCardInput {
  holderName: string
  number: string
  expiryMonth: string
  expiryYear: string
  ccv: string
  holderDocument: string
}

// Strictly ephemeral. Never include this value in fingerprints, logs, DB or analytics.
export function validateAsaasCardInput(value: unknown): AsaasCardInput {
  const fail = (): never => { throw new Error('ASAAS_CARD_INPUT_INVALID') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  const data = value as Record<string, unknown>
  const keys = ['holderName','number','expiryMonth','expiryYear','ccv','holderDocument']
  if (Object.keys(data).some(key => !keys.includes(key)) || keys.some(key => typeof data[key] !== 'string')) return fail()
  const number = (data.number as string).replace(/[ -]/g, '')
  const holderName = (data.holderName as string).trim()
  const holderDocument = (data.holderDocument as string).replace(/[.\-/ ]/g, '')
  const expiryMonth = data.expiryMonth as string, expiryYear = data.expiryYear as string, ccv = data.ccv as string
  if (holderName.length < 2 || holderName.length > 100 || /[\r\n]/.test(holderName) ||
    !/^\d{13,19}$/.test(number) || !/^\d{3,4}$/.test(ccv) ||
    !/^(0[1-9]|1[0-2])$/.test(expiryMonth) || !/^20\d{2}$/.test(expiryYear) ||
    !/^\d{11}(?:\d{3})?$/.test(holderDocument)) return fail()
  let sum = 0
  for (let index = 0; index < number.length; index++) {
    let digit = Number(number[number.length - 1 - index])
    if (index % 2) { digit *= 2; if (digit > 9) digit -= 9 }
    sum += digit
  }
  if (sum % 10 || Date.UTC(Number(expiryYear), Number(expiryMonth), 1) <= Date.now()) return fail()
  return { holderName, number, expiryMonth, expiryYear, ccv, holderDocument }
}
