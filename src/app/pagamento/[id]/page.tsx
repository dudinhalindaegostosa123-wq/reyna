import Link from 'next/link'
import type { Metadata } from 'next'
import { checkoutDatabase } from '@/lib/checkout-server'
import {
  readCheckoutSessionV2,
  checkoutSessionErrorV2,
} from '@/lib/checkout-session-server-v2'
import { mercadoPagoConfig, mercadoPagoPublicConfig } from '@/lib/mercado-pago-server'
import { cardPaymentReady } from '@/lib/payment-processing-server'
import PixCheckoutV2 from './PixCheckoutV2'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export const metadata: Metadata = {
  title: 'Pagamento',
  robots: {
    index: false,
    follow: false,
  },
  referrer: 'no-referrer',
}

export default async function PaymentPage({
  params,
}: {
  params: { id: string }
}) {
  try {
    const db = await checkoutDatabase('review')

    const { session } =
      await readCheckoutSessionV2(
        db,
        params.id
      )

    let enabled = false
    let configurationError = ''
    let publicKey = ''
    let cardsEnabled = false
    let queryEnabled = false

    try {
      const readonlyConfiguration = mercadoPagoConfig()
      publicKey = readonlyConfiguration.publicKey
      queryEnabled = session.environment === readonlyConfiguration.environment
      const configuration = mercadoPagoPublicConfig()
      cardsEnabled = await cardPaymentReady(db)
      enabled = session.environment === configuration.environment
      if (!enabled) configurationError = 'Esta tentativa pertence a outro ambiente de pagamento. Fale com a equipe antes de iniciar outra compra.'
    } catch (error) {
      configurationError =
        checkoutSessionErrorV2(error)
    }

    return (
      <PixCheckoutV2
        key={session.id}
        initial={session}
        enabled={enabled}
        configurationError={configurationError}
        publicKey={publicKey}
        cardReady={cardsEnabled}
        queryEnabled={queryEnabled}
      />
    )
  } catch (error) {
    const message =
      checkoutSessionErrorV2(error)

    return (
      <main className="mx-auto max-w-2xl px-5 py-12">
        <h1 className="text-2xl font-medium">
          Acesso ao pagamento
        </h1>

        <p
          role="alert"
          className="mt-4 text-sm leading-7"
        >
          {message} Se você já tentou pagar,
          fale com a equipe Serenity antes de
          iniciar outra tentativa.
        </p>

        <Link
          href="/checkout"
          className="mt-5 inline-flex min-h-[44px] items-center text-sm underline"
        >
          Voltar ao checkout
        </Link>
      </main>
    )
  }
}
