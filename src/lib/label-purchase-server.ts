import 'server-only'
import { verifyLegacyBinding } from '@/lib/legacy-label-binding'

import type { SupabaseClient } from '@supabase/supabase-js'
import { remoteCart, remotePrice, verifyRemote } from '@/lib/label-cart-server'
import { saleUuid } from '@/lib/admin-sales'
import type { LabelPurchaseView } from '@/lib/label-purchase'

type Row = Record<string, unknown>

const row = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Row
    : {}

export async function purchaseSource(
  db: SupabaseClient,
  id: string
) {
  const [o, j, p] = await Promise.all([
    db.from('serenity_orders')
      .select('id,status,shipping_pending,updated_at')
      .eq('id', id).single(),
    db.from('serenity_label_jobs')
      .select('*').eq('order_id', id).single(),
    db.from('serenity_label_purchases')
      .select('*').eq('order_id', id).maybeSingle(),
  ])

  if (o.error || j.error || p.error) {
    throw new Error('PURCHASE_QUERY')
  }

  const issues: string[] = []

  if (o.data.status !== 'paid' || o.data.shipping_pending) {
    issues.push(
      'O pedido precisa estar pago e com o frete confirmado.'
    )
  }

  if (j.data.state !== 'prepared' || !saleUuid(j.data.remote_id)) {
    issues.push(
      'Prepare o envio no carrinho antes de comprar a etiqueta.'
    )
  }

  return {
    order: o.data,
    job: j.data,
    purchase: p.data,
    issues,
  }
}

export async function purchaseView(
  db: SupabaseClient,
  id: string
): Promise<LabelPurchaseView> {
  const source = await purchaseSource(db, id)
  const p = source.purchase

  return {
    orderId: id,
    phase: String(p?.phase || 'empty'),
    reviewId: String(p?.review_id || ''),
    reviewCents:
      p?.review_cents == null ? null : Number(p.review_cents),
    paidCents:
      p?.paid_cents == null ? null : Number(p.paid_cents),
    expires: String(p?.review_expires || ''),
    carrierStatus: String(p?.carrier_status || ''),
    issues: source.issues,
  }
}

