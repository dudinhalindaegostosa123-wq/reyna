'use client'

import Link from 'next/link'
import { formatPrice } from '@/lib/data'
import type { CouponDeliveryReceipt } from './actions'

export default function CheckoutReceipt({
  receipt,
}: {
  receipt: CouponDeliveryReceipt
}) {
  const payment = receipt.payment

  const validPaymentId =
    typeof payment?.orderId === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      payment.orderId
    )

  const canContinue =
    validPaymentId &&
    payment?.accessReady === true &&
    !receipt.shippingPending

  const reservedTime = receipt.reservedUntil
    ? Date.parse(receipt.reservedUntil)
    : NaN

  return (
    <main className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <p className="text-xs uppercase tracking-[0.2em] text-store-accent">
        Lunarity
      </p>

      <h1 className="mt-3 text-3xl font-medium tracking-tight">
        Pedido #{receipt.number} recebido
      </h1>

      <p className="mt-4 text-sm leading-7 text-store-muted">
        Seu pedido foi registrado. Nenhum valor foi cobrado
        nesta etapa.
      </p>

      <section className="my-6 rounded-3xl border border-store-border bg-store-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-store-muted">
            {receipt.shippingPending
              ? 'Total sem o frete a confirmar'
              : 'Total do pedido'}
          </span>

          <strong className="text-2xl font-medium">
            {formatPrice(receipt.total)}
          </strong>
        </div>

        {typeof receipt.discount === 'number' &&
          receipt.discount > 0 && (
            <p className="mt-4 text-sm text-store-success">
              Desconto do cupom incluído:{' '}
              {formatPrice(receipt.discount)}.
            </p>
          )}

        <p className="mt-4 text-sm leading-7 text-store-muted">
          {receipt.shippingPending
            ? 'A equipe precisa confirmar o frete antes do pagamento.'
            : `Frete incluído: ${formatPrice(receipt.shipping)}.`}
        </p>

        {Number.isFinite(reservedTime) && (
          <p className="mt-4 text-xs leading-6 text-store-muted">
            Reserva inicial até{' '}
            {new Intl.DateTimeFormat('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: 'America/Sao_Paulo',
            }).format(new Date(reservedTime))}
            . Depois desse prazo, a disponibilidade precisa
            ser conferida novamente.
          </p>
        )}

        {canContinue ? (
          <Link
            href={`/pagamento/${payment!.orderId}`}
            className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full bg-store-action px-6 py-3 text-sm text-white"
          >
            Continuar para pagamento
          </Link>
        ) : !receipt.shippingPending ? (
          <p
            role="alert"
            className="mt-5 rounded-2xl bg-store-warning-bg p-4 text-sm leading-7 text-store-warning"
          >
            O pedido foi salvo, mas não foi possível liberar
            o acesso ao pagamento. Não envie outro pedido.
            Fale com a equipe Lunarity informando o número
            acima.
          </p>
        ) : null}
      </section>

      <p className="text-sm leading-7 text-store-muted">
        Guarde o número do pedido. Se tiver alguma dificuldade
        no pagamento, não refaça a compra; fale com o
        atendimento.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/minha-conta"
          className="inline-flex min-h-[44px] items-center rounded-full border border-store-border px-5 text-sm"
        >
          Minha conta
        </Link>

        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center px-3 text-sm underline underline-offset-4"
        >
          Voltar à loja
        </Link>
      </div>
    </main>
  )
}
