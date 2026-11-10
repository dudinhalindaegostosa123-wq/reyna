export interface CampaignTarget {
  productId: string
  variantId: string | null
  productName: string
  productSku?: string
  variantSku?: string
  variantName: string
  regularPrice: number | null
}

export interface CampaignItem extends CampaignTarget {
  discountType: 'percent' | 'fixed'
  discountValue: string
  appliedSalePrice: number | null
}

export interface Campaign {
  id: string
  name: string
  status: 'draft' | 'published' | 'cancelled'
  startsAt: string
  endsAt: string
  version: number
  items: CampaignItem[]
}

export interface CampaignProduct {
  id: string
  name: string
  sku: string
  productType: string
}

export const targetKey = (item: CampaignTarget) =>
  `${item.productId}:${item.variantId || 'simple'}`

export const formatMoney = (value: number | null) =>
  value === null
    ? 'Sem preço'
    : new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value)

export function localInput(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))

  const get = (kind: string) =>
    parts.find(part => part.type === kind)?.value || ''

  return (
    `${get('year')}-${get('month')}-${get('day')}` +
    `T${get('hour')}:${get('minute')}`
  )
}

export function localToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error('Confira as datas e horários.')
  }

  const date = new Date(value + ':00-03:00')

  if (
    !Number.isFinite(date.getTime()) ||
    localInput(date.toISOString()) !== value
  ) {
    throw new Error('Confira as datas e horários.')
  }

  return date.toISOString()
}

export function preview(item: CampaignItem): number | null {
  if (
    item.regularPrice === null ||
    !Number.isFinite(item.regularPrice) ||
    item.regularPrice <= 0
  ) {
    return null
  }

  if (!/^\d+(?:[.,]\d{1,2})?$/.test(item.discountValue.trim())) {
    return null
  }

  const rate = Math.round(
    Number(item.discountValue.trim().replace(',', '.')) * 100
  )

  const base = Math.round(item.regularPrice * 100)

  if (
    !Number.isSafeInteger(rate) ||
    rate <= 0 ||
    !Number.isSafeInteger(base * 10000)
  ) {
    return null
  }

  if (item.discountType === 'percent' && rate > 10000) {
    return null
  }

  const cents = item.discountType === 'percent'
    ? Math.round(base * (10000 - rate) / 10000)
    : base - rate

  return cents >= 0 && cents < base
    ? cents / 100
    : null
}

export function campaignPhase(
  campaign: Pick<Campaign, 'status' | 'startsAt' | 'endsAt'>,
  now = Date.now()
): string {
  if (campaign.status === 'draft') {
    return 'Rascunho'
  }

  if (campaign.status === 'cancelled') {
    return 'Cancelada'
  }

  if (Date.parse(campaign.endsAt) < now) {
    return 'Encerrada'
  }

  return Date.parse(campaign.startsAt) > now
    ? 'Agendada'
    : 'Ativa'
}

export function matchesCampaignParticipant(item:CampaignTarget,query:string):boolean {
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 const text=normalize([item.productName,item.variantName,item.productSku,item.variantSku].filter(Boolean).join(' '))
 return normalize(query).trim().split(/\s+/).filter(Boolean).every(word=>text.includes(word))
}