export async function labelShipmentRequest(
  command: 'info' | 'buy' | 'generate' | 'print',
  id: string,
  contact: string,
  pendingCart = false
): Promise<unknown> {
  const token = process.env.MELHOR_ENVIO_TOKEN?.trim()

  if (
    !['info', 'buy', 'generate', 'print'].includes(command) ||
    !saleUuid(id) ||
    !token ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)
  ) {
    throw new Error('PURCHASE_CONFIG')
  }

  const paths = {
    info: pendingCart ? '/cart/' + id : '/orders/' + id,
    buy: '/shipment/checkout',
    generate: '/shipment/generate',
    print: '/shipment/print',
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 18000)

  try {
    const request = (path: string) => fetch(
      'https://www.melhorenvio.com.br/api/v2/me' + path,
      {
        method: command === 'info' ? 'GET' : 'POST',
        headers: {
          Authorization:
            'Bearer ' + token.replace(/^Bearer\s+/i, ''),
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': `Lunarity Site (${contact})`,
        },
        body: command === 'info'
          ? undefined
          : JSON.stringify({
              orders: [id],
              ...(command === 'print' ? { mode: 'private' } : {}),
            }),
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      }
    )

    const findListed = async (path: '/cart' | '/orders'): Promise<unknown | null> => {
      for (let page = 1; page <= 5; page++) {
        const listed = await request(`${path}?page=${page}&per_page=100`)
        if (listed.status === 404) return null
        if (!listed.ok) throw new Error('PURCHASE_PROVIDER_' + listed.status)
        const payload: unknown = await listed.json()
        const envelope = row(payload)
        const entries: unknown = Array.isArray(payload) ? payload : envelope.data
        if (!Array.isArray(entries) || entries.length > 1000) throw new Error('PURCHASE_LOOKUP_INVALID')
        const matches = entries.filter(entry => String(row(entry).id || '').toLowerCase() === id.toLowerCase())
        if (matches.length > 1) throw new Error('PURCHASE_LOOKUP_INVALID')
        if (matches.length === 1) return matches[0]
        const meta = row(envelope.meta)
        const last = Number(meta.last_page ?? envelope.last_page ?? 0)
        const total = Number(meta.total ?? envelope.total ?? 0)
        if (envelope.next_page_url || row(envelope.links).next || last > page || total > page * 100) continue
        if (last > 0 || entries.length < 100) return null
      }
      throw new Error('PURCHASE_LOOKUP_INCOMPLETE')
    }

    let response = await request(paths[command])
    // A preparation is in the cart before payment. It may have left the cart
    // after an external purchase; read orders before allowing any buy.
    if (command === 'info' && pendingCart && response.status === 404) {
      const found = await findListed('/cart')
      if (found) return found
      response = await request('/orders/' + id)
    }
    if (command === 'info' && response.status === 404) {
      const found = await findListed('/orders')
      if (found) return found
    }
    if (!response.ok) throw new Error('PURCHASE_PROVIDER_' + response.status)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

export function inspectShipment(
  input: unknown,
  jobInput: unknown
) {
  const job = row(jobInput)

  const binding = row(job.context).external_binding
  const value = binding
    ? verifyLegacyBinding(input, String(job.remote_id), binding)
    : verifyRemote(input, String(job.remote_id), String(job.operation))

  const expected = String(
    row(row(job.selected).provider).id ||
    row(job.context).checkoutServiceId ||
    ''
  )

  const service =
    value.service_id ??
    row(value.service).id ??
    (
      typeof value.service === 'number' ||
      typeof value.service === 'string'
        ? value.service
        : ''
    )

  if (!expected || String(service) !== expected) {
    throw new Error('PURCHASE_SERVICE')
  }

  const status = String(value.status || '').toLowerCase()

  const blocked =
    ['canceled', 'cancelled', 'expired'].includes(status) ||
    Boolean(
      value.canceled_at ||
      value.cancelled_at ||
      value.expired_at
    )

  const validDate = (v: unknown) =>
    typeof v === 'string' && Number.isFinite(Date.parse(v))

  const paid = !blocked && (
    validDate(value.paid_at) ||
    [
      'released', 'generated', 'received', 'posted',
      'delivered', 'undelivered', 'suspended', 'paused',
    ].includes(status)
  )

  const generated = paid && (
    validDate(value.generated_at) ||
    [
      'generated', 'received', 'posted', 'delivered',
      'undelivered', 'suspended', 'paused',
    ].includes(status)
  )

  if (!blocked && !paid && status !== 'pending') {
    throw new Error('PURCHASE_REMOTE_STATE')
  }

  const price = remotePrice(input)

  return {
    status,
    blocked,
    paid,
    generated,
    cents: price === null ? null : Math.round(price * 100),
  }
}

export async function observeShipment(
  db: SupabaseClient,
  id: string,
  actor: string,
  contact: string
) {
  const source = await purchaseSource(db, id)

  if (
    source.job.state !== 'prepared' ||
    !saleUuid(source.job.remote_id)
  ) {
    throw new Error('PURCHASE_LINK')
  }

  const purchase=source.purchase
  const pendingCart=!source.issues.length && !row(source.job.context).external_binding && (
    !purchase || (['empty','review'].includes(String(purchase.phase)) && purchase.paid_cents == null && !purchase.paid_observed_at && !purchase.generated_observed_at)
  )

  const response = await labelShipmentRequest(
    'info',
    source.job.remote_id,
    contact,
    pendingCart
  )

  const remote = inspectShipment(response, source.job)

  const { error } = await db.rpc(
    'serenity_label_purchase_observe',
    {
      p_order: id,
      p_operation: source.job.operation,
      p_remote: source.job.remote_id,
      p_status: remote.status,
      p_paid: remote.paid,
      p_generated: remote.generated,
      p_blocked: remote.blocked,
      p_cents: remote.cents,
      p_actor: actor,
    }
  )

  if (error) throw error

  return { ...source, remote }
}

export function privatePrintUrl(input: unknown): string {
  const value = remoteCart(input)
  const raw = value.url

  if (typeof raw !== 'string' || raw.length > 4000) {
    throw new Error('PURCHASE_PRINT')
  }

  const url = new URL(raw)

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !(
      url.hostname === 'melhorenvio.com.br' ||
      url.hostname.endsWith('.melhorenvio.com.br')
    )
  ) {
    throw new Error('PURCHASE_PRINT')
  }

  return url.href
}

