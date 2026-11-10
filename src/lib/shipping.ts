export const SHIPPING_PREPARATION_DAYS = 4

export function deliveryEstimateDays(carrierDays: number | null): number | null {
  if (carrierDays === null || !Number.isSafeInteger(carrierDays) || carrierDays < 0) return null
  const total = carrierDays + SHIPPING_PREPARATION_DAYS
  return Number.isSafeInteger(total) ? total : null
}

export interface ShippingSettings {
  origin: string
  weight_g: number
  height: number
  width: number
  length: number
  max_units: number | null
  enabled: boolean
  contact_email: string | null
  manual_slugs: string[]
  version: number
}

export interface DeliveryOption {
  id: string
  company: string
  service: string
  amount_cents: number
  days: number | null
  manual: boolean
}

export interface DeliveryReceipt {
  number: number
  total: number
  shipping: number
  shippingPending: boolean
  reservedUntil: string | null
}

export function shippingFields(data: FormData, contact: string) {
  function numeric(key: string, min: number, max: number, integer = false): number {
    const raw = String(data.get(key) || '').trim()
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) {
      throw new Error('Confira o campo ' + key + '.')
    }

    const n = Number(raw.replace(',', '.'))
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
      throw new Error('Confira o campo ' + key + '.')
    }
    return n
  }

  const origin = String(data.get('origin') || '').trim().replace('-', '')
  if (!/^\d{8}$/.test(origin)) throw new Error('Confira o CEP de origem.')

  const max_units = String(data.get('max_units') || '').trim()
    ? numeric('max_units', 1, 49950, true)
    : null
  const enabled = data.get('enabled') === 'on'

  if (enabled && max_units === null) {
    throw new Error('Confirme o limite de peças da embalagem antes de ativar o frete automático.')
  }

  const manual_slugs = Array.from(new Set(
    String(data.get('manual_slugs') || '').split(/[\s,]+/).filter(Boolean)
  ))

  if (
    manual_slugs.length > 200 ||
    manual_slugs.some(s => !/^[a-zA-Z0-9_-]{1,180}$/.test(s))
  ) {
    throw new Error('Confira os slugs que exigem frete manual.')
  }

  return {
    origin,
    weight_g: numeric('weight_g', 1, 1000000, true),
    height: numeric('height', 0.1, 1000),
    width: numeric('width', 0.1, 1000),
    length: numeric('length', 0.1, 1000),
    max_units,
    enabled,
    contact_email: contact,
    manual_slugs,
  }
}
