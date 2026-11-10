export interface ShippingQuote {
  id: string
  company: string
  service: string
  price: number
  days: number | null
}

export type ShippingTestResult =
  | { ok: true; message: string; quotes?: ShippingQuote[] }
  | { ok: false; message: string }

export function testPackage(data: FormData) {
  function cep(name: string) {
    const raw = String(data.get(name) || '').trim()

    if (!/^\d{5}-?\d{3}$/.test(raw)) {
      throw new Error('INPUT_CEP')
    }

    return raw.replace('-', '')
  }

  function number(
    name: string,
    min: number,
    max: number,
    decimals: number
  ) {
    const raw = String(data.get(name) || '').trim()

    if (
      !/^\d+(?:[.,]\d+)?$/.test(raw) ||
      (raw.split(/[.,]/)[1]?.length || 0) > decimals
    ) {
      throw new Error('INPUT_NUMBER')
    }

    const result = Number(raw.replace(',', '.'))

    if (
      !Number.isFinite(result) ||
      result < min ||
      result > max
    ) {
      throw new Error('INPUT_NUMBER')
    }

    return result
  }

  return {
    from: { postal_code: cep('origin') },
    to: { postal_code: cep('destination') },
    volumes: [{
      weight: number('weight', 1, 1000000, 0) / 1000,
      width: number('width', 0.1, 1000, 2),
      height: number('height', 0.1, 1000, 2),
      length: number('length', 0.1, 1000, 2),
      insurance: number('value', 0, 1000000, 2),
    }],
    options: { receipt: false, own_hand: false },
  }
}
