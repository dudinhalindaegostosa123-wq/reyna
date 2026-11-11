import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { guestCheckoutEnabled, optionalCheckoutAccess } from '@/lib/guest-checkout'
import CheckoutClient from './CheckoutClient'
import { mercadoPagoPublicConfig } from '@/lib/mercado-pago-server'
import { checkoutSessionErrorV2 } from '@/lib/checkout-session-server-v2'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
}

export default async function CheckoutPage() {
  let accountId: string | null = null
  let testMode = false
  try {
    if (process.env.ASAAS_ENVIRONMENT) {
      const { asaasConfig } = await import('@/lib/asaas-server')
      testMode = asaasConfig(true).environment === 'sandbox'
    } else testMode = mercadoPagoPublicConfig().environment === 'test'
    accountId = (await optionalCheckoutAccess()).userId
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'WHOLESALE_SESSION' || code === 'WHOLESALE_EMAIL') {
      redirect('/minha-conta/entrar?retorno=checkout')
    }
    return (
      <main className="mx-auto max-w-xl px-5 py-16">
        <h1 className="text-2xl font-medium">Pagamento em configuração</h1>
        <p role="alert" className="mt-4 text-sm leading-7 text-store-muted">
          {checkoutSessionErrorV2(error)} Nenhum pedido foi criado por esta tela.
        </p>
        <a href="/" className="mt-6 inline-block text-sm underline">Voltar à loja</a>
      </main>
    )
  }

  if (!accountId && !guestCheckoutEnabled()) redirect('/minha-conta/entrar?retorno=checkout')

  return (
    <>
      {testMode && <div role="status" className="border-b border-amber-200 bg-store-warning-bg px-5 py-3 text-center text-xs leading-6 text-store-warning">
        Checkout V2 · Ambiente de teste · Não pague o Pix de teste pelo banco.
        Uma aprovação de teste não cria uma venda real.
      </div>}
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-8">
        <div className="rounded-2xl border border-store-border bg-store-surface px-5 py-4 text-sm leading-6">
          {accountId ? <p>Você está conectado à sua conta. Acompanhe suas compras vinculadas em <Link href="/minha-conta#pedidos" className="underline underline-offset-4">Meus pedidos</Link>.</p> : <p>Compre sem criar conta. Já é cliente? <Link href="/minha-conta/entrar?retorno=checkout" className="underline underline-offset-4">Entrar</Link> <span className="text-store-muted">·</span> <Link href="/minha-conta/cadastrar?retorno=checkout" className="underline underline-offset-4">Criar conta (opcional)</Link></p>}
        </div>
      </div>
      <CheckoutClient />
    </>
  )
}
