import {
  localInput,
  localToIso,
} from '@/lib/promotion-ui'

export type CouponStatus =
  | 'draft'
  | 'active'
  | 'disabled'

export type CouponDiscountType =
  | 'percent'
  | 'fixed'

export type CouponScope =
  | 'all'
  | 'products'

export interface CouponProduct {
  id: string
  name: string
  sku: string
}

export interface Coupon {
  id: string
  version: number
  name: string
  code: string
  status: CouponStatus
  discountType: CouponDiscountType
  discountValue: number
  scope: CouponScope
  minimumSubtotal: number
  startsAt: string | null
  endsAt: string | null
  maxUses: number | null
  maxUsesPerCustomer: number | null
  codeLocked: boolean
  products: CouponProduct[]
}

export function normalizeCouponCode(
  value: unknown
): string {
  if (typeof value !== 'string') {
    throw new Error('Informe o código do cupom.')
  }

  const code = value.trim().toUpperCase()

  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) {
    throw new Error(
      'O código deve ter de 3 a 40 caracteres. Use letras, números, hífen ou sublinhado, sem espaços.'
    )
  }

  return code
}

export function parseCouponAmount(
  value: unknown,
  label: string,
  allowZero = false
): number {
  if (typeof value !== 'string') {
    throw new Error(`Confira o campo ${label}.`)
  }

  const text = value.trim()

  if (!/^\d{1,7}(?:[,.]\d{1,2})?$/.test(text)) {
    throw new Error(
      `${label}: use valores como 10 ou 10,50, sem ponto de milhar.`
    )
  }

  const cents = Math.round(
    Number(text.replace(',', '.')) * 100
  )

  if (
    !Number.isSafeInteger(cents) ||
    cents > 999999999 ||
    (allowZero ? cents < 0 : cents <= 0)
  ) {
    throw new Error(
      `${label}: informe um valor ${
        allowZero ? 'igual ou maior que zero' : 'maior que zero'
      }.`
    )
  }

  return cents / 100
}

export function parseCouponLimit(
  value: unknown,
  label: string
): number | null {
  if (typeof value !== 'string') {
    throw new Error(`Confira o campo ${label}.`)
  }

  const text = value.trim()

  if (!text) return null

  if (!/^[1-9]\d{0,8}$/.test(text)) {
    throw new Error(
      `${label}: informe um número inteiro positivo ou deixe vazio para não limitar.`
    )
  }

  const number = Number(text)

  if (
    !Number.isSafeInteger(number) ||
    number > 100000000
  ) {
    throw new Error(
      `${label}: o limite máximo é 100.000.000.`
    )
  }

  return number
}

export function couponAmountInput(
  value: number
): string {
  return value.toFixed(2).replace('.', ',')
}

export function couponDateParts(
  iso: string | null
): {
  date: string
  time: string
} {
  if (!iso || !Number.isFinite(Date.parse(iso))) {
    return {
      date: '',
      time: '',
    }
  }

  const value = localInput(iso)
  const [date, time] = value.split('T')

  return {
    date,
    time,
  }
}

export function couponDateToIso(
  date: string,
  time: string,
  label: string
): string | null {
  const cleanDate = date.trim()
  const cleanTime = time.trim()

  if (!cleanDate && !cleanTime) {
    return null
  }

  if (!cleanDate || !cleanTime) {
    throw new Error(
      `${label}: preencha a data e o horário, ou deixe ambos vazios.`
    )
  }

  return localToIso(`${cleanDate}T${cleanTime}`)
}

export function couponPhase(
  coupon: Pick<
    Coupon,
    'status' | 'startsAt' | 'endsAt'
  >,
  now = Date.now()
): string {
  if (coupon.status === 'draft') {
    return 'Rascunho'
  }

  if (coupon.status === 'disabled') {
    return 'Desativado'
  }

  if (
    coupon.endsAt &&
    Date.parse(coupon.endsAt) <= now
  ) {
    return 'Encerrado'
  }

  if (
    coupon.startsAt &&
    Date.parse(coupon.startsAt) > now
  ) {
    return 'Agendado'
  }

  return 'Ativo'
}
