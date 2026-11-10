'use server'

import { revalidatePath } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { saleUuid } from '@/lib/admin-sales'

import {
  normalizeCouponCode,
  parseCouponAmount,
  parseCouponLimit,
  couponDateToIso,
} from '@/lib/coupon-ui'

import type { CouponProduct } from '@/lib/coupon-ui'

export async function searchCouponProducts(
  search: string
): Promise<{
  error: string
  products: CouponProduct[]
}> {
  const { db } = await adminDatabase()

  if (typeof search !== 'string') {
    return {
      error: 'Informe o nome ou SKU.',
      products: [],
    }
  }

  const safe = search
    .slice(0, 100)
    .replace(/[^a-zA-Z0-9À-ÿ .-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (safe.length < 2) {
    return {
      error: 'Digite ao menos duas letras ou números.',
      products: [],
    }
  }

  try {
    const result = await db
      .from('products')
      .select('id,name,sku')
      .or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`)
      .order('name')
      .order('id')
      .limit(20)

    if (result.error) {
      return {
        error: 'Não foi possível buscar os produtos.',
        products: [],
      }
    }

    const products = (result.data || []).map(row => ({
      id: String(row.id),
      name: String(row.name || 'Sem nome'),
      sku: String(row.sku || ''),
    }))

    return {
      error: products.length
        ? ''
        : 'Nenhum produto encontrado.',
      products,
    }
  } catch {
    return {
      error: 'Não foi possível buscar os produtos.',
      products: [],
    }
  }
}

export async function saveCoupon(
  form: FormData
): Promise<{
  error: string
  id?: string
}> {
  const { db, user } = await adminDatabase()
  let validating = true

  try {
    const read = (
      key: string,
      label: string,
      max: number
    ) => {
      const value = form.get(key)

      if (typeof value !== 'string') {
        throw new Error(`Confira o campo ${label}.`)
      }

      const text = value.trim()

      if (
        text.length > max ||
        /[\u0000-\u001F\u007F]/.test(text)
      ) {
        throw new Error(`Confira o campo ${label}.`)
      }

      return text
    }

    const id = read('id', 'Identificação', 36)
    const versionText = read('version', 'Versão', 20)
    const version = Number(versionText)

    const name = read('name', 'Nome', 180)

    const code = normalizeCouponCode(
      read('code', 'Código', 40)
    )

    const status = read('status', 'Situação', 20)

    const discountType = read(
      'discount_type',
      'Tipo de desconto',
      20
    )

    const scope = read(
      'scope',
      'Produtos participantes',
      20
    )

    if (
      !saleUuid(id) ||
      !/^\d+$/.test(versionText) ||
      !Number.isSafeInteger(version) ||
      version < 0
    ) {
      throw new Error(
        'Reabra o cupom pela lista para salvar.'
      )
    }

    if (!name) {
      throw new Error('Preencha o nome do cupom.')
    }

    if (
      !['draft', 'active', 'disabled'].includes(status)
    ) {
      throw new Error('Selecione uma situação válida.')
    }

    if (
      !['percent', 'fixed'].includes(discountType)
    ) {
      throw new Error(
        'Selecione porcentagem ou valor fixo.'
      )
    }

    if (!['all', 'products'].includes(scope)) {
      throw new Error(
        'Confira os produtos participantes.'
      )
    }

    const discountValue = parseCouponAmount(
      read('discount_value', 'Desconto', 40),
      'Desconto'
    )

    if (
      discountType === 'percent' &&
      discountValue > 100
    ) {
      throw new Error(
        'A porcentagem não pode ultrapassar 100%.'
      )
    }

    const minimumSubtotal = parseCouponAmount(
      read(
        'minimum_subtotal',
        'Compra mínima',
        40
      ) || '0',
      'Compra mínima',
      true
    )

    const startsAt = couponDateToIso(
      read('starts_date', 'Data de início', 10),
      read('starts_time', 'Horário de início', 5),
      'Início'
    )

    const endsAt = couponDateToIso(
      read('ends_date', 'Data de término', 10),
      read('ends_time', 'Horário de término', 5),
      'Término'
    )

    if (
      startsAt &&
      endsAt &&
      Date.parse(startsAt) >= Date.parse(endsAt)
    ) {
      throw new Error(
        'O término precisa ser posterior ao início.'
      )
    }

    const maxUses = parseCouponLimit(
      read('max_uses', 'Limite total de usos', 12),
      'Limite total de usos'
    )

    const maxUsesPerCustomer = parseCouponLimit(
      read(
        'max_uses_per_customer',
        'Limite por cliente',
        12
      ),
      'Limite por cliente'
    )

    let products: string[] = []

    if (scope === 'products') {
      const rawProducts = form.get('products')

      if (
        typeof rawProducts !== 'string' ||
        rawProducts.length > 25000
      ) {
        throw new Error(
          'Confira os produtos participantes.'
        )
      }

      let parsed: unknown

      try {
        parsed = JSON.parse(rawProducts)
      } catch {
        throw new Error(
          'Confira os produtos participantes.'
        )
      }

      if (
        !Array.isArray(parsed) ||
        parsed.length < 1 ||
        parsed.length > 500 ||
        parsed.some(value => !saleUuid(value))
      ) {
        throw new Error(
          'Selecione de 1 a 500 produtos participantes.'
        )
      }

      products = Array.from(
        new Set(parsed as string[])
      )
    }

    validating = false

    const { data, error } = await db.rpc(
      'serenity_admin_save_coupon',
      {
        p_id: id,
        p_admin: user.id,
        p_version: version,

        p_payload: {
          name,
          code,
          status,
          discount_type: discountType,
          discount_value: discountValue,
          scope,
          minimum_subtotal: minimumSubtotal,
          starts_at: startsAt,
          ends_at: endsAt,
          max_uses: maxUses,
          max_uses_per_customer: maxUsesPerCustomer,
          products,
        },
      }
    )

    if (error) {
      const messages: Record<string, string> = {
        COUPON_INVALID:
          'Confira os dados do cupom.',

        COUPON_TOO_MANY_PRODUCTS:
          'O limite é de 500 produtos por cupom.',

        COUPON_EXPIRED:
          'O término já passou. Altere a data ou salve como desativado.',

        COUPON_NO_PRODUCTS:
          'Selecione ao menos um produto participante.',

        COUPON_PRODUCT_NOT_FOUND:
          'Um produto não foi encontrado. Atualize a seleção.',

        COUPON_STALE:
          'O cupom mudou em outra operação. Reabra pela lista.',

        COUPON_CODE_LOCKED:
          'Esse cupom já tem registros de uso. Seu código não pode ser alterado.',

        COUPON_CODE_EXISTS:
          'Já existe um cupom com esse código.',

        COUPON_LIMIT_BELOW_USAGE:
          'O limite não pode ser menor que os usos e reservas atuais.',
      }

      return {
        error: Object.prototype.hasOwnProperty.call(
          messages,
          error.message
        )
          ? messages[error.message]
          : 'Não foi possível salvar. Confira a lista antes de repetir.',
      }
    }

    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      data.id !== id ||
      !Number.isSafeInteger(data.version) ||
      data.version < 1 ||
      data.status !== status
    ) {
      return {
        error:
          'Não foi possível confirmar o salvamento. Confira a lista antes de repetir.',
      }
    }

    revalidatePath('/admin/cupons')
    revalidatePath('/checkout')

    return {
      error: '',
      id,
    }
  } catch (error) {
    return {
      error:
        validating && error instanceof Error
          ? error.message
          : 'Não foi possível confirmar o salvamento. Confira a lista antes de tentar novamente.',
    }
  }
}
