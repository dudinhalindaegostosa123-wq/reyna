import Link from 'next/link'
import { redirect } from 'next/navigation'
import { adminDatabase } from '@/lib/admin-auth'

import {
  saleUuid,
  saleMoney,
  SALE_STATUS,
  saleDate,
} from '@/lib/admin-sales'

import type { Customer } from '@/lib/admin-sales'
import CustomerForm from './CustomerForm'

interface Props {
  searchParams?: Record<
    string,
    string | string[] | undefined
  >
}

export default async function CustomersPage({
  searchParams = {},
}: Props) {
  const { db } = await adminDatabase()

  const search =
    typeof searchParams.q === 'string'
      ? searchParams.q
          .replace(/[^a-zA-Z0-9À-ÿ @.-]/g, ' ')
          .trim()
          .slice(0, 100)
      : ''

  const requestedPage = Number(searchParams.page)
  const requestedHistory = Number(searchParams.history)

  const page =
    Number.isSafeInteger(requestedPage) &&
    requestedPage > 0
      ? Math.min(requestedPage, 100000)
      : 1

  const historyPage =
    Number.isSafeInteger(requestedHistory) &&
    requestedHistory > 0
      ? Math.min(requestedHistory, 100000)
      : 1

  const selected =
    typeof searchParams.edit === 'string' &&
    saleUuid(searchParams.edit)
      ? searchParams.edit
      : ''

  const creating = searchParams.novo === '1' && !selected

  function href(
    nextPage = page,
    customerId = selected,
    nextHistory = historyPage
  ): string {
    const params = new URLSearchParams()

    if (search) {
      params.set('q', search)
    }

    if (nextPage > 1) {
      params.set('page', String(nextPage))
    }

    if (customerId) {
      params.set('edit', customerId)
    }

    if (customerId && nextHistory > 1) {
      params.set('history', String(nextHistory))
    }

    const query = params.toString()

    return '/admin/clientes' +
      (query ? '?' + query : '')
  }

  let query = db
    .from('serenity_customers')
    .select(
      'id,name,email,phone,notes',
      { count: 'exact' }
    )

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,` +
      `email.ilike.%${search}%,` +
      `phone.ilike.%${search}%`
    )
  }

  const [list, detail, history] = await Promise.all([
    query
      .order('created_at', { ascending: false })
      .order('id')
      .range(
        (page - 1) * 20,
        page * 20 - 1
      ),

    selected
      ? db
          .from('serenity_customers')
          .select('id,name,email,phone,notes')
          .eq('id', selected)
          .maybeSingle()
      : Promise.resolve({
          data: null,
          error: null,
        }),

    selected
      ? db
          .from('serenity_orders')
          .select(
            'id,number,status,total,created_at',
            { count: 'exact' }
          )
          .eq('customer_id', selected)
          .order('created_at', { ascending: false })
          .order('id')
          .range(
            (historyPage - 1) * 20,
            historyPage * 20 - 1
          )
      : Promise.resolve({
          data: [],
          error: null,
          count: 0,
        }),
  ])

  if (list.error?.code === 'PGRST103') {
    redirect(href(1))
  }

  if (history.error?.code === 'PGRST103') {
    redirect(href(page, selected, 1))
  }

  if (
    list.error ||
    detail.error ||
    history.error
  ) {
    throw new Error('ADMIN_CUSTOMERS_QUERY')
  }

  const pages = Math.max(
    1,
    Math.ceil((list.count || 0) / 20)
  )

  const historyPages = Math.max(
    1,
    Math.ceil((history.count || 0) / 20)
  )

  const customer = detail.data as Customer | null

  if (page > pages) {
    redirect(href(pages))
  }

  if (historyPage > historyPages) {
    redirect(
      href(page, selected, historyPages)
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-medium">Clientes</h1><p className="mt-2 text-xs text-[#81796C]">{list.count || 0} cliente(s){search?' encontrado(s)':''}</p></div><Link href={href(page,'',1)+(href(page,'',1).includes('?')?'&':'?')+'novo=1'} className="inline-flex min-h-[44px] items-center rounded-full bg-[#292621] px-5 text-xs text-white">+ Novo cliente</Link><Link href="/admin/historico?clientes=1" className="inline-flex min-h-[44px] items-center text-xs underline">Clientes do site antigo</Link></header>

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="overflow-hidden rounded-3xl border bg-white">
          <form
            method="get"
            className="flex gap-2 border-b p-5"
          >
            <input
              name="q"
              defaultValue={search}
              maxLength={100}
              aria-label="Buscar clientes"
              placeholder="Nome, e-mail ou telefone"
              className="min-h-[44px] min-w-0 flex-1 rounded-full border px-4 text-base sm:text-sm"
            />

            <button className="rounded-full bg-[#292621] px-5 text-xs text-white">Buscar</button>
            {search && <Link href="/admin/clientes" className="inline-flex min-h-[44px] items-center px-2 text-xs underline">Limpar</Link>}
          </form>

          {(list.data || []).map((item: Customer) => (
            <Link
              key={item.id}
              href={href(page, item.id, 1)}
              className={
                'block border-b p-5 ' +
                (
                  selected === item.id
                    ? 'bg-[#F5EFE5]'
                    : ''
                )
              }
            >
              <p className="text-sm font-medium">
                {item.name}
              </p>

              <p className="mt-1 break-words text-xs text-[#81796C]">
                {item.email || 'Sem e-mail'}
                {' · '}
                {item.phone || 'Sem telefone'}
              </p>
            </Link>
          ))}

          {!list.data?.length && (
            <p className="p-5 text-sm">
              Nenhum cliente encontrado.
            </p>
          )}

          <nav
            aria-label="Paginação de clientes"
            className="flex justify-between gap-3 p-5 text-xs"
          >
            <span>
              {page} de {pages}
            </span>

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
          </nav>
        </section>

        <div className={(selected || creating ? 'order-first lg:order-none ' : '')+'min-w-0'}>
          {(selected || creating) && <Link href={href(page,'',1)} className="mb-3 inline-flex min-h-[44px] items-center text-xs underline">Fechar ficha</Link>}
          {selected && !customer ? (
            <p role="alert" className="rounded-3xl border bg-white p-5">Cliente não encontrado.</p>
          ) : creating ? (
            <CustomerForm key="new" />
          ) : customer ? (
            <section className="rounded-3xl border bg-white p-5"><h2 className="break-words text-lg font-medium">{customer.name}</h2><div className="mt-3 space-y-2 break-words text-xs text-[#81796C]">{customer.email && <p>{customer.email}</p>}{customer.phone && <p>{customer.phone}</p>}{!customer.email && !customer.phone && <p>Contato não informado.</p>}</div>{customer.notes && <details className="mt-4 border-t pt-3"><summary className="cursor-pointer py-2 text-xs">Observações internas</summary><p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-[#81796C]">{customer.notes}</p></details>}<details className="mt-4 border-t pt-3"><summary className="cursor-pointer py-2 text-xs font-medium">Editar cadastro</summary><div className="mt-3"><CustomerForm key={customer.id} customer={customer}/></div></details></section>
          ) : (
            <div className="hidden rounded-3xl border border-dashed p-6 text-sm leading-7 text-[#81796C] lg:block">Selecione um cliente para consultar o contato e os pedidos vinculados.</div>
          )}

          {customer && (
            <section className="mt-5 overflow-hidden rounded-3xl border bg-white p-5">
              <h2 className="text-sm font-medium">
                Histórico · {history.count || 0} pedido(s)
              </h2>

              {(history.data || []).map(order => (
                <Link
                  key={order.id}
                  href={'/admin/pedidos/' + order.id}
                  className="mt-3 block border-t pt-3 text-xs"
                >
                  <strong>
                    #{order.number}
                    {' · '}
                    {saleMoney(Number(order.total))}
                  </strong>

                  <span className="mt-1 block">
                    {SALE_STATUS[order.status] ||
                      order.status}
                    {' · '}
                    {saleDate(order.created_at)}
                  </span>
                </Link>
              ))}

              {!history.data?.length && (
                <p className="mt-3 text-xs">
                  Sem pedidos vinculados.
                </p>
              )}

              <nav
                aria-label="Paginação do histórico do cliente"
                className="mt-5 flex flex-wrap justify-between gap-3 text-xs"
              >
                <span>
                  {historyPage} de {historyPages}
                </span>

                {historyPage > 1 && (
                  <Link
                    href={href(
                      page,
                      selected,
                      historyPage - 1
                    )}
                  >
                    ← Anterior
                  </Link>
                )}

                {historyPage < historyPages && (
                  <Link
                    href={href(
                      page,
                      selected,
                      historyPage + 1
                    )}
                  >
                    Próxima →
                  </Link>
                )}
              </nav>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
