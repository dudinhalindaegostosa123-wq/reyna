'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saleDate } from '@/lib/admin-sales'
import {
  couponAmountInput,
  parseCouponAmount,
} from '@/lib/coupon-ui'
import {
  reviewWholesaleAccount,
  saveWholesaleSettings,
} from './actions'

export interface WholesaleSettings {
  enabled: boolean
  discountPercent: number
  minimumProductsCents: number
  version: number
}

export type WholesaleStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'suspended'

export interface WholesaleAccount {
  userId: string
  version: number
  status: WholesaleStatus
  name: string
  email: string
  phone: string
  document: string
  hasCustomer: boolean
  requestedAt: string | null
  reviewedAt: string | null
}

type Decision = 'approved' | 'rejected' | 'suspended'

const labels: Record<WholesaleStatus, string> = {
  pending: 'Aguardando aprovação',
  approved: 'Aprovado',
  rejected: 'Não aprovado',
  suspended: 'Suspenso',
}

const colors: Record<WholesaleStatus, string> = {
  pending: 'bg-amber-50 text-amber-800',
  approved: 'bg-green-50 text-green-800',
  rejected: 'bg-red-50 text-red-800',
  suspended: 'bg-[#EFEAE2] text-[#625A4F]',
}

const box =
  'rounded-2xl border border-[#E5DED3] bg-white p-5 sm:p-6'

const button =
  'min-h-[44px] rounded-full bg-[#292621] px-5 py-3 text-xs text-white disabled:opacity-50'

