'use server'

import { revalidatePath } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { saleUuid } from '@/lib/admin-sales'

export interface ProcurementSaveResult {
  ok: boolean
  error: string
  fields?: Record<string, string>
  version?: number
  ordered?: number
  received?: number
}

function integer(
  value: FormDataEntryValue | null,
  max: number
): number | null {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(value)
  ) {
    return null
  }

  const number = Number(value)

  return Number.isSafeInteger(number) && number <= max
    ? number
    : null
}

function errorMessage(error: unknown): string {
  const message =
    error &&
    typeof error === 'object' &&
    'message' in error
      ? String(error.message)
      : ''

  const messages: Record<string, string> = {
    PROCUREMENT_INVALID:
      'Confira as quantidades e tente novamente.',
    PROCUREMENT_ORDER_UNAVAILABLE:
      'Este pedido não está disponível para registrar compras. Confira se continua pago.',
    PROCUREMENT_LINE_CHANGED:
      'O item mudou ou foi removido. Atualize a página e confira as compras anteriores antes de comprar novamente.',
    PROCUREMENT_QUANTITY:
      'A quantidade pedida ao fornecedor não pode superar a quantidade deste item no pedido.',
    PROCUREMENT_STALE:
      'Outra alteração foi salva para este item. Atualize a página antes de continuar.',
    PROCUREMENT_NOTE_REQUIRED:
      'Para reduzir uma quantidade já registrada, explique a correção em Observações.',
    PROCUREMENT_REQUEST_CHANGED:
      'Esta tentativa já foi registrada com outros dados. Atualize a página e confira o resultado antes de continuar.',
  }

  const code = Object.keys(messages).find(key =>
    new RegExp(
      '(?:^|[^A-Z_])' + key + '(?:$|[^A-Z_])'
    ).test(message)
  )

  return code
    ? messages[code]
    : 'Não foi possível confirmar o salvamento. Atualize a página e confira os valores antes de tentar novamente.'
}

export async function saveProcurementLine(
  data: FormData
): Promise<ProcurementSaveResult> {
  const { db, user } = await adminDatabase()

  if (!(data instanceof FormData)) {
    return {
      ok: false,
      error: 'Confira os dados enviados.',
    }
  }

  const order = data.get('order_id')
  const signature = data.get('signature')
  const request = data.get('request_id')

  const line = integer(data.get('line_number'), 500)
  const version = integer(
    data.get('version'),
    Number.MAX_SAFE_INTEGER - 1
  )
  const ordered = integer(data.get('ordered'), 999999)
  const received = integer(data.get('received'), 999999)

  const rawNote = data.get('note')
  const note =
    typeof rawNote === 'string'
      ? rawNote.trim()
      : ''

  const fields: Record<string, string> = {}

  if (
    !saleUuid(order) ||
    !saleUuid(request) ||
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    line === null ||
    line < 1 ||
    version === null
  ) {
    return {
      ok: false,
      error:
        'A referência do item está inválida. Atualize a página.',
    }
  }

  if (ordered === null) {
    fields.ordered =
      'Informe uma quantidade inteira a partir de zero.'
  }

  if (received === null) {
    fields.received =
      'Informe uma quantidade inteira a partir de zero.'
  }

  if (
    ordered !== null &&
    received !== null &&
    received > ordered
  ) {
    fields.received =
      'O recebido não pode superar o que foi pedido ao fornecedor.'
  }

  if (
    typeof rawNote !== 'string' ||
    note.length > 1000 ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(note)
  ) {
    fields.note =
      'Use uma observação de até 1.000 caracteres.'
  }

  if (data.get('confirmed') !== 'on') {
    fields.confirmed =
      'Confirme que conferiu as quantidades antes de salvar.'
  }

  if (Object.keys(fields).length) {
    return {
      ok: false,
      error: 'Confira os campos destacados.',
      fields,
    }
  }

  try {
    const current = await db
      .from('serenity_admin_procurement_lines_v1')
      .select(
        'order_status,quantity,ordered,received,signature,version'
      )
      .eq('order_id', order)
      .eq('line_number', line)
      .maybeSingle()

    if (current.error) throw current.error

    if (
      !current.data ||
      current.data.order_status !== 'paid'
    ) {
      return {
        ok: false,
        error:
          'Este item não está disponível. Atualize a lista e confira o pedido.',
      }
    }

    if (current.data.signature !== signature) {
      return {
        ok: false,
        error:
          'O item mudou. Atualize a lista antes de continuar.',
      }
    }

    if (ordered! > Number(current.data.quantity)) {
      return {
        ok: false,
        error: 'Confira a quantidade.',
        fields: {
          ordered:
            'A quantidade não pode superar o necessário neste item do pedido.',
        },
      }
    }

    if (
      (
        ordered! < Number(current.data.ordered) ||
        received! < Number(current.data.received)
      ) &&
      note.length < 3
    ) {
      return {
        ok: false,
        error: 'Explique a correção.',
        fields: {
          note:
            'Explique por que está reduzindo uma quantidade já registrada.',
        },
      }
    }

    const result = await db.rpc(
      'serenity_admin_procurement_update_v1',
      {
        p_order: order,
        p_line: line,
        p_signature: signature,
        p_ordered: ordered,
        p_received: received,
        p_expected_version: version,
        p_request: request,
        p_actor: user.id,
        p_note: note,
      }
    )

    if (result.error) throw result.error

    const saved = result.data as {
      version?: unknown
      ordered?: unknown
      received?: unknown
    } | null

    const savedVersion = Number(saved?.version)
    const savedOrdered = Number(saved?.ordered)
    const savedReceived = Number(saved?.received)

    if (
      !saved ||
      saved.version == null ||
      saved.ordered == null ||
      saved.received == null ||
      !Number.isSafeInteger(savedVersion) ||
      savedVersion < 1 ||
      !Number.isSafeInteger(savedOrdered) ||
      savedOrdered < 0 ||
      !Number.isSafeInteger(savedReceived) ||
      savedReceived < 0 ||
      savedReceived > savedOrdered
    ) {
      throw new Error('PROCUREMENT_RESPONSE_INVALID')
    }

    revalidatePath('/admin/compras')
    revalidatePath('/admin/operacao')

    return {
      ok: true,
      error: '',
      version: savedVersion,
      ordered: savedOrdered,
      received: savedReceived,
    }
  } catch (error) {
    revalidatePath('/admin/compras')

    return {
      ok: false,
      error: errorMessage(error),
    }
  }
}
