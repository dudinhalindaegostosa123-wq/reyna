'use server'

import { revalidatePath } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { saleUuid } from '@/lib/admin-sales'
import { parseCouponAmount } from '@/lib/coupon-ui'

export interface WholesaleActionResult {
  error: string
  version?: number
  status?: string
}

function readVersion(
  value: FormDataEntryValue | null
): number {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d{0,15}$/.test(value)
  ) {
    throw new Error(
      'Atualize a página antes de salvar.'
    )
  }

  const version = Number(value)

  if (
    !Number.isSafeInteger(version) ||
    version < 1
  ) {
    throw new Error(
      'Atualize a página antes de salvar.'
    )
  }

  return version
}

function databaseError(error: unknown): string {
  const record =
    error && typeof error === 'object'
      ? error as {
          message?: unknown
          code?: unknown
        }
      : {}

  const message =
    typeof record.message === 'string'
      ? record.message
      : ''

  const messages: Record<string, string> = {
    WHOLESALE_INVALID:
      'Confira os dados informados.',

    WHOLESALE_CONFIGURATION:
      'A configuração do atacado não foi encontrada.',

    WHOLESALE_STALE:
      'Os dados mudaram em outra operação. Atualize a página antes de tentar novamente.',

    WHOLESALE_ACCOUNT_NOT_FOUND:
      'O cadastro não foi encontrado. Atualize a lista.',

    WHOLESALE_NOT_REQUESTED:
      'Esse cliente ainda não solicitou acesso ao atacado.',

    WHOLESALE_ACCOUNT_INVALID:
      'Confira o CPF/CNPJ e o vínculo do cadastro antes de aprovar.',

    WHOLESALE_TRANSITION:
      'Apenas um acesso aprovado pode ser suspenso. Atualize a situação do cadastro.',
  }

  if (
    Object.prototype.hasOwnProperty.call(
      messages,
      message
    )
  ) {
    return messages[message]
  }

  const code =
    typeof record.code === 'string' &&
    /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(record.code)
      ? record.code
      : 'INDISPONIVEL'

  return `Não foi possível confirmar a alteração. Atualize a página antes de repetir. Referência: ATACADO-${code}.`
}

function refreshWholesale() {
  revalidatePath('/admin/atacado')
  revalidatePath('/admin/clientes')
  revalidatePath('/minha-conta', 'layout')
  revalidatePath('/checkout')
}

export async function saveWholesaleSettings(
  form: FormData
): Promise<WholesaleActionResult> {
  const { db, user } = await adminDatabase()
  let validating = true

  try {
    const version = readVersion(
      form.get('version')
    )

    const rawEnabled = form.get('enabled')

    if (
      rawEnabled !== null &&
      rawEnabled !== 'on'
    ) {
      throw new Error(
        'Confira a opção de ativação do atacado.'
      )
    }

    const discount = parseCouponAmount(
      form.get('discount_percent'),
      'Desconto',
      true
    )

    if (discount > 99.99) {
      throw new Error(
        'O desconto deve estar entre 0 e 99,99%.'
      )
    }

    const minimum = parseCouponAmount(
      form.get('minimum_products'),
      'Pedido mínimo',
      true
    )

    const minimumCents = Math.round(
      minimum * 100
    )

    if (
      !Number.isSafeInteger(minimumCents) ||
      minimumCents > 999999999
    ) {
      throw new Error(
        'Confira o valor do pedido mínimo.'
      )
    }

    validating = false

    const result = await db.rpc(
      'serenity_admin_wholesale_settings_save',
      {
        p_actor: user.id,
        p_version: version,
        p_enabled: rawEnabled === 'on',
        p_discount_percent: discount,
        p_minimum_products_cents: minimumCents,
      }
    )

    if (result.error) {
      return {
        error: databaseError(result.error),
      }
    }

    const saved: unknown = result.data

    if (
      !saved ||
      typeof saved !== 'object' ||
      Array.isArray(saved)
    ) {
      return {
        error:
          'Não foi possível confirmar o salvamento. Atualize a página antes de repetir.',
      }
    }

    const nextVersion = (
      saved as Record<string, unknown>
    ).version

    if (
      typeof nextVersion !== 'number' ||
      !Number.isSafeInteger(nextVersion) ||
      nextVersion !== version + 1
    ) {
      return {
        error:
          'Não foi possível confirmar o salvamento. Atualize a página antes de repetir.',
      }
    }

    refreshWholesale()

    return {
      error: '',
      version: nextVersion,
    }
  } catch (error) {
    return {
      error:
        validating && error instanceof Error
          ? error.message
          : 'Não foi possível confirmar o salvamento. Atualize a página antes de repetir.',
    }
  }
}

export async function reviewWholesaleAccount(
  form: FormData
): Promise<WholesaleActionResult> {
  const { db, user } = await adminDatabase()
  let validating = true

  try {
    const id = form.get('user_id')

    if (!saleUuid(id)) {
      throw new Error(
        'Confira o cadastro selecionado.'
      )
    }

    const version = readVersion(
      form.get('version')
    )

    const decision = form.get('decision')

    if (
      typeof decision !== 'string' ||
      ![
        'approved',
        'rejected',
        'suspended',
      ].includes(decision)
    ) {
      throw new Error(
        'Escolha uma ação válida para o cadastro.'
      )
    }

    validating = false

    const result = await db.rpc(
      'serenity_admin_wholesale_review',
      {
        p_user: id,
        p_actor: user.id,
        p_version: version,
        p_decision: decision,
      }
    )

    if (result.error) {
      return {
        error: databaseError(result.error),
      }
    }

    const saved: unknown = result.data

    if (
      !saved ||
      typeof saved !== 'object' ||
      Array.isArray(saved)
    ) {
      return {
        error:
          'Não foi possível confirmar a alteração. Atualize a lista antes de repetir.',
      }
    }

    const record =
      saved as Record<string, unknown>

    if (
      record.user_id !== id ||
      record.wholesale_status !== decision ||
      typeof record.version !== 'number' ||
      !Number.isSafeInteger(record.version) ||
      (
        record.version !== version &&
        record.version !== version + 1
      )
    ) {
      return {
        error:
          'Não foi possível confirmar a alteração. Atualize a lista antes de repetir.',
      }
    }

    refreshWholesale()
    try {
      const { safeDrainOrderEmails } = await import('@/lib/order-email-server')
      await safeDrainOrderEmails(db)
    } catch { /* A aprovação confirmada permanece salva; a fila será processada depois. */ }

    return {
      error: '',
      version: record.version,
      status: decision,
    }
  } catch (error) {
    return {
      error:
        validating && error instanceof Error
          ? error.message
          : 'Não foi possível confirmar a alteração. Atualize a lista antes de repetir.',
    }
  }
}
