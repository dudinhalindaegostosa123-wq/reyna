
import 'server-only'
import { declaredProducts } from './label-declared-values'
import { shippingPhone } from './shipping-phone'
import { labelProviderFailure, labelProviderMessage } from '@/lib/label-provider-errors'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LabelFields } from '@/lib/label-draft'
import type { LabelJobView } from '@/lib/label-cart'
import { partyIssues } from '@/lib/label-draft'
import { loadLabelPreparation } from '@/lib/label-draft-server'
import { melhorEnvio, readQuotes } from '@/lib/melhor-envio'
import { saleUuid } from '@/lib/admin-sales'

type Row = Record<string, unknown>

const row = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Row)
    : {}

const digits = (value: unknown) =>
  String(value || '').replace(/\D/g, '')

function amount(value: unknown): number | null {
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value))
  ) {
    return null
  }

  const number = Number(value)

  return Number.isFinite(number) && number >= 0 && number <= 1000000
    ? number
    : null
}

function metric(
  value: unknown,
  max = 1000,
  decimals = 2
): number {
  const raw = String(value ?? '').trim()

  if (
    !new RegExp(
      '^\\d+(?:[.,]\\d{1,' + decimals + '})?$'
    ).test(raw)
  ) {
    throw new Error(
      'Confira o pacote no rascunho e salve antes de cotar.'
    )
  }

  const number = Number(raw.replace(',', '.'))

  if (
    !Number.isFinite(number) ||
    number <= 0 ||
    number > max
  ) {
    throw new Error(
      'Confira o peso e as dimensões do pacote.'
    )
  }

  return number
}

export function checkoutServiceId(orderInput: unknown): string {
  const order = row(orderInput)
  const details = row(order.shipping_details)
  if (order.source === 'legacy' && details.manual === false) return 'legacy-choice'
  const id = String(row(details.provider).id ?? '').trim()

  return (
    details.manual === false &&
    /^[1-9]\d*$/.test(id) &&
    Number.isSafeInteger(Number(id))
  )
    ? String(Number(id))
    : ''
}

export function operationTag(operation: string) {
  return 'serenity-' + operation
}

export async function labelSource(
  db: SupabaseClient,
  id: string
) {
  const [o, s, c, d] = await Promise.all([
    db
      .from('serenity_orders')
      .select('*')
      .eq('id', id)
      .single(),

    db
      .from('serenity_label_sender')
      .select('*')
      .eq('singleton', true)
      .single(),

    db
      .from('serenity_shipping_settings')
      .select('*')
      .eq('singleton', true)
      .single(),

    db
      .from('serenity_label_drafts')
      .select('*')
      .eq('order_id', id)
      .maybeSingle(),
  ])

  if (o.error || s.error || c.error || d.error) {
    throw new Error(
      'Não foi possível carregar os dados do envio.'
    )
  }

  const draft = await loadLabelPreparation(db, o.data)
  const sender = row(s.data.fields) as LabelFields

  return {
    order: o.data,
    sender,
    draft,
    draftRecord: d.data,
    config: c.data,
    senderVersion: Number(s.data.version),
    draftVersion: Number(d.data?.version || 0),
  }
}

