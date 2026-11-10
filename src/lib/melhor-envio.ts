import 'server-only'
import type { ShippingQuote } from '@/lib/shipping-test'

type ObjectRow = Record<string, unknown>

const object = (value: unknown): ObjectRow =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as ObjectRow
    : {}

export async function melhorEnvio(
  path: 'companies' | 'calculate',
  contact: string,
  payload?: unknown
): Promise<unknown[]> {
  const token = process.env.MELHOR_ENVIO_TOKEN?.trim()

  if (!token) throw new Error('ME_CONFIGURATION')

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ||
    /[\r\n]/.test(contact)
  ) {
    throw new Error('ME_CONTACT')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 18000)

  try {
    const response = await fetch(
      'https://www.melhorenvio.com.br/api/v2/me/shipment/' + path,
      {
        method: path === 'calculate' ? 'POST' : 'GET',
        headers: {
          Authorization: 'Bearer ' + token.replace(/^Bearer\s+/i, ''),
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': `Lunarity Site (${contact})`,
        },
        body: path === 'calculate'
          ? JSON.stringify(payload)
          : undefined,
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      }
    )

    if (response.status === 401) throw new Error('ME_TOKEN')
    if (response.status === 403) throw new Error('ME_PERMISSION')
    if (response.status === 422) throw new Error('ME_PACKAGE')
    if (response.status === 429) throw new Error('ME_LIMIT')
    if (!response.ok) throw new Error('ME_UNAVAILABLE')

    const result: unknown = await response.json()

    if (!Array.isArray(result)) throw new Error('ME_RESPONSE')

    return result
  } finally {
    clearTimeout(timer)
  }
}

export function readQuotes(rows: unknown[]): ShippingQuote[] {
  function amount(value: unknown): number | null {
    if (
      typeof value !== 'number' &&
      (
        typeof value !== 'string' ||
        !/^\d+(?:\.\d+)?$/.test(value)
      )
    ) {
      return null
    }

    const number = Number(value)

    return Number.isFinite(number) && number >= 0
      ? number
      : null
  }

  const result: ShippingQuote[] = []

  for (const value of rows) {
    const row = object(value)

    if (row.error) continue

    const price = amount(row.custom_price ?? row.price)

    if (
      price === null ||
      row.id === undefined ||
      typeof row.name !== 'string'
    ) {
      continue
    }

    const days = amount(
      row.custom_delivery_time ?? row.delivery_time
    )

    const company = object(row.company)

    result.push({
      id: String(row.id).slice(0, 80),
      service: row.name.slice(0, 120),
      company: typeof company.name === 'string'
        ? company.name.slice(0, 120)
        : 'Transportadora',
      price,
      days: days !== null && Number.isInteger(days)
        ? days
        : null,
    })
  }

  return result.sort((a, b) => a.price - b.price)
}

export function shippingMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ''

  const messages: Record<string, string> = {
    ME_CONFIGURATION: 'A variável MELHOR_ENVIO_TOKEN não está disponível neste ambiente. Salve na Vercel e faça um novo deploy.',
    ME_CONTACT: 'Confira o e-mail da sua conta de administrador para identificar a integração.',
    ME_TOKEN: 'O Melhor Envio recusou o token. Confira se foi copiado inteiro e se continua válido.',
    ME_PERMISSION: 'O token não tem a permissão necessária para esta consulta.',
    ME_PACKAGE: 'O Melhor Envio recusou os dados. Confira os CEPs, as medidas, o peso e o valor declarado.',
    ME_LIMIT: 'Limite de consultas atingido. Aguarde um pouco e tente novamente.',
    INPUT_CEP: 'Preencha os dois CEPs com oito números, com ou sem hífen.',
    INPUT_NUMBER: 'Confira os campos numéricos: peso em gramas inteiras; medidas com até duas casas; valor sem separador de milhar.',
  }

  return messages[code] ||
    'Não foi possível consultar o Melhor Envio agora. Tente novamente em alguns instantes.'
}
