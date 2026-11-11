import GoogleAdsProvider from '@/components/analytics/GoogleAdsProvider'
import SiteChrome from '@/components/layout/SiteChrome'
import type { Metadata } from 'next'
import { Manrope, Cormorant_Garamond } from 'next/font/google'
import './globals.css'
import './lunarity.css'




const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-manrope',
})

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: '500',
  display: 'swap',
  variable: '--font-cormorant',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://reyna-three.vercel.app'),
  verification: {
    google: 'd_rIRvbCS3nrG2-qzL6ooiG1r7VXjE13a5Jl0YKZu9A',
  },
  title: {
    default: 'Lunarity | Titânio e Ouro 18k',
    template: '%s | Lunarity',
  },
  description:
    'Joias para piercing em titânio e ouro 18K. Confira materiais, medidas e acabamentos de cada peça e monte seu projeto auricular. Envio para todo o Brasil.',
  keywords: [
    'piercing de titânio',
    'piercing de ouro 18k',
    'comprar piercing',
    'piercing biocompatível',
    'argola septo',
    'labret flat back',
  ],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: process.env.NEXT_PUBLIC_SITE_URL || 'https://reyna-three.vercel.app',
    siteName: 'Lunarity',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="pt-BR"
      className={`${manrope.variable} ${cormorant.variable}`}
    >
      <body>
        <GoogleAdsProvider measurementId={process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || null} enabled={process.env.VERCEL_ENV === 'production' && Boolean(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID)}>
          <SiteChrome>{children}</SiteChrome>
        </GoogleAdsProvider>
      </body>
    </html>
  )
}