export async function loadLabelJobView(
  db: SupabaseClient,
  id: string
): Promise<LabelJobView> {
  const source = await labelSource(db, id)

  const { data: job, error } = await db
    .from('serenity_label_jobs')
    .select('*')
    .eq('order_id', id)
    .maybeSingle()

  if (error) throw new Error('LABEL_JOB_QUERY')

  const choices = (
    Array.isArray(job?.quotes) ? job.quotes : []
  ).map((input: unknown) => {
    const quote = row(input)

    return {
      id: String(quote.id),
      company: String(quote.company),
      service: String(quote.service),
      cents: Number(quote.cents),
      days:
        quote.days == null
          ? null
          : Number(quote.days),
    }
  })

  const serviceId = checkoutServiceId(source.order)

  const serviceMatches = Boolean(
    serviceId && job && row(job.context).checkoutServiceId === serviceId && Array.isArray(job.quotes) &&
    (serviceId === 'legacy-choice' || (job.quotes.length === 1 && job.quotes.every(
      (quote: unknown) => String(row(row(quote).provider).id) === serviceId
    )))
  )

  const issues = [
    ...partyIssues(source.sender, 'Remetente'),
    ...partyIssues(source.draft.fields, 'Destinatário', true),
  ]

  if (!serviceId) {
    issues.push(
      'Este pedido não tem um serviço do Melhor Envio identificado no checkout. O frete precisa ser definido antes da preparação.'
    )
  }

  if (
    source.order.status !== 'paid' ||
    source.order.shipping_pending
  ) {
    issues.push(
      'Confirme o pagamento e o frete do pedido antes de preparar no Melhor Envio.'
    )
  }

  if (
    digits(source.sender.cep) !==
    String(source.config.origin)
  ) {
    issues.push(
      'O CEP do remetente precisa coincidir com a origem configurada na aba Frete.'
    )
  }

  // Só valida a NF-e quando esse modo foi selecionado explicitamente.
  if (source.draft.fields.document_mode === 'invoice') {
    if (!/^\d{44}$/.test(source.draft.fields.invoice_key)) {
      issues.push(
        'Informe a chave de acesso da NF-e com 44 números.'
      )
    }

    if (!source.sender.state_register) {
      issues.push(
        'Confira a inscrição estadual / situação do remetente.'
      )
    }
  }

  try { declaredProducts(source.draft.products,source.order) }
  catch (error) { issues.push(error instanceof Error ? error.message : 'Confira os valores dos itens do pedido.') }

  if (
    source.draftRecord &&
    (
      String(source.draftRecord.order_version) !==
        String(source.order.updated_at) ||
      Number(source.draftRecord.sender_version) !==
        source.senderVersion
    )
  ) {
    issues.push(
      'O pedido ou remetente mudou. Confira e salve o rascunho novamente antes de preparar.'
    )
  }

  const stale = Boolean(
    job &&
    (
      String(job.order_version) !==
        String(source.order.updated_at) ||
      Number(job.sender_version) !==
        source.senderVersion ||
      Number(job.draft_version) !==
        source.draftVersion ||
      Number(job.settings_version) !==
        Number(source.config.version) ||
      !serviceMatches ||
      (Number(source.order.discount) > 0 && row(job.context).declaredValuesVersion !== 1) ||
      (source.order.source === 'legacy' && ['name','email','phone','cep','street','number','district','city','state'].some(field => String(row(row(job.context).recipient)[field] || '') !== String(source.draft.fields[field] || ''))) ||
      String(row(row(job.context).recipient).document || '').replace(/[^a-z0-9]/gi, '').toUpperCase() !== String(source.draft.fields.document || '').replace(/[^a-z0-9]/gi, '').toUpperCase()
    )
  )

  return {
    orderId: id,
    operation: String(job?.operation || ''),
    state: String(job?.state || 'empty'),
    expires: String(job?.quote_expires || ''),
    stale,
    charged: Number(source.order.shipping || 0),
    choices,
    issues,
    remoteId: String(job?.remote_id || ''),
    remotePrice:
      job?.remote_price == null
        ? null
        : Number(job.remote_price),
    agency: String(row(job?.context).agency || ''),
    cnae: String(row(job?.context).cnae || ''),
    lastError: job?.state === 'rejected' && typeof row(job?.context).lastProviderError === 'string' ? String(row(job.context).lastProviderError).slice(0, 1800) : '',
  }
}

export async function rememberLabelRejection(db: SupabaseClient, id: string, operation: string, context: unknown, message: string) {
  // A operação e o estado impedem sobrescrever uma cotação posterior ou um envio preparado.
  return await db.from('serenity_label_jobs')
    .update({ context: { ...row(context), lastProviderError: message.slice(0, 1800) } })
    .eq('order_id', id).eq('operation', operation).eq('state', 'rejected')
}

