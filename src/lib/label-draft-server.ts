import 'server-only'
import { shippingPhone } from './shipping-phone'
import { recoveredLegacyFields } from './legacy-contacts'
import { orderItemOptions } from '@/lib/order-item-options'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  LabelFields,
  LabelData,
  SenderData,
} from '@/lib/label-draft'
import { partyIssues } from '@/lib/label-draft'
import {
  PACKAGE_FIELDS,
  packageFieldError,
  invoiceKeyError,
} from '@/lib/label-preparation-validation'

type Row = Record<string, unknown>

const row = (input: unknown): Row =>
  input && typeof input === 'object' && !Array.isArray(input)
    ? input as Row
    : {}

function textFields(input: unknown): LabelFields {
  return Object.fromEntries(
    Object.entries(row(input)).filter(
      ([, value]) => typeof value === 'string'
    )
  ) as LabelFields
}

export async function loadLabelSender(
  db: SupabaseClient,
  origin: string
): Promise<SenderData> {
  const { data, error } = await db
    .from('serenity_label_sender')
    .select('fields,version')
    .eq('singleton', true)
    .single()

  if (error) throw new Error('LABEL_QUERY')

  const fields = textFields(data.fields)

  return {
    fields: {
      ...fields,
      cep: fields.cep ?? origin,
    },
    version: Number(data.version),
  }
}

