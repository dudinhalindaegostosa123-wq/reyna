'use client'

import CommerceAnalytics from './CommerceAnalytics'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect } from 'react'
import { GOOGLE_ADS_ID, initializeGoogleAds, trackPurchaseConversion } from '@/lib/google-ads'
import type { PaidCheckout } from '@/lib/google-ads'

const GoogleAdsEnabled = createContext(false)

export default function GoogleAdsProvider({
  enabled: configured, children, measurementId=null,
}: {
  enabled: boolean
  measurementId?: string|null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const enabled = configured && !pathname.startsWith('/pagamento/') && pathname !== '/acompanhar' && !pathname.startsWith('/acompanhar/') && !pathname.startsWith('/admin') && !pathname.startsWith('/minha-conta')
  useEffect(() => {
    if (enabled) initializeGoogleAds()
  }, [enabled])

  return (
    <GoogleAdsEnabled.Provider value={enabled}>
      {enabled && (
        <Script
          id="serenity-google-ads"
          src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
          strategy="afterInteractive"
        />
      )}
      <CommerceAnalytics enabled={enabled} measurementId={measurementId} />
      {children}
    </GoogleAdsEnabled.Provider>
  )
}

export function GoogleAdsPurchase({ session }: { session: PaidCheckout }) {
  const enabled = useContext(GoogleAdsEnabled)
  useEffect(() => {
    if (enabled) trackPurchaseConversion(session)
  }, [enabled, session])
  return null
}
