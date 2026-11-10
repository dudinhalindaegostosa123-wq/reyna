import { WHOLESALE_STOREFRONT_ENABLED } from '@/lib/storefront-features'
import CustomerShipmentStatus from '@/components/account/CustomerShipmentStatus'
import LegacyHistory from '@/components/account/LegacyHistory'
import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { requireCustomer } from '@/lib/customer-auth'
import { loadCustomerOrders } from '@/lib/customer-orders-server'
import type { CustomerOrderRow } from '@/lib/customer-orders-server'
import { logoutCustomer } from './entrar/actions'
import CustomerProfileForm from './CustomerProfileForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Minha conta',
  robots: {
    index: false,
    follow: false,
  },
}

interface Props {
  searchParams?: {
    aviso?: string | string[]
    page?: string | string[]
    historico?: string | string[]
  }
}

interface TrackingRow {
  order_id: string
  remote_id: string | null
  tracking_code: string | null
  carrier_status: string | null
  last_checked_at: string | null
  events: unknown
}

interface JobRow {
  order_id: string
  remote_id: string | null
  operation: string | null
  state: string
}

interface PurchaseRow {
  order_id: string
  remote_id: string | null
  operation: string | null
  phase: string
  carrier_status: string | null
}

const wholesaleLabels: Record<string, string> = {
  not_requested: 'Cliente',
  pending: 'Atacado aguardando aprovação',
  approved: 'Atacado aprovado',
  rejected: 'Solicitação de atacado não aprovada',
  suspended: 'Acesso ao atacado suspenso',
}

function object(
  value: unknown
): Record<string, unknown> {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown): string {
  return typeof value === 'string'
    ? value
    : ''
}

function label(
  labels: Record<string, string>,
  value: unknown,
  fallback: string
): string {
  const key = text(value)
    .trim()
    .toLowerCase()

  return Object.prototype.hasOwnProperty.call(
    labels,
    key
  )
    ? labels[key]
    : fallback
}

function money(value: unknown): string {
  const amount = Number(value)

  return value != null &&
    Number.isFinite(amount)
    ? new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(amount)
    : '—'
}

function date(value: unknown): string {
  const time = Date.parse(text(value))

  return Number.isFinite(time)
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(new Date(time))
    : '—'
}

function sameId(
  a: unknown,
  b: unknown
): boolean {
  const first = text(a).toLowerCase()
  const second = text(b).toLowerCase()

  return (
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      first
    ) &&
    first === second
  )
}