export function purchaseError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : ''

  const messages: Record<string, string> = {
    LEGACY_LABEL_RECIPIENT:
      'Os dados do destinatário no Melhor Envio estão diferentes do vínculo salvo. Confira o envio antes de continuar.',
    PURCHASE_LOOKUP_INVALID:
      'A listagem do Melhor Envio retornou um formato inesperado. Nenhuma compra foi realizada.',
    PURCHASE_LOOKUP_INCOMPLETE:
      'A consulta não conseguiu conferir todos os envios. Nenhuma nova etiqueta foi comprada; confira a conta do Melhor Envio.',
    PURCHASE_QUERY:
      'Não foi possível ler o pedido ou os registros da etiqueta no banco.',
    PURCHASE_CONFIG:
      'Confira o token do Melhor Envio e o e-mail do administrador.',
    PURCHASE_ORDER:
      'O pedido precisa estar pago e com o frete confirmado.',
    PURCHASE_LINK:
      'Confira o vínculo do envio com este pedido.',
    PURCHASE_STALE:
      'A conferência expirou ou o pedido mudou. Atualize a situação e confira o custo novamente.',
    PURCHASE_LOCKED:
      'Já existe uma operação em andamento ou uma compra registrada. Atualize a situação antes de continuar.',
    PURCHASE_SERVICE:
      'O serviço no Melhor Envio está diferente do vinculado ao pedido. Confira o envio na sua conta.',
    PURCHASE_REMOTE_STATE:
      'A situação retornada pelo Melhor Envio precisa de conferência na sua conta.',
    PURCHASE_PRINT:
      'Não foi possível disponibilizar o link privado. Confira a etiqueta no Melhor Envio.',
  }

  const http = /^PURCHASE_PROVIDER_([1-5][0-9]{2})$/.exec(code)
  if (http) {
    const status = http[1]
    const reason = ['401','403'].includes(status) ? 'O Melhor Envio recusou o acesso. Confira as permissões e a validade do token.'
      : status === '404' ? 'O envio vinculado não foi encontrado no Melhor Envio. Confira o ID e a conta vinculada antes de comprar.'
      : status === '429' ? 'O Melhor Envio limitou as consultas. Aguarde antes de atualizar a situação.'
      : 'O Melhor Envio não confirmou a operação. Confira a situação antes de repetir uma compra.'
    return reason + ' Referência: ETIQUETA-ME-' + status + '.'
  }
  if (messages[code]) return messages[code]
  const databaseCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  const reference = /^(?:[0-9][A-Z0-9]{4}|PGRST[0-9]{3})$/.test(databaseCode) ? 'BANCO-' + databaseCode
    : /^PURCHASE_[A-Z_]{1,50}$/.test(code) ? code
    : ['TimeoutError','AbortError'].includes(error && typeof error === 'object' && 'name' in error ? String(error.name) : '') ? 'TEMPO-ESGOTADO'
    : 'OPERACAO'
  return 'Não foi possível confirmar a operação. Não repita a compra antes de conferir a situação. Referência: ETIQUETA-' + reference + '.'
}
