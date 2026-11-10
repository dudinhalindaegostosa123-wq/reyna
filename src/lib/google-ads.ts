export const GOOGLE_ADS_ID = 'AW-11257948716'
export const GOOGLE_ADS_PURCHASE = GOOGLE_ADS_ID + '/_htiCIPG0fgbEKzUmvgp'

type GoogleAdsWindow = Window & {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

let initialized = false
const queuedOrders = new Set<string>()

export function initializeGoogleAds() {
  if (typeof window === 'undefined') return
  const target = window as GoogleAdsWindow
  target.dataLayer = target.dataLayer || []
  target.gtag = target.gtag || function () {
    target.dataLayer!.push(arguments)
  }
  if (!initialized) {
    target.gtag('js', new Date())
    target.gtag('config', GOOGLE_ADS_ID)
    initialized = true
  }
}

export interface PaidCheckout {
  environment: string
  state: string
  orderId: string | null
  totalCents: number
  needsReview: boolean
  testApproved: boolean
  shippingPending: boolean
  attempts: { state: string; applicationState: string }[]
}

export function purchaseConversion(session: PaidCheckout) {
  if (
    session.environment !== 'production' ||
    session.state !== 'converted' ||
    !session.orderId ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(session.orderId) ||
    session.needsReview || session.testApproved || session.shippingPending ||
    !Number.isSafeInteger(session.totalCents) || session.totalCents <= 0 ||
    !session.attempts.some(attempt =>
      attempt.state === 'approved' && attempt.applicationState === 'applied') ||
    session.attempts.some(attempt =>
      ['refunded', 'charged_back'].includes(attempt.state))
  ) return null

  return {
    send_to: GOOGLE_ADS_PURCHASE,
    value: session.totalCents / 100,
    currency: 'BRL',
    transaction_id: session.orderId,
  }
}

export function trackPurchaseConversion(session: PaidCheckout) {
  if (typeof window === 'undefined') return false
  const conversion = purchaseConversion(session)
  if (!conversion || queuedOrders.has(conversion.transaction_id)) return false
  const key = 'serenity-google-ads-purchase:' + conversion.transaction_id
  try {
    if (window.localStorage.getItem(key) === 'queued') return false
  } catch {
    // Storage restrictions must not interfere with checkout.
  }

  try {
    initializeGoogleAds()
    ;(window as GoogleAdsWindow).gtag!('event', 'conversion', conversion)
    queuedOrders.add(conversion.transaction_id)
    try { window.localStorage.setItem(key, 'queued') } catch {}
    return true
  } catch {
    // Advertising failures must never interrupt payment or cart cleanup.
    return false
  }
}