export default async function CustomerAccountPage({
  searchParams = {},
}: Props) {
  const { auth, user } = await requireCustomer()

  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SECRET_KEY?.trim()

  if (!url || !key) {
    throw new Error(
      'CUSTOMER_ACCOUNT_CONFIGURATION'
    )
  }

  const db = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: 'no-store',
        }),
    },
  })

  const rawPage =
    typeof searchParams.page === 'string'
      ? Number(searchParams.page)
      : 1

  const page =
    Number.isSafeInteger(rawPage) &&
    rawPage > 0
      ? Math.min(rawPage, 100000)
      : 1

  const size = 10

  const profile = await auth
    .from('serenity_customer_accounts')
    .select(
      'customer_id,document,wholesale_status'
    )
    .eq('user_id', user.id)
    .maybeSingle()

  const account = profile.error
    ? null
    : profile.data

  if (!account && process.env.SERENITY_LEGACY_ACTIVATION_ENABLED === 'true') {
    const { legacyProfile } = await import('@/lib/legacy-history-server')
    const imported = await legacyProfile(auth)
    if (imported.eligible && imported.needs_profile) redirect('/minha-conta/completar')
  }

  const status = text(
    account?.wholesale_status
  )

  const [
    customerResult,
    rulesResult,
    ordersResult,
  ] = await Promise.all([
    account?.customer_id
      ? db
          .from('serenity_customers')
          .select('name,phone')
          .eq('id', account.customer_id)
          .maybeSingle()
      : Promise.resolve({
          data: null,
          error: null,
        }),

    db.rpc(
      'serenity_wholesale_context',
      {
        p_user: user.id,
      }
    ),

    loadCustomerOrders(db, user.id, page, size),
  ])

  const total = ordersResult.count ?? 0

  const pages = Math.max(
    1,
    Math.ceil(total / size)
  )

  if (
    (
      ordersResult.error?.code === 'PGRST103' &&
      page > 1
    ) ||
    (
      !ordersResult.error &&
      page > pages
    )
  ) {
    redirect(
      `/minha-conta?page=${pages}#pedidos`
    )
  }

  const orders = (
    ordersResult.error
      ? []
      : ordersResult.data ?? []
  ) as unknown as CustomerOrderRow[]

  const ownedIds = orders.map(
    order => order.id
  )

  let trackingRows: TrackingRow[] = []
  let jobRows: JobRow[] = []
  let purchaseRows: PurchaseRow[] = []
  let trackingError = false

  if (ownedIds.length) {
    const [
      tracking,
      jobs,
      purchases,
    ] = await Promise.all([
      db
        .from('serenity_shipment_tracking')
        .select(
          'order_id,remote_id,tracking_code,carrier_status,last_checked_at,events'
        )
        .in('order_id', ownedIds),

      db
        .from('serenity_label_jobs')
        .select(
          'order_id,remote_id,operation,state'
        )
        .in('order_id', ownedIds),

      db
        .from('serenity_label_purchases')
        .select(
          'order_id,remote_id,operation,phase,carrier_status'
        )
        .in('order_id', ownedIds),
    ])

    trackingError = Boolean(
      tracking.error ||
      jobs.error ||
      purchases.error
    )

    if (!trackingError) {
      trackingRows = (
        tracking.data ?? []
      ) as TrackingRow[]

      jobRows = (
        jobs.data ?? []
      ) as JobRow[]

      purchaseRows = (
        purchases.data ?? []
      ) as PurchaseRow[]
    }
  }

  const customer = customerResult.error
    ? null
    : customerResult.data

  const rules = rulesResult.error
    ? {}
    : object(rulesResult.data)

  const discount = Number(
    rules.discount_percent
  )

  const minimum = Number(
    rules.minimum_products_cents
  )

  const rulesValid =
    !rulesResult.error &&
    typeof rules.active === 'boolean' &&
    rules.discount_percent != null &&
    Number.isFinite(discount) &&
    discount >= 0 &&
    discount <= 99.99 &&
    rules.minimum_products_cents != null &&
    Number.isSafeInteger(minimum) &&
    minimum >= 0

  const document = text(account?.document)

  const maskedDocument = document
    ? `${
        '•'.repeat(
          Math.max(
            0,
            document.length - 4
          )
        )
      }${document.slice(-4)}`
    : 'Não informado'

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center text-xs text-store-muted underline"
        >
          ← Voltar à loja
        </Link>

        <form action={logoutCustomer}>
          <button
            type="submit"
            className="min-h-[44px] rounded-full border border-store-border px-5 text-xs"
          >
            Sair da conta
          </button>
        </form>
      </div>

      <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-store-accent">
        Serenity Piercings
      </p>

      <h1 className="mt-3 text-3xl font-medium tracking-tight">
        Minha conta
      </h1>

      <p className="mt-3 text-sm text-store-muted">
        Seus dados, pedidos e entregas
        em um só lugar.
      </p>

      {searchParams.aviso ===
        'saida-nao-confirmada' && (
        <p
          role="alert"
          className="mt-5 text-sm text-store-error"
        >
          Não foi possível confirmar a saída.
          Tente sair novamente.
        </p>
      )}

      <nav
        aria-label="Minha conta"
        className="mt-6 flex flex-wrap gap-3 text-xs"
      >
        <a
          href="#pedidos"
          className="inline-flex min-h-[44px] items-center rounded-full bg-store-action px-5 text-white"
        >
          Meus pedidos
        </a>

        <a
          href="#dados"
          className="inline-flex min-h-[44px] items-center rounded-full border border-store-border px-5"
        >
          Meus dados
        </a>

        {WHOLESALE_STOREFRONT_ENABLED && <a
          href="#acesso"
          className="inline-flex min-h-[44px] items-center rounded-full border border-store-border px-5"
        >
          Meu acesso
        </a>}
      </nav>

      <div className={WHOLESALE_STOREFRONT_ENABLED ? "mt-7 grid gap-5 md:grid-cols-2" : "mt-7 grid gap-5"}>
        <section
          id="dados"
          className="scroll-mt-6 rounded-3xl border border-store-border bg-store-surface p-6 sm:p-8"
        >
          <h2 className="text-lg font-medium">
            Meus dados
          </h2>

          {profile.error ||
          customerResult.error ||
          !account ||
          !customer ? (
            <p
              role="alert"
              className="mt-4 text-sm text-store-warning"
            >
              Não foi possível carregar seu
              cadastro completo. Atualize a página.
            </p>
          ) : (
            <>
              <CustomerProfileForm
                initial={{
                  name: text(customer.name),
                  phone: text(customer.phone),
                }}
              />

              <div className="mt-5">
                <p className="text-xs text-store-muted">
                  CPF / CNPJ
                </p>

                <p className="mt-1 break-words text-sm">
                  {maskedDocument}
                </p>
              </div>
            </>
          )}

          <div className="mt-4">
            <p className="text-xs text-store-muted">
              E-mail de acesso
            </p>

            <p className="mt-1 break-words text-sm">
              {user.email}
            </p>

            <p className="mt-3 text-xs leading-relaxed text-store-muted">
              Para alterar e-mail ou CPF/CNPJ,
              fale com a equipe Serenity.
            </p>
          </div>
        </section>

        {WHOLESALE_STOREFRONT_ENABLED && <section
          id="acesso"
          className="scroll-mt-6 rounded-3xl border border-store-border bg-store-surface p-6 sm:p-8"
        >
          <h2 className="text-lg font-medium">
            Meu acesso
          </h2>

          {profile.error || !account ? (
            <p
              role="alert"
              className="mt-4 text-sm text-store-warning"
            >
              Não foi possível conferir seu acesso.
              Atualize a página.
            </p>
          ) : (
            <>
              <p className="mt-4 inline-flex rounded-full bg-store-raised px-4 py-2 text-xs">
                {label(
                  wholesaleLabels,
                  status,
                  'Situação em conferência'
                )}
              </p>

              {status === 'pending' && (
                <p className="mt-4 text-sm leading-relaxed text-store-muted">
                  Sua solicitação está em análise.
                  Até a aprovação, suas compras
                  seguem as condições padrão da loja.
                </p>
              )}

              {status === 'rejected' && (
                <p className="mt-4 text-sm leading-relaxed text-store-muted">
                  Você pode continuar comprando
                  na loja. Para esclarecer
                  sua solicitação, fale com
                  a equipe Serenity.
                </p>
              )}

              {status === 'suspended' && (
                <p className="mt-4 text-sm leading-relaxed text-store-muted">
                  As condições de atacado estão
                  suspensas. Fale com a equipe
                  Serenity para conferir seu cadastro.
                </p>
              )}

              {status === 'not_requested' && (
                <p className="mt-4 text-sm leading-relaxed text-store-muted">
                  Sua conta utiliza os preços
                  e as condições padrão da loja.
                </p>
              )}

              {status === 'approved' && (
                rulesValid ? (
                  rules.active ? (
                    <div className="mt-5 space-y-3 text-sm leading-relaxed">
                      <p>
                        <strong>
                          {new Intl.NumberFormat(
                            'pt-BR',
                            {
                              maximumFractionDigits: 2,
                            }
                          ).format(discount)}
                          % de desconto
                        </strong>
                        {' '}sobre o preço normal
                        dos produtos.
                      </p>

                      <p>
                        Pedido mínimo:{' '}
                        <strong>
                          {money(minimum / 100)}
                        </strong>
                        {' '}em produtos após
                        o desconto.
                      </p>

                      <p className="text-xs text-store-muted">
                        Frete e anodização não
                        entram no mínimo.
                        Promoções e cupons padrão da loja
                        não se acumulam com
                        o desconto do atacado.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-store-muted">
                      Seu cadastro está aprovado,
                      mas as condições de atacado
                      estão desativadas no momento.
                    </p>
                  )
                ) : (
                  <p
                    role="alert"
                    className="mt-4 text-sm text-store-warning"
                  >
                    Não foi possível conferir
                    as condições atuais.
                    Atualize a página.
                  </p>
                )
              )}
            </>
          )}

          <Link
            href="/categoria/todos"
            className="mt-6 inline-flex min-h-[46px] items-center rounded-full bg-store-action px-6 py-3 text-sm text-white"
          >
            Explorar a loja
          </Link>
        </section>}
      </div>

      {(ordersResult.error || orders.length > 0) && <section
        id="pedidos"
        className="mt-7 scroll-mt-6 overflow-hidden rounded-3xl border border-store-border bg-store-surface"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-store-border p-6 sm:p-8">
          <h2 className="text-lg font-medium">
            Meus pedidos
          </h2>

          {!ordersResult.error && (
            <span className="text-xs text-store-muted">
              {total} {total === 1 ? 'pedido' : 'pedidos'}
            </span>
          )}
        </div>

        {ordersResult.error ? (
          <div
            role="alert"
            className="p-6 text-sm text-store-warning"
          >
            Não foi possível carregar seus pedidos.
            Atualize a página.
          </div>
        ) : orders.length ? (
          <div className="divide-y divide-store-border">
            {orders.map(order => {
              const shipping = object(
                order.shipping_details
              )

              const tracking = trackingRows.find(
                row => row.order_id === order.id
              )

              const job = jobRows.find(
                row => row.order_id === order.id
              )

              const purchase = purchaseRows.find(
                row => row.order_id === order.id
              )

              const blocked = [
                'canceled',
                'cancelled',
                'expired',
              ].includes(
                text(
                  purchase?.carrier_status
                ).toLowerCase()
              )

              const currentTracking =
                order.status === 'paid' &&
                !trackingError &&
                !blocked &&
                job?.state === 'prepared' &&
                sameId(
                  job.remote_id,
                  purchase?.remote_id
                ) &&
                sameId(
                  job.remote_id,
                  tracking?.remote_id
                ) &&
                Boolean(job.operation) &&
                job.operation ===
                  purchase?.operation &&
                [
                  'paid',
                  'generating',
                  'ready',
                ].includes(
                  text(purchase?.phase)
                )

              const code =
                currentTracking &&
                /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(
                  text(tracking?.tracking_code)
                )
                  ? text(tracking?.tracking_code)
                  : ''


              return (
                <article key={order.id} className="p-6 sm:p-8">
                  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">Pedido #{order.number}</h3><span className="text-sm">{money(order.total)}</span></div>
                  <p className="mt-1 text-[11px] text-store-muted">{date(order.created_at)}</p>
                  <CustomerShipmentStatus status={order.status} workflow={order.workflow_stage} carrier={currentTracking ? tracking?.carrier_status : null} trackingCode={code} />
                  <details className="mt-4 border-t border-store-border">
                    <summary className="min-h-[44px] cursor-pointer py-3 text-xs text-store-muted underline underline-offset-4">Ver detalhes da entrega</summary>
                    {(text(shipping.company) || text(shipping.service)) && <p className="text-xs leading-6 text-store-muted">{[text(shipping.company), text(shipping.service)].filter(Boolean).join(' · ')}</p>}
                    {trackingError && <p className="mt-2 text-xs text-store-muted">O rastreio está temporariamente indisponível. Tente novamente mais tarde.</p>}
                    {order.shipping_pending && <p className="mt-2 text-xs text-store-muted">A entrega será confirmada pela equipe Serenity.</p>}
                  </details>
                </article>
              )
            })}
          </div>
        ) : null}

        {!ordersResult.error && pages > 1 && (
          <nav
            aria-label="Paginação dos pedidos"
            className="flex flex-wrap items-center justify-between gap-4 border-t border-store-border p-6 text-xs"
          >
            <span>
              Página {page} de {pages}
            </span>

            <div className="flex gap-4">
              {page > 1 && (
                <Link
                  href={`/minha-conta?page=${page - 1}#pedidos`}
                  className="inline-flex min-h-[44px] items-center underline"
                >
                  ← Anterior
                </Link>
              )}

              {page < pages && (
                <Link
                  href={`/minha-conta?page=${page + 1}#pedidos`}
                  className="inline-flex min-h-[44px] items-center underline"
                >
                  Próxima →
                </Link>
              )}
            </div>
          </nav>
        )}
      </section>}
      <LegacyHistory primary={!ordersResult.error && orders.length === 0} userId={user.id} page={typeof searchParams.historico === 'string' ? Number(searchParams.historico) : 1} />
    </main>
  )
}
