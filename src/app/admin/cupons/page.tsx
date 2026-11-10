import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'

import { adminDatabase } from '@/lib/admin-auth'
import { saleMoney, saleUuid } from '@/lib/admin-sales'
import { couponPhase } from '@/lib/coupon-ui'

import type {
  Coupon,
  CouponProduct,
} from '@/lib/coupon-ui'

import CouponEditor from './CouponEditor'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams?: Record<
    string,
    string | string[] | undefined
  >
}

interface CouponListRow {
  id: string
  name: string
  code: string
  status: Coupon['status']
  discount_type: Coupon['discountType']
  discount_value: number | string
  starts_at: string | null
  ends_at: string | null
}

interface CouponRow extends CouponListRow {
  version: number | string
  scope: Coupon['scope']
  minimum_subtotal: number | string
  max_uses: number | null
  max_uses_per_customer: number | null
}

interface ProductTarget {
  product_id: string

  products:
    | {
        id: string
        name: string
        sku: string | null
      }
    | {
        id: string
        name: string
        sku: string | null
      }[]
    | null
}

const PER_PAGE = 20

function text(
  value: string | string[] | undefined
): string {
  return typeof value === 'string' ? value : ''
}

export default async function CouponsPage({
  searchParams = {},
}: Props) {
  const { db } = await adminDatabase()

  const search = text(searchParams.q)
    .trim()
    .slice(0, 100)

  const safeSearch = search
    .replace(/[^a-zA-Z0-9À-ÿ _-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const requestedEdit = text(searchParams.edit)

  const edit = saleUuid(requestedEdit)
    ? requestedEdit
    : ''

  const invalidEdit = Boolean(
    requestedEdit && !edit
  )

  const requestedPage = Number(
    text(searchParams.page)
  )

  const page =
    Number.isSafeInteger(requestedPage) &&
    requestedPage > 0
      ? Math.min(requestedPage, 100000)
      : 1

  function href(
    nextPage = 1,
    nextEdit = edit,
    nextSearch = search
  ) {
    const params = new URLSearchParams()

    if (nextSearch) params.set('q', nextSearch)
    if (nextEdit) params.set('edit', nextEdit)

    if (nextPage > 1) {
      params.set('page', String(nextPage))
    }

    const queryString = params.toString()

    return (
      '/admin/cupons' +
      (queryString ? `?${queryString}` : '')
    )
  }

  let query = db
    .from('serenity_coupons')
    .select(
      'id,name,code,status,discount_type,discount_value,starts_at,ends_at',
      { count: 'exact' }
    )

  if (search) {
    query = safeSearch
      ? query.or(
          `name.ilike.%${safeSearch}%,code.ilike.%${safeSearch}%`
        )
      : query.eq('code', '')
  }

  const [list, selected] = await Promise.all([
    query
      .order('created_at', { ascending: false })
      .order('id')
      .range(
        (page - 1) * PER_PAGE,
        page * PER_PAGE - 1
      ),

    edit
      ? db
          .from('serenity_coupons')
          .select('*')
          .eq('id', edit)
          .maybeSingle()
      : Promise.resolve({
          data: null,
          error: null,
        }),
  ])

  if (
    list.error?.code === 'PGRST103' &&
    page > 1
  ) {
    redirect(href())
  }

  if (list.error || selected.error) {
    throw new Error('ADMIN_COUPONS_QUERY')
  }

  const total = list.count || 0

  const pages = Math.max(
    1,
    Math.ceil(total / PER_PAGE)
  )

  if (page > pages) {
    redirect(href(pages))
  }

  const coupons = (
    list.data || []
  ) as unknown as CouponListRow[]

  const row = selected.data as unknown as CouponRow | null

  const missingCoupon = Boolean(edit && !row)

  let products: CouponProduct[] = []
  let codeLocked = false

  if (row) {
    const [targets, usage] = await Promise.all([
      db
        .from('serenity_coupon_products')
        .select(
          'product_id,products(id,name,sku)',
          { count: 'exact' }
        )
        .eq('coupon_id', row.id)
        .order('product_id')
        .range(0, 499),

      db
        .from('serenity_coupon_redemptions')
        .select('order_id', {
          count: 'exact',
          head: true,
        })
        .eq('coupon_id', row.id),
    ])

    if (
      targets.error ||
      usage.error ||
      targets.count === null ||
      usage.count === null ||
      targets.count > 500 ||
      (targets.data || []).length !== targets.count
    ) {
      throw new Error('ADMIN_COUPON_DETAILS_QUERY')
    }

    products = (
      (targets.data || []) as unknown as ProductTarget[]
    )
      .map(target => {
        const product = Array.isArray(target.products)
          ? target.products.length === 1
            ? target.products[0]
            : null
          : target.products

        if (
          !product ||
          product.id !== target.product_id
        ) {
          throw new Error('ADMIN_COUPON_PRODUCT_QUERY')
        }

        return {
          id: product.id,
          name: product.name || 'Sem nome',
          sku: product.sku || '',
        }
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR')
      )

    codeLocked = usage.count > 0
  }

  const initial: Coupon = row
    ? {
        id: row.id,
        version: Number(row.version),
        name: row.name,
        code: row.code,
        status: row.status,
        discountType: row.discount_type,
        discountValue: Number(row.discount_value),
        scope: row.scope,
        minimumSubtotal: Number(row.minimum_subtotal),
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        maxUses: row.max_uses,
        maxUsesPerCustomer: row.max_uses_per_customer,
        codeLocked,
        products,
      }
    : {
        id: randomUUID(),
        version: 0,
        name: '',
        code: '',
        status: 'draft',
        discountType: 'percent',
        discountValue: 10,
        scope: 'all',
        minimumSubtotal: 0,
        startsAt: null,
        endsAt: null,
        maxUses: null,
        maxUsesPerCustomer: null,
        codeLocked: false,
        products: [],
      }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <h1 className="text-3xl font-medium">
          Cupons
        </h1>

        <p className="mt-3 text-sm text-[#81796C]">
          Códigos de desconto para os clientes
          usarem no checkout.
        </p>
      </header>

      {text(searchParams.salvo) === '1' && row && (
        <p
          role="status"
          className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          Cupom salvo.
        </p>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-[#E5DED3] bg-white">
          <div className="border-b border-[#E5DED3] p-5">
            <Link
              href={href(1, '')}
              className="inline-flex min-h-[44px] items-center rounded-full bg-[#292621] px-5 text-xs text-white"
            >
              + Novo cupom
            </Link>

            <form
              key={search}
              method="get"
              action="/admin/cupons"
              className="mt-4"
            >
              {edit && (
                <input
                  type="hidden"
                  name="edit"
                  value={edit}
                />
              )}

              <label className="block text-xs text-[#625B51]">
                Buscar nome ou código

                <input
                  name="q"
                  defaultValue={search}
                  maxLength={100}
                  className="mt-2 min-h-[44px] w-full rounded-xl border border-[#DDD4C7] px-3 text-base sm:text-sm"
                />
              </label>

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <button
                  type="submit"
                  className="min-h-[44px] rounded-full border border-[#DDD4C7] px-4 text-xs"
                >
                  Buscar
                </button>

                {search && (
                  <Link
                    href={href(1, edit, '')}
                    className="text-xs underline"
                  >
                    Limpar
                  </Link>
                )}
              </div>
            </form>

            <p className="mt-4 text-xs text-[#81796C]">
              {total} cupom(ns) encontrado(s)
            </p>
          </div>

          {coupons.length ? (
            <ul className="divide-y divide-[#EEE9E1]">
              {coupons.map(coupon => {
                const phase = couponPhase({
                  status: coupon.status,
                  startsAt: coupon.starts_at,
                  endsAt: coupon.ends_at,
                })

                return (
                  <li key={coupon.id}>
                    <Link
                      href={href(page, coupon.id)}
                      aria-current={
                        coupon.id === edit
                          ? 'page'
                          : undefined
                      }
                      className={`block px-5 py-4 transition-colors ${
                        coupon.id === edit
                          ? 'bg-[#F1EBE1]'
                          : 'hover:bg-[#FCFBF8]'
                      }`}
                    >
                      <p className="break-words text-sm font-medium">
                        {coupon.code}
                      </p>

                      <p className="mt-1 break-words text-xs text-[#81796C]">
                        {coupon.name}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs">
                          {coupon.discount_type === 'percent'
                            ? `${Number(
                                coupon.discount_value
                              ).toLocaleString('pt-BR')}%`
                            : saleMoney(
                                Number(coupon.discount_value)
                              )}
                        </span>

                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] ${
                            phase === 'Ativo'
                              ? 'bg-green-50 text-green-800'
                              : phase === 'Agendado'
                                ? 'bg-blue-50 text-blue-800'
                                : 'bg-[#F1EBE1] text-[#756B5D]'
                          }`}
                        >
                          {phase}
                        </span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="p-5 text-sm text-[#81796C]">
              {search
                ? 'Nenhum cupom encontrado nesta busca.'
                : 'Nenhum cupom cadastrado.'}
            </p>
          )}

          <nav
            aria-label="Paginação de cupons"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5DED3] p-5 text-xs"
          >
            <span>
              {page} de {pages}
            </span>

            <div className="flex gap-3">
              {page > 1 && (
                <Link href={href(page - 1)}>
                  ← Anterior
                </Link>
              )}

              {page < pages && (
                <Link href={href(page + 1)}>
                  Próxima →
                </Link>
              )}
            </div>
          </nav>
        </section>

        <div className="min-w-0">
          {invalidEdit || missingCoupon ? (
            <section className="rounded-2xl border border-[#E5DED3] bg-white p-5">
              <p role="alert" className="text-sm text-red-700">
                Cupom não encontrado.
              </p>

              <Link
                href={href(1, '')}
                className="mt-4 inline-flex min-h-[44px] items-center text-xs underline"
              >
                Voltar para novo cupom
              </Link>
            </section>
          ) : (
            <CouponEditor
              key={`${initial.id}-${initial.version}`}
              initial={initial}
            />
          )}
        </div>
      </div>
    </main>
  )
}
