import GoogleAdsProvider from '@/components/analytics/GoogleAdsProvider'
import SiteChrome from '@/components/layout/SiteChrome'
import type { Metadata } from 'next'
import { Manrope, Cormorant_Garamond } from 'next/font/google'
import './globals.css'




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
  metadataBase: new URL('https://serenitypiercings.com.br'),
  title: {
    default: 'Serenity Piercings | Titânio e Ouro 18k',
    template: '%s | Serenity Piercings',
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
    url: 'https://serenitypiercings.com.br',
    siteName: 'Serenity Piercings',
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
        <GoogleAdsProvider measurementId={process.env.SERENITY_GA4_MEASUREMENT_ID || 'G-ZR73XP32BW'} enabled={process.env.VERCEL_ENV === 'production'}>
          <SiteChrome>{children}</SiteChrome>
        </GoogleAdsProvider>
      </body>
    </html>
  )
}