function SettingsForm({
  initial,
}: {
  initial: WholesaleSettings
}) {
  const router = useRouter()
  const lock = useRef(false)

  const [version, setVersion] = useState(initial.version)

  const [discount, setDiscount] = useState(
    couponAmountInput(initial.discountPercent)
  )

  const [minimum, setMinimum] = useState(
    couponAmountInput(initial.minimumProductsCents / 100)
  )

  const [enabled, setEnabled] = useState(initial.enabled)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  const [errors, setErrors] = useState<
    Record<string, string>
  >({})

  function check(
    name: 'discount' | 'minimum',
    value: string
  ): string {
    try {
      const amount = parseCouponAmount(
        value,
        name === 'discount' ? 'Desconto' : 'Pedido mínimo',
        true
      )

      if (name === 'discount' && amount > 99.99) {
        return 'Use um desconto de 0 a 99,99%.'
      }

      return ''
    } catch (error) {
      return error instanceof Error
        ? error.message
        : 'Confira o valor.'
    }
  }

  async function save(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (lock.current) return

    const nextErrors = {
      discount: check('discount', discount),
      minimum: check('minimum', minimum),
    }

    setErrors(nextErrors)

    if (nextErrors.discount || nextErrors.minimum) return

    const form = new FormData(event.currentTarget)

    lock.current = true
    setBusy(true)
    setMessage('')
    setFailed(false)

    try {
      const result = await saveWholesaleSettings(form)

      if (result.error || !result.version) {
        setFailed(true)
        setMessage(
          result.error ||
          'Atualize a página para conferir o salvamento.'
        )
        return
      }

      setVersion(result.version)
      setMessage('Regras do atacado salvas.')
      router.refresh()
    } catch {
      setFailed(true)
      setMessage(
        'A conexão falhou. Atualize a página antes de repetir.'
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  const fieldClass = (error?: string) =>
    'mt-2 min-h-[46px] w-full rounded-xl border bg-white px-3 text-base sm:text-sm ' +
    (error ? 'border-red-600' : 'border-[#DCD4C8]')

  return (
    <section className={box}>
      <h2 className="text-lg font-medium">
        Regras do atacado
      </h2>

      <p className="mt-2 text-xs leading-relaxed text-[#756B5D]">
        Desconto sobre o preço normal das peças, independente
        das campanhas e cupons da loja.
      </p>

      <form onSubmit={save} className="mt-5" noValidate>
        <input
          type="hidden"
          name="version"
          value={version}
        />

        <fieldset
          disabled={busy}
          className="space-y-5 disabled:opacity-60"
        >
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="enabled"
              checked={enabled}
              onChange={event =>
                setEnabled(event.target.checked)
              }
              className="mt-1"
            />

            <span>
              Atacado habilitado
              <span className="mt-1 block text-xs leading-relaxed text-[#756B5D]">
                As condições especiais exigem cadastro aprovado.
              </span>
            </span>
          </label>

          <div>
            <label
              htmlFor="wholesale-discount"
              className="text-xs"
            >
              Desconto (%)
            </label>

            <input
              id="wholesale-discount"
              name="discount_percent"
              value={discount}
              onChange={event => {
                setDiscount(event.target.value)

                if (errors.discount) {
                  setErrors(previous => ({
                    ...previous,
                    discount: check(
                      'discount',
                      event.target.value
                    ),
                  }))
                }
              }}
              onBlur={() =>
                setErrors(previous => ({
                  ...previous,
                  discount: check('discount', discount),
                }))
              }
              inputMode="decimal"
              maxLength={20}
              required
              aria-invalid={Boolean(errors.discount)}
              aria-describedby={
                errors.discount
                  ? 'wholesale-discount-error'
                  : undefined
              }
              className={fieldClass(errors.discount)}
            />

            {errors.discount && (
              <p
                id="wholesale-discount-error"
                className="mt-2 text-xs text-red-700"
              >
                {errors.discount}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="wholesale-minimum"
              className="text-xs"
            >
              Pedido mínimo (R$)
            </label>

            <input
              id="wholesale-minimum"
              name="minimum_products"
              value={minimum}
              onChange={event => {
                setMinimum(event.target.value)

                if (errors.minimum) {
                  setErrors(previous => ({
                    ...previous,
                    minimum: check(
                      'minimum',
                      event.target.value
                    ),
                  }))
                }
              }}
              onBlur={() =>
                setErrors(previous => ({
                  ...previous,
                  minimum: check('minimum', minimum),
                }))
              }
              inputMode="decimal"
              maxLength={20}
              required
              aria-invalid={Boolean(errors.minimum)}
              aria-describedby="wholesale-minimum-help wholesale-minimum-error"
              className={fieldClass(errors.minimum)}
            />

            <p
              id="wholesale-minimum-help"
              className="mt-2 text-[11px] leading-relaxed text-[#756B5D]"
            >
              Valor dos produtos após o desconto de atacado.
              Frete e anodização não entram no mínimo.
              Digite sem ponto de milhar, por exemplo 1000,00.
            </p>

            <p
              id="wholesale-minimum-error"
              className="mt-2 text-xs text-red-700"
            >
              {errors.minimum || ''}
            </p>
          </div>

          <button
            type="submit"
            disabled={busy}
            className={button}
          >
            {busy ? 'Salvando…' : 'Salvar regras'}
          </button>
        </fieldset>

        {message && (
          <p
            role={failed ? 'alert' : 'status'}
            className={`mt-4 text-sm ${
              failed ? 'text-red-700' : 'text-green-800'
            }`}
          >
            {message}
          </p>
        )}
      </form>
    </section>
  )
}

function AccountReview({
  initial,
}: {
  initial: WholesaleAccount
}) {
  const router = useRouter()
  const lock = useRef(false)

  const [account, setAccount] = useState(initial)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  async function confirm() {
    if (lock.current || !decision) return

    const chosen = decision
    const form = new FormData()

    form.set('user_id', account.userId)
    form.set('version', String(account.version))
    form.set('decision', chosen)

    lock.current = true
    setBusy(true)
    setMessage('')
    setFailed(false)

    try {
      const result = await reviewWholesaleAccount(form)

      if (
        result.error ||
        !result.version ||
        result.status !== chosen
      ) {
        setFailed(true)
        setMessage(
          result.error ||
          'Atualize a lista para conferir a alteração.'
        )
        return
      }

      setAccount(previous => ({
        ...previous,
        status: chosen,
        version: result.version as number,
        reviewedAt: null,
      }))

      setDecision(null)
      setMessage('Situação do cadastro atualizada.')
      router.refresh()
    } catch {
      setFailed(true)
      setMessage(
        'A conexão falhou. Atualize a lista antes de repetir.'
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  const canApprove =
    account.hasCustomer && Boolean(account.document)

  const decisionLabel =
    decision === 'approved'
      ? 'aprovar o acesso ao atacado'
      : decision === 'rejected'
        ? 'não aprovar a solicitação'
        : 'suspender o acesso ao atacado'

  return (
    <article className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-medium">
            {account.name}
          </h3>

          {account.email && (
            <p className="mt-1 break-words text-xs text-[#756B5D]">
              {account.email}
            </p>
          )}

          {account.phone && (
            <p className="mt-1 text-xs text-[#756B5D]">
              {account.phone}
            </p>
          )}

          <p className="mt-2 break-all text-xs">
            CPF/CNPJ: {account.document || 'Pendente'}
          </p>

          {account.requestedAt && (
            <p className="mt-2 text-[11px] text-[#81796C]">
              Solicitado em {saleDate(account.requestedAt)}
            </p>
          )}

          {account.reviewedAt && (
            <p className="mt-1 text-[11px] text-[#81796C]">
              Última análise em {saleDate(account.reviewedAt)}
            </p>
          )}
        </div>

        <span
          className={`rounded-full px-3 py-1.5 text-[11px] ${
            colors[account.status]
          }`}
        >
          {labels[account.status]}
        </span>
      </div>

      {!account.hasCustomer && (
        <p
          role="alert"
          className="mt-3 text-xs text-amber-800"
        >
          O vínculo com o cadastro do cliente precisa ser
          conferido antes da aprovação.
        </p>
      )}

      <fieldset
        disabled={busy}
        className="mt-4 disabled:opacity-60"
      >
        {decision ? (
          <div className="rounded-xl border border-[#DCD4C8] bg-[#FAF8F4] p-4">
            <p className="text-sm">
              Confirma {decisionLabel} de{' '}
              <strong>{account.name}</strong>?
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy}
                className={button}
              >
                {busy ? 'Salvando…' : 'Confirmar'}
              </button>

              <button
                type="button"
                onClick={() => setDecision(null)}
                className="min-h-[44px] rounded-full border border-[#DCD4C8] px-5 text-xs"
              >
                Voltar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {account.status !== 'approved' && (
              <button
                type="button"
                disabled={!canApprove}
                onClick={() => setDecision('approved')}
                className={button}
              >
                {account.status === 'suspended'
                  ? 'Reativar acesso'
                  : account.status === 'rejected'
                    ? 'Reavaliar e aprovar'
                    : 'Aprovar atacado'}
              </button>
            )}

            {account.status === 'approved' && (
              <button
                type="button"
                onClick={() => setDecision('suspended')}
                className="min-h-[44px] rounded-full border border-[#DCD4C8] px-5 text-xs"
              >
                Suspender acesso
              </button>
            )}

            {['pending', 'suspended'].includes(account.status) && (
              <button
                type="button"
                onClick={() => setDecision('rejected')}
                className="min-h-[44px] rounded-full border border-[#DCD4C8] px-5 text-xs text-red-700"
              >
                Não aprovar
              </button>
            )}
          </div>
        )}
      </fieldset>

      {message && (
        <p
          role={failed ? 'alert' : 'status'}
          className={`mt-3 text-xs ${
            failed ? 'text-red-700' : 'text-green-800'
          }`}
        >
          {message}
        </p>
      )}
    </article>
  )
}

export default function WholesalePanel({
  settings,
  accounts,
}: {
  settings: WholesaleSettings
  accounts: WholesaleAccount[]
}) {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <SettingsForm
        key={settings.version}
        initial={settings}
      />

      <section className={box}>
        <h2 className="text-lg font-medium">
          Cadastros de atacado
        </h2>

        <p className="mt-2 text-xs leading-relaxed text-[#756B5D]">
          A aprovação libera o perfil de atacado. Suspender
          ou não aprovar não exclui o cliente nem seus pedidos.
        </p>

        {accounts.length ? (
          <div className="mt-2 divide-y divide-[#EEE9E1]">
            {accounts.map(account => (
              <AccountReview
                key={`${account.userId}-${account.version}`}
                initial={account}
              />
            ))}
          </div>
        ) : (
          <p className="py-8 text-sm text-[#81796C]">
            Nenhum cadastro nesta situação.
          </p>
        )}
      </section>
    </div>
  )
}
