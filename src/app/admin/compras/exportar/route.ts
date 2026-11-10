import {
  NextResponse,
  type NextRequest,
} from 'next/server'
import { adminDatabase } from '@/lib/admin-auth'
import {
  procurementTab,
  procurementSearch,
  procurementQuery,
} from '@/lib/admin-procurement'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function cell(value: unknown): string {
  let text = String(value ?? '').replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
    ''
  )

  if (/^\s*[=+\-@]/.test(text)) {
    text = "'" + text
  }

  return '"' + text.replace(/"/g, '""') + '"'
}

export async function GET(request: NextRequest) {
  const { db } = await adminDatabase()

  const tab = procurementTab(
    request.nextUrl.searchParams.get('aba') || ''
  )

  const search = procurementSearch(
    request.nextUrl.searchParams.get('q') || ''
  )

  const reviewing = tab === 'conferir'

  const headers = {
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Robots-Tag': 'noindex, nofollow',
  }

  const rows: Record<string, unknown>[] = []

  try {
    for (
      let offset = 0;
      offset <= 10000;
      offset += 500
    ) {
      let query = procurementQuery(db, tab, search)

      query = reviewing
        ? query.order('order_id').order('line_number')
        : query.order('group_id')

      const result = await query.range(
        offset,
        offset + 499
      )

      if (result.error) throw result.error

      const items = (result.data || []) as unknown as
        Record<string, unknown>[]

      rows.push(...items)

      if (rows.length > 10000) {
        return new NextResponse(
          'A lista supera 10.000 registros. Use a busca por peça, SKU ou fornecedor antes de exportar.',
          {
            status: 413,
            headers,
          }
        )
      }

      if (items.length < 500) break
    }

    const columns = reviewing
      ? [
          'Pedido',
          'Item',
          'Produto',
          'Variação',
          'SKU',
          'Fornecedor',
          'Anodização',
          'Voltagem',
          'Necessário',
          'Pedido ao fornecedor',
          'Recebido',
          'Pendência',
        ]
      : [
          'Produto',
          'Variação',
          'SKU',
          'Fornecedor',
          'Anodização',
          'Voltagem',
          'Necessário',
          'Pedido ao fornecedor',
          'Recebido',
          'A comprar',
          'A receber',
        ]

    const lines = rows.map(row => {
      const common = [
        row.product_name,
        row.variation,
        row.sku,
        row.supplier,
        row.anodization,
        row.voltage,
        row.quantity,
        row.ordered,
        row.received,
      ]

      return (
        reviewing
          ? [
              row.order_number,
              row.line_number,
              ...common,
              row.review_reason,
            ]
          : [
              ...common,
              row.to_order,
              row.to_receive,
            ]
      )
        .map(cell)
        .join(';')
    })

    const csv =
      '\uFEFF' +
      [
        columns.map(cell).join(';'),
        ...lines,
      ].join('\r\n') +
      '\r\n'

    return new NextResponse(csv, {
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          `attachment; filename="compras-fornecedor-${tab}.csv"`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new NextResponse(
      'Não foi possível gerar a planilha. Volte à lista e tente novamente.',
      {
        status: 503,
        headers,
      }
    )
  }
}
