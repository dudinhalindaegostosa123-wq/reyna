import Link from 'next/link'
import { redirect } from 'next/navigation'
import { adminDatabase } from '@/lib/admin-auth'
import { saleUuid } from '@/lib/admin-sales'
import WholesalePanel from './WholesalePanel'

import type {
  WholesaleAccount,
  WholesaleSettings,
  WholesaleStatus,
} from './WholesalePanel'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams?: Record<
    string,
    string | string[] | undefined
  >
}

const statuses = {
  pending: 'Aguardando aprovação',
  approved: 'Aprovados',
  rejected: 'Não aprovados',
  suspended: 'Suspensos',
  all: 'Todos os solicitantes',
}

const value = (
  input: string | string[] | undefined
) =>
  Array.isArray(input)
    ? input[0] || ''
    : input || ''

const object = (
  input: unknown
): Record<string, unknown> =>
  input &&
  typeof input === 'object' &&
  !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}

const date = (input: unknown): string | null =>
  typeof input === 'string' &&
  Number.isFinite(Date.parse(input))
    ? input
    : null

export default async function WholesalePage({
  searchParams = {},
}: Props) {
  const { db } = await adminDatabase()

  const requestedStatus = value(searchParams.status)

  const status = Object.prototype.hasOwnProperty.call(
    statuses,
    requestedStatus
  )
    ? requestedStatus
    : 'pending'

  const rawPage = Number(value(searchParams.page))

  const page =
    Number.isSafeInteger(rawPage) && rawPage > 0
      ? Math.min(rawPage, 100000)
      : 1

  const size = 20

  let query = db
    .from('serenity_customer_accounts')
    .select(
      'user_id,customer_id,document,wholesale_status,version,wholesale_requested_at,wholesale_reviewed_at,customer:serenity_customers(id,name,email,phone)',
      { count: 'exact' }
    )
    .neq('wholesale_status', 'not_requested')

  if (status !== 'all') {
    query = query.eq('wholesale_status', status)
  }

  const [
    settingsResult,
    accountsResult,
  ] = await Promise.all([
    db
      .from('serenity_wholesale_settings')
      .select(
        'enabled,discount_percent,minimum_products_cents,version'
      )
      .eq('singleton', true)
      .single(),

    query
      .order('wholesale_requested_at', {
        ascending: false,
        nullsFirst: false,
      })
      .order('user_id')
      .range(
        (page - 1) * size,
        page * size - 1
      ),
  ])

  const href = (target: number) =>
    `/admin/atacado?${new URLSearchParams({
      status,
      page: String(target),
    })}`

  if (
    settingsResult.error ||
    accountsResult.error ||
    !settingsResult.data ||
    !Array.isArray(accountsResult.data)
  ) {
    return (
      <main className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="text-2xl font-medium">
          Atacado
        </h1>

        <p
          role="alert"
          className="mt-5 text-sm text-red-700"
        >
          Não foi possível carregar as regras ou os cadastros.
          Atualize a página antes de alterar dados.
        </p>

        <Link
          href="/admin/atacado"
          className="mt-4 inline-flex min-h-[44px] items-center text-sm underline"
        >
          Tentar novamente
        </Link>
      </main>
    )
  }

  const raw = settingsResult.data

  const settings: WholesaleSettings = {
    enabled: raw.enabled,
    discountPercent: Number(raw.discount_percent),
    minimumProductsCents: Number(
      raw.minimum_products_cents
    ),
    version: Number(raw.version),
  }

  if (
    typeof settings.enabled !== 'boolean' ||
    !Number.isFinite(settings.discountPercent) ||
    settings.discountPercent < 0 ||
    settings.discountPercent > 99.99 ||
    !Number.isSafeInteger(settings.minimumProductsCents) ||
    settings.minimumProductsCents < 0 ||
    !Number.isSafeInteger(settings.version) ||
    settings.version < 1
  ) {
    throw new Error(
      'ADMIN_WHOLESALE_SETTINGS_INVALID'
    )
  }

  const total = accountsResult.count

  if (
    typeof total !== 'number' ||
    !Number.isSafeInteger(total) ||
    total < 0
  ) {
    throw new Error(
      'ADMIN_WHOLESALE_COUNT_INVALID'
    )
  }

  const totalPages = Math.max(
    1,
    Math.ceil(total / size)
  )

  if (page > totalPages) {
    redirect(href(totalPages))
  }

  const accounts: WholesaleAccount[] = (
    accountsResult.data as unknown[]
  ).map(input => {
    const row = object(input)

    const rawCustomer =
      Array.isArray(row.customer) &&
      row.customer.length === 1
        ? row.customer[0]
        : row.customer

    const customer = object(rawCustomer)
    const version = Number(row.version)

    if (
      !saleUuid(row.user_id) ||
      !Number.isSafeInteger(version) ||
      version < 1 ||
      ![
        'pending',
        'approved',
        'rejected',
        'suspended',
      ].includes(String(row.wholesale_status))
    ) {
      throw new Error(
        'ADMIN_WHOLESALE_ACCOUNT_INVALID'
      )
    }

    const hasCustomer =
      saleUuid(row.customer_id) &&
      customer.id === row.customer_id

    return {
      userId: row.user_id,
      version,
      status: row.wholesale_status as WholesaleStatus,

      name:
        hasCustomer &&
        typeof customer.name === 'string'
          ? customer.name
          : 'Cadastro sem vínculo',

      email:
        hasCustomer &&
        typeof customer.email === 'string'
          ? customer.email
          : '',

      phone:
        hasCustomer &&
        typeof customer.phone === 'string'
          ? customer.phone
          : '',

      document:
        typeof row.document === 'string'
          ? row.document
          : '',

      hasCustomer,
      requestedAt: date(row.wholesale_requested_at),
      reviewedAt: date(row.wholesale_reviewed_at),
    }
  })

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-medium">
          Atacado
        </h1>

        <p className="mt-2 text-sm text-[#756B5D]">
          Gerencie as condições e autorize os cadastros de atacado.
        </p>
      </header>

      <form
        action="/admin/atacado"
        method="get"
        className="mb-5 flex flex-wrap items-end gap-3"
      >
        <label className="text-xs">
          Situação

          <select
            name="status"
            defaultValue={status}
            key={status}
            className="mt-2 block min-h-[44px] rounded-xl border border-[#DCD4C8] bg-white px-3 text-sm"
          >
            {Object.entries(statuses).map(
              ([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              )
            )}
          </select>
        </label>

        <button
          type="submit"
          className="min-h-[44px] rounded-full border border-[#DCD4C8] bg-white px-5 text-xs"
        >
          Filtrar cadastros
        </button>

        <p className="pb-3 text-xs text-[#81796C]">
          {total} cadastro(s) encontrado(s)
        </p>
      </form>

      <WholesalePanel
        settings={settings}
        accounts={accounts}
      />

      <nav
        aria-label="Paginação dos cadastros de atacado"
        className="mt-6 flex flex-wrap items-center justify-end gap-4 text-xs"
      >
        {page > 1 && (
          <Link
            href={href(page - 1)}
            prefetch={false}
            className="inline-flex min-h-[44px] items-center underline"
          >
            ← Anterior
          </Link>
        )}

        <span>
          Página {page} de {totalPages}
        </span>

        {page < totalPages && (
          <Link
            href={href(page + 1)}
            prefetch={false}
            className="inline-flex min-h-[44px] items-center underline"
          >
            Próxima →
          </Link>
        )}
      </nav>
    </main>
  )
}