export async function loadLabelPreparation(
  db: SupabaseClient,
  input: unknown
): Promise<LabelData> {
  const order = row(input)
  const id = String(order.id)

  const [senderResult, draftResult, configResult] =
    await Promise.all([
      db
        .from('serenity_label_sender')
        .select('fields,version')
        .eq('singleton', true)
        .single(),

      db
        .from('serenity_label_drafts')
        .select('*')
        .eq('order_id', id)
        .maybeSingle(),

      db
        .from('serenity_shipping_settings')
        .select('origin,height,width,length,weight_g')
        .eq('singleton', true)
        .single(),
    ])

  if (
    senderResult.error ||
    draftResult.error ||
    configResult.error
  ) {
    throw new Error('LABEL_QUERY')
  }

  const sender = textFields(senderResult.data.fields)
  const draft = draftResult.data
  const customer = row(order.customer_snapshot)
  const address = row(order.delivery_address)
  const shipping = row(order.shipping_details)
  const volume = Object.keys(row(shipping.volume)).length ? row(shipping.volume) : order.source === 'legacy' ? { height: configResult.data.height, width: configResult.data.width, length: configResult.data.length, weight: Number(configResult.data.weight_g) / 1000 } : {}
  const provider = row(shipping.provider)

  let recoveredDocument = ''
  let documentNotice = ''
  if (order.source === 'legacy' && order.legacy_id) {
    const recovered = await db.from('serenity_legacy_documents_v1').select('document,state,reason,recipient_key').eq('order_id', order.legacy_id).maybeSingle()
    const recipientKey = String(textFields(draft?.fields).name || customer.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (!recovered.error && recovered.data?.state === 'ready' && typeof recovered.data.document === 'string' && recovered.data.recipient_key === recipientKey) {
      recoveredDocument = recovered.data.document
      documentNotice = 'Documento recuperado do pedido antigo. Confira o destinatário, salve o rascunho e consulte o frete novamente.'
    } else if (!recovered.error && (recovered.data?.state === 'review' || recovered.data?.state === 'ready')) {
      documentNotice = 'O documento do cadastro antigo tem divergências. Confirme o CPF/CNPJ do destinatário antes de emitir uma etiqueta nova.'
    }
  }

  const defaults: LabelFields = {
    name: String(customer.name || ''),
    email: String(customer.email || ''),
    phone: shippingPhone(String(customer.phone || '')),
    document: String(customer.document || recoveredDocument || ''),
    state_register: '',
    cep: String(address.cep || ''),
    street: String(address.street || ''),
    number: String(address.number || ''),
    complement: String(address.complement || ''),
    district: String(address.district || ''),
    city: String(address.city || ''),
    state: String(address.state || ''),
    height:
      volume.height == null
        ? ''
        : String(volume.height),
    width:
      volume.width == null
        ? ''
        : String(volume.width),
    length:
      volume.length == null
        ? ''
        : String(volume.length),
    weight_g:
      volume.weight == null
        ? ''
        : String(
            Math.round(Number(volume.weight) * 1000)
          ),
    document_mode: 'pending',
    invoice_key: '',
    notes: '',
  }

  const fields = {
    ...defaults,
    ...textFields(draft?.fields),
  }

  const normalizeField = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const sameRecipient = normalizeField(fields.name || '') === normalizeField(defaults.name || '')
  const sameAddress = ['cep','street','city','state'].every(key => !fields[key]?.trim() || normalizeField(fields[key]) === normalizeField(defaults[key] || ''))
  fields.phone = shippingPhone(fields.phone || '')
  if (!fields.phone && order.source === 'legacy' && sameRecipient) fields.phone = defaults.phone
  // Um rascunho vazio não deve esconder campos já disponíveis do mesmo endereço.
  // Não restaura complemento nem mistura número/bairro de um endereço diferente.
  if (order.source === 'legacy' && sameRecipient && sameAddress) for (const key of ['cep','street','number','district','city','state']) {
    if (!fields[key]?.trim() && defaults[key]) fields[key] = defaults[key]
  }

  if (order.source === 'legacy' && order.legacy_id) {
    const contacts = await db.from('serenity_legacy_contacts_v1').select('billing,shipping').eq('order_id', order.legacy_id).maybeSingle()
    if (!contacts.error && contacts.data) Object.assign(fields, recoveredLegacyFields(fields, contacts.data))
  }

  if (!fields.document.trim()) {
    fields.document = defaults.document
  }

  const issues = [
    ...partyIssues(sender, 'Remetente'),
    ...partyIssues(fields, 'Destinatário', true),
  ]

  if (
    (sender.cep || '').replace(/\D/g, '') !==
    configResult.data.origin
  ) {
    issues.push(
      'O CEP do remetente deve coincidir com a origem configurada na aba Frete.'
    )
  }

  if (order.status !== 'paid') {
    issues.push(
      'O pedido precisa estar pago antes da compra da etiqueta.'
    )
  }

  if (
    order.shipping_pending ||
    shipping.manual ||
    (!provider.id && order.source !== 'legacy')
  ) {
    issues.push(
      'O frete deste pedido ainda precisa ser confirmado com uma transportadora e um serviço.'
    )
  }

  if (
    shipping.destination &&
    (fields.cep || '').replace(/\D/g, '') !==
      String(shipping.destination)
  ) {
    issues.push(
      'O CEP do destinatário está diferente do cotado. Será necessário conferir o frete para o novo destino.'
    )
  }

  const packageIssues = PACKAGE_FIELDS.flatMap(
    ([name, label]) => {
      const error = packageFieldError(
        name,
        fields[name] || ''
      )

      return error
        ? [`Pacote — ${label}: ${error}`]
        : []
    }
  )

  if (packageIssues.length) {
    issues.push(...packageIssues)
  } else if (
    volume.height != null &&
    (
      Number(fields.height.replace(',', '.')) !==
        Number(volume.height) ||
      Number(fields.width.replace(',', '.')) !==
        Number(volume.width) ||
      Number(fields.length.replace(',', '.')) !==
        Number(volume.length) ||
      Number(fields.weight_g.replace(',', '.')) !==
        Math.round(Number(volume.weight) * 1000)
    )
  ) {
    issues.push(
      'O pacote foi alterado em relação à cotação. Será necessário conferir o frete antes de contratar a etiqueta.'
    )
  }

  if (fields.document_mode === 'invoice') {
    const keyError = invoiceKeyError(
      fields.document_mode,
      fields.invoice_key || ''
    )

    if (keyError) {
      issues.push(keyError)
    }

    if (!sender.state_register) {
      issues.push(
        'Confira e preencha a inscrição estadual / situação do remetente para o envio com NF-e.'
      )
    }
  }

  if (
    draft &&
    (
      String(draft.order_version) !==
        String(order.updated_at) ||
      Number(draft.sender_version) !==
        Number(senderResult.data.version)
    )
  ) {
    issues.push(
      'O pedido ou remetente mudou após este rascunho. Confira os dados e salve novamente.'
    )
  }

  if (
    order.status === 'cancelled' ||
    order.status === 'refunded'
  ) {
    issues.push(
      'Este pedido não está disponível para preparação de envio.'
    )
  }

  const products = (
    Array.isArray(order.items) ? order.items : []
  ).map(item => {
    const product = row(item)

    return {
      name: [
        product.name,
        ...orderItemOptions(product),
      ].filter(Boolean).join(' · '),
      quantity: Number(product.quantity),
      value: Number(product.unit_price),
    }
  })

  return {
    id,
    version: Number(draft?.version || 0),
    orderVersion: String(order.updated_at),
    senderVersion: Number(senderResult.data.version),
    documentNotice,
    fields,
    issues,
    company: String(
      shipping.company || 'A confirmar'
    ),
    service: String(
      shipping.service || 'A confirmar'
    ),
    status: String(order.status),
    products,
  }
}
