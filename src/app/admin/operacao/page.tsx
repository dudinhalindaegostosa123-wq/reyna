import Link from 'next/link'
import { adminDatabase } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export default async function OperationPage() {
  const { db } = await adminDatabase()
  const now = new Date().toISOString()

  const [
    pending,
    shipping,
    labels,
    drafts,
    active,
  ] = await Promise.all([
    db
      .from('serenity_orders')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('status', 'pending'),

    db
      .from('serenity_orders')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('status', 'paid')
      .eq('shipping_pending', true),

    db
      .from('serenity_admin_label_center_v1')
      .select(
        'order_id,order_number,customer_name',
        { count: 'exact' }
      )
      .eq('label_stage', 'review')
      .order('created_at', { ascending: true })
      .range(0, 4),

    db
      .from('serenity_promotion_campaigns')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('status', 'draft'),

    db
      .from('serenity_promotion_campaigns')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('status', 'published')
      .lte('starts_at', now)
      .gte('ends_at', now),
  ])

  const cards = [
    {
      title: 'Pagamentos pendentes',
      result: pending,
      href: '/admin/pedidos?status=pending',
      description:
        'Pedidos aguardando pagamento.',
    },
    {
      title: 'Pagos com frete a confirmar',
      result: shipping,
      href: '/admin/pedidos?status=paid',
      description:
        'Abra os pedidos pagos e confira o frete.',
    },
    {
      title: 'Campanhas em rascunho',
      result: drafts,
      href: '/admin/campanhas',
      description:
        'Campanhas que ainda precisam ser publicadas.',
    },
    {
      title: 'Campanhas ativas',
      result: active,
      href: '/admin/campanhas',
      description:
        'Campanhas publicadas dentro do período atual.',
    },
  ]

  const shortcuts = [
    {
      title: 'Etiquetas',
      description:
        'A comprar, compradas, enviadas e situações a conferir.',
      href: '/admin/etiquetas',
    },
    {
      title: 'Clientes',
      description:
        'Cadastros e histórico de pedidos.',
      href: '/admin/clientes',
    },
    {
      title: 'Produtos',
      description:
        'Produtos, variações, preços e estoque.',
      href: '/admin/produtos',
    },
    {
      title: 'Banners',
      description:
        'Imagens, textos e links da página inicial.',
      href: '/admin/banners',
    },
    {
      title: 'Configurações de envio',
      description:
        'Frete, embalagem e dados do remetente.',
      href: '/admin/frete',
    },
  ]

  const button =
    'inline-flex min-h-[44px] items-center justify-center rounded-full border border-[#DDD4C7] bg-white px-5 text-xs'

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium">
            Visão geral
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#625B51]">
            Acompanhe pedidos, etiquetas e campanhas.
            Atualize a página para conferir os
            registros mais recentes.
          </p>
        </div>

        <a
          href="/admin/operacao"
          className={button}
        >
          Atualizar visão geral
        </a>
      </div>

      <section
        aria-label="Resumo da operação"
        className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {cards.map(card => (
          <Link
            key={card.title}
            href={card.href}
            className="min-w-0 rounded-3xl border border-[#E5DED3] bg-white p-5 transition-colors hover:bg-[#FCFBF8]"
          >
            <h2 className="text-sm font-medium">
              {card.title}
            </h2>

            <p
              className={`mt-4 ${
                card.result.error
                  ? 'text-sm text-red-700'
                  : 'text-3xl font-medium'
              }`}
            >
              {card.result.error
                ? 'Não foi possível carregar'
                : card.result.count ?? 0}
            </p>

            <p className="mt-3 text-xs leading-6 text-[#625B51]">
              {card.description}
            </p>

            <span className="mt-4 block text-xs underline">
              Conferir →
            </span>
          </Link>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">
          Acesso rápido
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shortcuts.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="min-w-0 rounded-3xl border border-[#E5DED3] bg-white p-5 transition-colors hover:bg-[#FCFBF8]"
            >
              <h3 className="text-sm font-medium">
                {item.title}
              </h3>

              <p className="mt-2 text-xs leading-6 text-[#625B51]">
                {item.description}
              </p>

              <span className="mt-4 block text-xs underline">
                Abrir →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-7 rounded-3xl border border-[#E5DED3] bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">
            Etiquetas para conferir
          </h2>

          <Link
            href="/admin/etiquetas?etapa=review"
            className={button}
          >
            Abrir lista
          </Link>
        </div>

        {labels.error ? (
          <p
            role="alert"
            className="mt-4 text-sm text-red-700"
          >
            Não foi possível carregar as etiquetas.
            Atualize a página.
          </p>
        ) : labels.data?.length ? (
          <>
            <p className="mt-3 text-xs text-[#625B51]">
              {labels.count ?? labels.data.length}{' '}
              envio(s) precisam de conferência.
              Não repita compras antes de verificar
              a situação.
            </p>

            <ul className="mt-4 divide-y divide-[#EEE8DE]">
              {labels.data.map(item => (
                <li key={item.order_id}>
                  <Link
                    href={`/admin/pedidos/${item.order_id}`}
                    className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <span className="text-sm">
                      Pedido #{item.order_number}
                      {' · '}
                      {item.customer_name}
                    </span>

                    <span className="text-xs underline">
                      Conferir →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <p className="mt-3 text-xs text-[#625B51]">
              Mostrando até 5 envios. Abra a lista
              para ver todos.
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm text-[#625B51]">
            Nenhuma etiqueta pendente de conferência.
          </p>
        )}
      </section>
    </main>
  )
}