export async function quoteLabel(
  db: SupabaseClient,
  id: string,
  actor: string,
  contact: string,
  extras: {
    agency: string
    cnae: string
  }
) {
  const source = await labelSource(db, id)
  const fields = source.draft.fields

  if (!['pending', 'paid'].includes(source.order.status)) {
    throw new Error(
      'Este pedido não está disponível para envio.'
    )
  }

  const { data: current, error: jobError } = await db
    .from('serenity_label_jobs')
    .select('state')
    .eq('order_id', id)
    .maybeSingle()

  if (jobError) throw jobError

  if (
    current &&
    ['creating', 'prepared', 'uncertain'].includes(current.state)
  ) {
    throw new Error('LABEL_JOB_LOCKED')
  }

  const serviceId = checkoutServiceId(source.order)

  if (!serviceId) {
    throw new Error(
      'Este pedido não tem um serviço do Melhor Envio identificado no checkout. Confira o frete antes de preparar.'
    )
  }

  const cep = digits(fields.cep)

  if (!/^\d{8}$/.test(cep)) {
    throw new Error(
      'Preencha o CEP do destinatário no rascunho e salve.'
    )
  }

  const products = declaredProducts(source.draft.products,source.order).map((product) => ({
    name: product.name.slice(0, 180),
    quantity: product.quantity,
    unitary_value: product.value,
  }))

  if (
    !products.length ||
    products.some(
      (product) =>
        !product.name ||
        !Number.isInteger(product.quantity) ||
        product.quantity < 1 ||
        !Number.isFinite(product.unitary_value) ||
        product.unitary_value < 0
    )
  ) {
    throw new Error('Confira os itens do pedido.')
  }

  const insurance =
    Math.round(
      products.reduce(
        (sum, product) =>
          sum + product.quantity * product.unitary_value,
        0
      ) * 100
    ) / 100

  const volume = {
    height: metric(fields.height),
    width: metric(fields.width),
    length: metric(fields.length),
    weight: metric(fields.weight_g, 1000000) / 1000,
  }

  const raw = await melhorEnvio('calculate', contact, {
    from: {
      postal_code: source.config.origin,
    },
    to: {
      postal_code: cep,
    },
    volumes: [
      {
        ...volume,
        insurance,
      },
    ],
    options: {
      receipt: false,
      own_hand: false,
    },
  })

  const quotes = readQuotes(raw)
    .filter((quote) => serviceId === 'legacy-choice' || quote.id === serviceId)
    .slice(0, serviceId === 'legacy-choice' ? 50 : 1)
    .map((quote) => ({
      id: randomUUID(),
      company: quote.company,
      service: quote.service,
      cents: Math.round(quote.price * 100),
      days: quote.days,
      provider: raw.find(
        (value) => String(row(value).id) === quote.id
      ),
    }))
    .filter((quote) => quote.cents <= 100000000)

  if (!quotes.length) {
    throw new Error(
      'O serviço escolhido no checkout não está disponível para este CEP e pacote agora. Revise o envio; nenhuma transportadora foi substituída.'
    )
  }

  const context = {
    declaredValuesVersion: 1,
    checkoutServiceId: serviceId,
    sender: source.sender,
    recipient: fields,
    products,
    volume,
    insurance,
    origin: source.config.origin,
    agency: extras.agency,
    cnae: extras.cnae,
    orderNumber: source.order.number,
  }

  const { error } = await db.rpc('serenity_label_job_quote', {
    p_order: id,
    p_operation: randomUUID(),
    p_order_version: source.order.updated_at,
    p_sender: source.senderVersion,
    p_draft: source.draftVersion,
    p_settings: Number(source.config.version),
    p_context: context,
    p_quotes: quotes,
    p_actor: actor,
  })

  if (error) throw error
}

