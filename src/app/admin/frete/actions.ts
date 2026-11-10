'use server'

import { requireAdmin } from '@/lib/admin-auth'
import { melhorEnvio, readQuotes, shippingMessage } from '@/lib/melhor-envio'
import { testPackage } from '@/lib/shipping-test'
import type { ShippingTestResult } from '@/lib/shipping-test'
import { deliveryEstimateDays } from '@/lib/shipping'

export async function testShipping(
  kind: 'connection' | 'quote',
  data: FormData
): Promise<ShippingTestResult> {
  const user = await requireAdmin()

  if (kind !== 'connection' && kind !== 'quote') {
    return { ok: false, message: 'Operação inválida.' }
  }

  try {
    if (kind === 'connection') {
      const rows = await melhorEnvio('companies', user.email || '')
      return {
        ok: true,
        message: `Conexão confirmada. ${rows.length} transportadoras retornadas pelo Melhor Envio.`,
      }
    }

    const payload = testPackage(data)
    const quotes = readQuotes(
      await melhorEnvio('calculate', user.email || '', payload)
    ).map(quote => ({ ...quote, days: deliveryEstimateDays(quote.days) }))

    return {
      ok: true,
      quotes,
      message: quotes.length
        ? `${quotes.length} opções de frete disponíveis para esta simulação.`
        : 'Nenhum serviço disponível para esses CEPs e essa embalagem. Confira os dados ou tente outro destino.',
    }
  } catch (error) {
    return { ok: false, message: shippingMessage(error) }
  }
}