function party(fields: LabelFields) {
  const document = String(fields.document || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()

  return {
    name: fields.name,
    email: fields.email,
    phone: shippingPhone(fields.phone),
    ...(document ? document.length === 11
      ? { document }
      : { company_document: document } : {}),
    state_register: fields.state_register || '',
    address: fields.street,
    number: fields.number,
    complement: fields.complement || '',
    district: fields.district,
    city: fields.city,
    postal_code: digits(fields.cep),
    state_abbr: fields.state.toUpperCase(),
    country_id: 'BR',
  }
}

export function labelPayload(
  contextInput: unknown,
  choiceInput: unknown,
  operation: string
) {
  const context = row(contextInput)
  const choice = row(choiceInput)
  const provider = row(choice.provider)

  const sender = row(context.sender) as LabelFields
  const recipient = row(context.recipient) as LabelFields

  if (
    partyIssues(sender, 'Remetente').length ||
    partyIssues(recipient, 'Destinatário', true).length
  ) {
    throw new Error(
      'Complete os dados do remetente e destinatário.'
    )
  }

  // A NF-e só é validada quando o modo invoice foi escolhido.
  if (recipient.document_mode === 'invoice') {
    if (
      !/^\d{44}$/.test(recipient.invoice_key) ||
      !sender.state_register
    ) {
      throw new Error(
        'Confira a chave da NF-e e a inscrição estadual do remetente.'
      )
    }
  }

  if (digits(sender.cep) !== String(context.origin)) {
    throw new Error(
      'Confira o CEP do remetente e a origem do frete.'
    )
  }

  const service = Number(provider.id)

  if (
    !Number.isSafeInteger(service) ||
    service <= 0 ||
    (context.checkoutServiceId !== 'legacy-choice' && String(service) !== context.checkoutServiceId)
  ) {
    throw new Error(
      'Serviço inválido. Confira o custo novamente.'
    )
  }

  const packages = provider.packages

  if (!Array.isArray(packages) || packages.length !== 1) {
    throw new Error(
      'A transportadora não retornou um único volume. Este envio precisa de revisão antes de preparar.'
    )
  }

  const pack = row(packages[0])
  const dimensions = row(pack.dimensions)

  const volume = {
    height: metric(dimensions.height ?? pack.height, 1000, 6),
    width: metric(dimensions.width ?? pack.width, 1000, 6),
    length: metric(dimensions.length ?? pack.length, 1000, 6),
    weight: metric(pack.weight, 1000, 6),
  }

  return {
    service,
    from: {
      ...party(sender),
      ...(context.cnae
        ? { economic_activity_code: String(context.cnae) }
        : {}),
    },
    to: party(recipient),
    products: context.products,
    volumes: [volume],
    ...(context.agency
      ? { agency: Number(context.agency) }
      : {}),
    options: {
      platform: 'Lunarity Site',
      reminder: 'Pedido #' + String(context.orderNumber),
      insurance_value: Number(context.insurance),
      receipt: false,
      own_hand: false,
      reverse: false,

      // Só envia a chave da NF-e quando invoice foi selecionado.
      ...(recipient.document_mode === 'invoice'
        ? {
            invoice: {
              key: recipient.invoice_key,
            },
          }
        : {}),

      tags: [
        {
          tag: operationTag(operation),
          url: null,
        },
      ],
    },
  }
}

export async function labelCartRequest(
  method: 'GET' | 'POST',
  contact: string,
  id?: string,
  body?: unknown
): Promise<unknown> {
  const token = process.env.MELHOR_ENVIO_TOKEN?.trim()

  if (
    !token ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)
  ) {
    throw new Error('LABEL_CONFIG')
  }

  if (id && !saleUuid(id)) {
    throw new Error('LABEL_INVALID')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 18000)

  try {
    const response = await fetch(
      'https://www.melhorenvio.com.br/api/v2/me/cart' +
        (id ? '/' + id : ''),
      {
        method,
        headers: {
          Authorization:
            'Bearer ' + token.replace(/^Bearer\s+/i, ''),
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': `Lunarity Site (${contact})`,
        },
        body:
          method === 'POST'
            ? JSON.stringify(body)
            : undefined,
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      }
    )

    if ([400, 401, 403, 422].includes(response.status)) {
      let raw = ''
      try { raw = (await response.text()).slice(0, 20000) } catch { /* O status HTTP já confirma a recusa. */ }
      let details: unknown = raw
      try { details = JSON.parse(raw) } catch { /* Preserva o diagnóstico seguro de respostas em texto. */ }
      const secrets = [token, token.replace(/^Bearer\s+/i, ''), contact]
      const collectSecrets = (value: unknown, depth = 0) => {
        if (depth > 6) return
        if (typeof value === 'string') secrets.push(value)
        else if (value && typeof value === 'object') Object.values(value).forEach(child => collectSecrets(child, depth + 1))
      }
      collectSecrets(body)
      throw new Error(labelProviderFailure(response.status, details, secrets))
    }

    if (!response.ok) {
      throw new Error('LABEL_REMOTE_UNKNOWN')
    }

    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

export function remoteCart(input: unknown) {
  const value = row(input)

  return (
    value.data &&
    typeof value.data === 'object' &&
    !Array.isArray(value.data)
  )
    ? row(value.data)
    : value
}

export function remotePrice(input: unknown) {
  const value = remoteCart(input)
  return amount(value.custom_price ?? value.price)
}

export function verifyRemote(
  input: unknown,
  id: string,
  operation: string
) {
  const value = remoteCart(input)
  const tag = operationTag(operation)

  const tags = Array.isArray(value.tags)
    ? value.tags
    : Array.isArray(row(value.options).tags)
      ? (row(value.options).tags as unknown[])
      : []

  if (
    String(value.id).toLowerCase() !== id.toLowerCase() ||
    !tags.some((item) =>
      typeof item === 'string'
        ? item === tag
        : row(item).tag === tag
    )
  ) {
    throw new Error(
      'O ID não corresponde à preparação deste pedido ou não foi possível confirmar sua identificação.'
    )
  }

  return value
}

export function labelJobError(error: unknown) {
  const text =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : ''

  const providerMessage = labelProviderMessage(text)
  if (providerMessage) return providerMessage

  const messages: Record<string, string> = {
    LABEL_JOB_LOCKED:
      'Já existe uma preparação em andamento ou um envio vinculado. Confira o estado abaixo antes de continuar.',
    LABEL_STALE:
      'Os dados foram alterados. Salve o rascunho, atualize a página e confira o custo novamente.',
    LABEL_QUOTE_EXPIRED:
      'A cotação expirou. Confira o custo novamente.',
    LABEL_PAYMENT:
      'Confirme o pagamento e o frete do pedido antes de preparar.',
    LABEL_REMOTE_REJECTED:
      'O Melhor Envio recusou a preparação [ME-RECUSA], sem detalhe de validação disponível. Confira este envio na conta do Melhor Envio.',
    LABEL_CONFIG:
      'Confira o token do Melhor Envio e o e-mail da sua conta de administrador.',
    LABEL_REMOTE_UNKNOWN:
      'Não foi possível confirmar o resultado. Confira o carrinho do Melhor Envio e recupere o envio pelo ID antes de tentar criar outro.',
  }

  if (messages[text]) return messages[text]

  if (/^ME_/.test(text)) {
    return 'Não foi possível consultar o custo no Melhor Envio. Confira a conexão na aba Frete.'
  }

  if (
    error instanceof Error &&
    !/^[A-Z_]+$/.test(text) &&
    text.length < 240 &&
    !/fetch|abort|network|JSON|token/i.test(text)
  ) {
    return text
  }

  return 'A operação não terminou. Atualize a página para conferir o estado antes de continuar.'
}
