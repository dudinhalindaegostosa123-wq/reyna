'use client'
import { labretCopy } from '@/lib/stem-description'

import { STORE_INFORMATION } from '@/lib/store-information'

import { useEffect, useRef, useState } from 'react'
import {useCheckoutContact} from '@/components/checkout/useCheckoutContact'
import Link from 'next/link'
import Image from 'next/image'
import { checkoutAnalyticsContext } from '@/lib/google-analytics'
import { startCheckoutV2 } from './actions-v2'
import type { PendingCheckoutV2 } from '@/lib/checkout-session-server-v2'
import { useCartStore } from '@/lib/cart'
import { formatPrice } from '@/lib/data'
import { CHECKOUT_STATES } from '@/lib/checkout'
import { normalizeCheckoutDocument } from '@/lib/checkout-document'
import { normalizeCouponCode } from '@/lib/coupon-ui'
import type { DeliveryOption } from '@/lib/shipping'
import type { CouponCheckoutQuote } from './actions'
import {
  reviewCheckout,
  quoteCheckoutShipping,
} from './actions'

type Values = {
  name: string
  document: string
  email: string
  phone: string
  cep: string
  street: string
  number: string
  complement: string
  district: string
  city: string
  state: string
}

type FieldName = keyof Values
type Errors = Partial<Record<FieldName, string>>

type QuoteState = {
  key: string
  quote?: CouponCheckoutQuote
  error: string
}

type ShippingState = {
  key: string
  status: 'loading' | 'ready' | 'error'
  options: DeliveryOption[]
  message: string
}

const empty: Values = {
  name: '',
  document: '',
  email: '',
  phone: '',
  cep: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: '',
}

const addressKeys = [
  'street',
  'district',
  'city',
  'state',
] as const

const box =
  'rounded-2xl border border-store-border bg-store-surface p-5 sm:p-6'

const button =
  'min-h-[46px] rounded-full bg-store-action px-6 py-3 text-sm text-white disabled:opacity-40'

const labels: Record<FieldName, string> = {
  name: 'Nome completo',
  document: 'CPF ou CNPJ',
  email: 'E-mail',
  phone: 'WhatsApp com DDD',
  cep: 'CEP',
  street: 'Rua ou avenida',
  number: 'Número',
  complement: 'Complemento (opcional)',
  district: 'Bairro',
  city: 'Cidade',
  state: 'Estado',
}

const limits: Record<FieldName, number> = {
  name: 180,
  document: 24,
  email: 254,
  phone: 25,
  cep: 9,
  street: 180,
  number: 30,
  complement: 180,
  district: 100,
  city: 100,
  state: 2,
}

const autocomplete: Partial<Record<FieldName, string>> = {
  name: 'name',
  email: 'email',
  phone: 'tel',
  cep: 'postal-code',
  street: 'address-line1',
  complement: 'address-line2',
  city: 'address-level2',
  state: 'address-level1',
}

function fieldError(
  name: FieldName,
  value: string
): string {
  const text = value.trim()

  if (!text && name !== 'complement') {
    return `Preencha ${labels[name].toLowerCase()}.`
  }

  if (text.length > limits[name]) {
    return 'Confira o tamanho deste campo.'
  }

  if (/[\u0000-\u001F\u007F]/.test(text)) {
    return 'Remova os caracteres inválidos.'
  }

  if (name === 'document' && text) {
    try {
      normalizeCheckoutDocument(text)
    } catch (error) {
      return error instanceof Error
        ? error.message
        : 'Informe um CPF ou CNPJ válido.'
    }
  }

  if (
    name === 'email' &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
  ) {
    return 'Informe um e-mail válido.'
  }

  if (
    name === 'phone' &&
    !/^\d{10,11}$/.test(text.replace(/\D/g, ''))
  ) {
    return 'Informe o telefone com DDD.'
  }

  if (
    name === 'cep' &&
    !/^\d{8}$/.test(text.replace(/\D/g, ''))
  ) {
    return 'Informe os oito números do CEP.'
  }

  if (
    name === 'state' &&
    !CHECKOUT_STATES.includes(text)
  ) {
    return 'Selecione um estado válido.'
  }

  return ''
}

const PENDING_KEY = 'serenity-checkout-pending-v2'
const REQUEST_KEY = 'serenity-checkout-request-v2'

interface SavedCheckout extends PendingCheckoutV2 {
  cart: string
  savedAt: number
}

function restorePending(
  value: unknown
): SavedCheckout | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null
  }

  const saved = value as Record<string, unknown>

  if (
    typeof saved.id !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      saved.id
    ) ||
    typeof saved.cart !== 'string' ||
    saved.cart.length > 100000 ||
    typeof saved.savedAt !== 'number' ||
    !Number.isFinite(saved.savedAt) ||
    saved.savedAt > Date.now() ||
    Date.now() - saved.savedAt > 24 * 60 * 60 * 1000 ||
    typeof saved.totalCents !== 'number' ||
    !Number.isSafeInteger(saved.totalCents) ||
    saved.totalCents < 1 ||
    typeof saved.shippingPending !== 'boolean' ||
    typeof saved.reservedUntil !== 'string' ||
    !Number.isFinite(Date.parse(saved.reservedUntil))
  ) {
    return null
  }

  return {
    id: saved.id,
    paymentUrl: `/pagamento/${saved.id}`,
    cart: saved.cart,
    savedAt: saved.savedAt,
    totalCents: saved.totalCents,
    shippingPending: saved.shippingPending,
    reservedUntil: saved.reservedUntil,
  }
}

export default function CheckoutClient() {
  const { items } = useCartStore()

  const [ready, setReady] = useState(false)

  const [request, setRequest] = useState({
    cart: '',
    id: '',
  })

  const [values, setValues] = useState<Values>(empty)

  const [touched, setTouched] = useState<
    Partial<Record<FieldName, boolean>>
  >({})

  const [quoteState, setQuoteState] =
    useState<QuoteState | null>(null)

  const [shipping, setShipping] =
    useState<ShippingState | null>(null)

  const [selected, setSelected] = useState('')
  const [couponDraft, setCouponDraft] = useState('')
  const [coupon, setCoupon] = useState('')
  const [couponError, setCouponError] = useState('')
  const [reviewAttempt, setReviewAttempt] = useState(0)
  const [shippingAttempt, setShippingAttempt] = useState(0)
  const [addressAttempt, setAddressAttempt] = useState(0)
  const [addressStatus, setAddressStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const [pending, setPending] =
    useState<SavedCheckout | null>(null)

  const submitLock = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  const revisions = useRef({
    street: 0,
    district: 0,
    city: 0,
    state: 0,
  })

  const lines = items.map(item => ({
    slug: item.slug,
    variant: item.variationId || '',
    quantity: item.quantity,
    color: item.anodization?.code || '',
    ...(typeof item.sterilized==='boolean'?{sterilized:item.sterilized}:{}),
    ...(item.stem && !item.stemLocked ? {stem:item.stem}:{}),
  }))

  const signature = JSON.stringify(lines)

  const requestId =
    request.cart === signature ? request.id : ''

  useCheckoutContact({id:requestId,name:values.name,email:values.email,phone:values.phone,items,enabled:ready && !pending})

  const postalCode = values.cep.replace(/\D/g, '')

  let customerDocument = ''

  try {
    customerDocument = normalizeCheckoutDocument(
      values.document
    )
  } catch {}

  const couponDocument = coupon ? customerDocument : ''
  const itemCount = items.length

  const reviewKey = JSON.stringify([
    signature,
    requestId,
    coupon,
    couponDocument,
  ])

  const quote =
    quoteState?.key === reviewKey
      ? quoteState.quote
      : undefined

  const reviewError =
    quoteState?.key === reviewKey
      ? quoteState.error
      : ''

  const reviewing = Boolean(
    requestId && !quote && !reviewError
  )

  const reviewReady = Boolean(quote)

  const shippingKey = JSON.stringify([
    reviewKey,
    postalCode,
  ])

  const currentShipping =
    shipping?.key === shippingKey ? shipping : null

  const options =
    quote && currentShipping?.status === 'ready'
      ? currentShipping.options
      : []

  const delivery = options.find(
    option => option.id === selected
  )

  const couponDirty =
    couponDraft.trim().toUpperCase() !== coupon

  const discount = quote?.discount_cents || 0

  const subtotal = quote
    ? quote.subtotal_cents ??
      quote.total_cents + discount
    : 0

  const total =
    (quote?.total_cents || 0) +
    (delivery?.amount_cents || 0)

  const canSubmit = Boolean(
    quote &&
    delivery &&
    !couponDirty &&
    !submitting &&
    !pending
  )

  useEffect(() => {
    try {
      const saved = restorePending(
        JSON.parse(
          sessionStorage.getItem(PENDING_KEY) || 'null'
        )
      )

      if (saved) {
        setPending(saved)
      }
    } catch {}

    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready || pending) return

    let id = crypto.randomUUID()

    try {
      const saved = JSON.parse(
        sessionStorage.getItem(REQUEST_KEY) || 'null'
      )

      if (
        saved?.cart === signature &&
        typeof saved.id === 'string' &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          saved.id
        )
      ) {
        id = saved.id
      }

      sessionStorage.setItem(
        REQUEST_KEY,
        JSON.stringify({
          cart: signature,
          id,
        })
      )
    } catch {}

    setRequest({
      cart: signature,
      id,
    })

    setMessage('')
  }, [ready, signature, pending])

  useEffect(() => {
    if (
      !ready ||
      !requestId ||
      !itemCount ||
      pending
    ) {
      return
    }

    let active = true

    setQuoteState(null)
    setMessage('')

    const timer = setTimeout(async () => {
      try {
        const result = await reviewCheckout(
          JSON.parse(signature),
          requestId,
          coupon,
          couponDocument
        )

        if (!active) return

        setQuoteState({
          key: reviewKey,
          quote: result.quote,
          error:
            result.error ||
            (!result.quote
              ? 'Não foi possível conferir os valores.'
              : ''),
        })
      } catch {
        if (active) {
          setQuoteState({
            key: reviewKey,
            error:
              'Não foi possível conferir os valores. Tente novamente.',
          })
        }
      }
    }, 300)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [
    ready,
    requestId,
    signature,
    coupon,
    couponDocument,
    itemCount,
    reviewKey,
    reviewAttempt,
    pending,
  ])

  useEffect(() => {
    if (
      !reviewReady ||
      postalCode.length !== 8 ||
      !requestId ||
      pending
    ) {
      return
    }

    let active = true

    setSelected('')

    setShipping({
      key: shippingKey,
      status: 'loading',
      options: [],
      message: '',
    })

    const timer = setTimeout(async () => {
      try {
        const result = await quoteCheckoutShipping({
          items: JSON.parse(signature),
          requestId,
          cep: postalCode,
          couponCode: coupon,
          document: couponDocument,
        })

        if (!active) return

        if (result.error || !result.quote) {
          setShipping({
            key: shippingKey,
            status: 'error',
            options: [],
            message:
              result.error ||
              'Não foi possível consultar a entrega.',
          })

          return
        }

        setQuoteState({
          key: reviewKey,
          quote: result.quote,
          error: '',
        })

        const found = result.options || []

        setShipping({
          key: shippingKey,
          status: 'ready',
          options: found,
          message: result.message || '',
        })

        if (found.length === 1) {
          setSelected(found[0].id)
        }
      } catch {
        if (active) {
          setShipping({
            key: shippingKey,
            status: 'error',
            options: [],
            message:
              'A consulta de frete falhou. Tente novamente.',
          })
        }
      }
    }, 650)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [
    reviewReady,
    shippingKey,
    shippingAttempt,
    pending,
    postalCode,
    requestId,
    signature,
    coupon,
    couponDocument,
    reviewKey,
  ])

  useEffect(() => {
    if (postalCode.length !== 8 || pending) {
      setAddressStatus('')
      return
    }

    let active = true

    const controller = new AbortController()
    const initial = { ...revisions.current }

    let timeout:
      | ReturnType<typeof setTimeout>
      | undefined

    setAddressStatus('Buscando endereço…')

    const timer = setTimeout(async () => {
      timeout = setTimeout(
        () => controller.abort(),
        8000
      )

      try {
        const response = await fetch(
          `https://viacep.com.br/ws/${postalCode}/json/`,
          {
            signal: controller.signal,
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
          }
        )

        if (!response.ok) {
          throw new Error('CEP_LOOKUP')
        }

        const data = await response.json()

        if (!active) return

        if (
          !data ||
          typeof data !== 'object' ||
          Array.isArray(data) ||
          data.erro ||
          String(data.cep || '').replace(/\D/g, '') !==
            postalCode
        ) {
          throw new Error('CEP_LOOKUP')
        }

        const text = (
          value: unknown,
          max: number
        ) =>
          typeof value === 'string'
            ? value.trim().slice(0, max)
            : ''

        const found = {
          street: text(data.logradouro, 180),
          district: text(data.bairro, 100),
          city: text(data.localidade, 100),
          state: text(data.uf, 2),
        }

        if (!CHECKOUT_STATES.includes(found.state)) {
          found.state = ''
        }

        setValues(previous => {
          const next = { ...previous }

          for (const key of addressKeys) {
            if (
              revisions.current[key] === initial[key]
            ) {
              next[key] = found[key]
            }
          }

          return next
        })

        setAddressStatus(
          'Confira o endereço e complete os campos que faltarem.'
        )
      } catch {
        if (active) {
          setAddressStatus(
            'Não foi possível localizar o CEP. Confira-o ou preencha o endereço manualmente.'
          )
        }
      } finally {
        if (timeout) clearTimeout(timeout)
      }
    }, 400)

    return () => {
      active = false
      clearTimeout(timer)

      if (timeout) clearTimeout(timeout)

      controller.abort()
    }
  }, [postalCode, addressAttempt, pending])

  function change(
    name: FieldName,
    value: string
  ) {
    setMessage('')

    if (name === 'cep') {
      const digits = value
        .replace(/\D/g, '')
        .slice(0, 8)

      if (digits !== postalCode) {
        for (const key of addressKeys) {
          revisions.current[key]++
        }

        setValues(previous => ({
          ...previous,
          street: '',
          district: '',
          city: '',
          state: '',
          number: '',
          complement: '',
          cep:
            digits.length > 5
              ? `${digits.slice(0, 5)}-${digits.slice(5)}`
              : digits,
        }))
      }

      return
    }

    if (
      addressKeys.some(key => key === name)
    ) {
      revisions.current[
        name as typeof addressKeys[number]
      ]++
    }

    setValues(previous => ({
      ...previous,
      [name]:
        name === 'document'
          ? value.toUpperCase()
          : value,
    }))
  }

  function input(
    name: FieldName,
    wide = false
  ) {
    const error = touched[name]
      ? fieldError(name, values[name])
      : ''

    const props = {
      id: `checkout-${name}`,
      name,
      value: values[name],

      onChange: (
        event: React.ChangeEvent<
          HTMLInputElement | HTMLSelectElement
        >
      ) => change(name, event.target.value),

      onBlur: () =>
        setTouched(previous => ({
          ...previous,
          [name]: true,
        })),

      required: name !== 'complement',

      autoComplete:
        autocomplete[name] || 'off',

      'aria-invalid': Boolean(error),

      'aria-describedby': error
        ? `checkout-${name}-error`
        : undefined,

      className:
        'mt-2 min-h-[46px] w-full rounded-xl border bg-store-surface px-3 py-2 text-base focus:outline-offset-2 sm:text-sm ' +
        (error
          ? 'border-red-600 focus:outline-red-600'
          : 'border-store-border'),
    }

    return (
      <div
        key={name}
        className={wide ? 'sm:col-span-2' : ''}
      >
        <label
          htmlFor={props.id}
          className="text-xs"
        >
          {labels[name]}{' '}

          {error && (
            <span
              aria-hidden="true"
              className="text-store-error"
            >
              ⚠
            </span>
          )}
        </label>

        {name === 'state' ? (
          <select {...props}>
            <option value="">Selecione</option>

            {CHECKOUT_STATES.map(state => (
              <option key={state}>
                {state}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...props}
            maxLength={limits[name]}
            type={
              name === 'email'
                ? 'email'
                : name === 'phone'
                  ? 'tel'
                  : 'text'
            }
            inputMode={
              name === 'cep'
                ? 'numeric'
                : undefined
            }
            spellCheck={
              name === 'document'
                ? false
                : undefined
            }
          />
        )}

        {error && (
          <p
            id={`checkout-${name}-error`}
            className="mt-2 text-xs text-store-error"
            aria-live="polite"
          >
            {error}
          </p>
        )}
      </div>
    )
  }

  function applyCoupon() {
    try {
      const code = normalizeCouponCode(couponDraft)

      setCouponDraft(code)
      setCoupon(code)
      setCouponError('')
      setReviewAttempt(value => value + 1)
    } catch (error) {
      setCouponError(
        error instanceof Error
          ? error.message
          : 'Confira o cupom.'
      )
    }
  }

  async function send(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (submitLock.current) return

    const errors: Errors = {}

    for (
      const name of Object.keys(values) as FieldName[]
    ) {
      const error = fieldError(
        name,
        values[name]
      )

      if (error) {
        errors[name] = error
      }
    }

    const names = Object.keys(errors) as FieldName[]

    if (names.length) {
      setTouched(
        Object.fromEntries(
          Object.keys(values).map(name => [
            name,
            true,
          ])
        )
      )

      setMessage('Confira os campos destacados.')

      formRef.current
        ?.querySelector<HTMLElement>(
          `[name="${names[0]}"]`
        )
        ?.focus()

      return
    }

    if (
      !canSubmit ||
      !requestId ||
      !delivery
    ) {
      return
    }

    const form = new FormData(event.currentTarget)

    const submittedId = requestId
    const submittedCart = signature

    submitLock.current = true
    setSubmitting(true)
    setMessage('')

    try {
      const analytics = await checkoutAnalyticsContext()
      window.dispatchEvent(new Event('serenity-checkout-contact-flush'))
      const result = await startCheckoutV2({
        ...(analytics?{analytics}:{}),
        id: submittedId,
        items: lines,

        customer: {
          name: values.name,
          email: values.email,
          phone: values.phone,
          document: normalizeCheckoutDocument(
            values.document
          ),
        },

        address: {
          cep: values.cep,
          street: values.street,
          number: values.number,
          complement: values.complement,
          district: values.district,
          city: values.city,
          state: values.state,
        },

        totalCents: total,
        shippingQuote: delivery.id,
        couponCode: coupon,

        website: String(
          form.get('website') || ''
        ),
      })

      if (result.loginRequired) {
        window.location.assign('/minha-conta/entrar?retorno=checkout')
        return
      }

      if (result.error || !result.checkout) {
        setMessage(
          result.error ||
          'Não foi possível abrir o pagamento. Tente novamente nesta tela.'
        )

        return
      }

      if (
        result.checkout.id !== submittedId ||
        result.checkout.paymentUrl !==
          `/pagamento/${submittedId}`
      ) {
        setMessage(
          'Não foi possível confirmar o acesso ao pagamento. Não refaça a compra; tente novamente nesta tela.'
        )

        return
      }

      const saved: SavedCheckout = {
        ...result.checkout,
        cart: submittedCart,
        savedAt: Date.now(),
      }

      setPending(saved)

      try {
        sessionStorage.setItem(
          PENDING_KEY,
          JSON.stringify(saved)
        )
      } catch {}

      // O carrinho só será limpo após
      // a confirmação real do pagamento.
      window.location.assign(saved.paymentUrl)
    } catch {
      setMessage(
        'A conexão falhou. Tente novamente nesta tela para manter a mesma identificação do checkout.'
      )
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
  }

  if (!ready) {
    return (
      <main
        role="status"
        className="px-5 py-16 text-center"
      >
        Carregando seu carrinho…
      </main>
    )
  }

  if (pending) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-store-accent">
          Lunarity
        </p>

        <h1 className="mt-3 text-3xl font-medium">
          Continue seu pagamento
        </h1>

        <p className="mt-4 text-sm leading-7 text-store-muted">
          Você já iniciou este checkout. Acesse a página
          de pagamento para conferir a situação.
          O pedido só será registrado depois da
          confirmação do pagamento.
        </p>

        {pending.cart !== signature && (
          <p
            role="alert"
            className="mt-5 rounded-2xl bg-store-warning-bg p-4 text-sm leading-7 text-store-warning"
          >
            Seu carrinho foi alterado. O pagamento iniciado
            se refere às peças anteriores. Confira essa
            tentativa antes de iniciar outra compra.
          </p>
        )}

        <Link
          href={pending.paymentUrl}
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full bg-store-action px-6 text-sm text-white"
        >
          {pending.shippingPending
            ? 'Conferir frete e situação'
            : 'Continuar para pagamento'}
        </Link>

        <p className="mt-4 text-xs leading-6 text-store-muted">
          O valor e a situação serão conferidos na página
          de pagamento. Não é necessário reenviar seus dados.
        </p>
      </main>
    )
  }

  if (!items.length) {
    return (
      <main className="mx-auto max-w-xl px-5 py-16 text-center">
        <h1 className="text-2xl">
          Seu carrinho está vazio
        </h1>

        <Link
          href="/categoria/todos"
          className="mt-6 inline-block underline"
        >
          Escolher minhas joias
        </Link>
      </main>
    )
  }

  const summary = (
    <div
      aria-live="polite"
      aria-atomic="true"
    >
      <h2 className="mb-5 text-lg font-medium">
        Resumo do pedido
      </h2>

      <div className="flex justify-between gap-3 text-sm">
        <span>Peças</span>

        <strong>
          {quote
            ? formatPrice(subtotal / 100)
            : 'Conferindo…'}
        </strong>
      </div>

      {(quote?.coupon?.discount_cents || 0) > 0 && (
        <div className="mt-3 flex justify-between gap-3 text-sm text-store-success">
          <span>Cupom {coupon}</span>

          <strong>
            − {formatPrice((quote?.coupon?.discount_cents || 0) / 100)}
          </strong>
        </div>
      )}

      {(quote?.progressive?.discount_cents || 0) > 0 && <div className="mt-3 flex justify-between gap-3 text-sm text-store-accent">
        <span>Lunarity Collection · {quote?.progressive?.percent}%</span>
        <strong>− {formatPrice((quote?.progressive?.discount_cents || 0) / 100)}</strong>
      </div>}

      <div className="mt-3 flex justify-between gap-3 text-sm">
        <span>Frete</span>

        <span>
          {delivery
            ? delivery.manual
              ? 'A confirmar'
              : formatPrice(
                  delivery.amount_cents / 100
                )
            : 'Escolha a entrega'}
        </span>
      </div>

      <div className="mt-5 flex justify-between gap-3 border-t border-store-border pt-5">
        <span>
          {delivery?.manual || !delivery
            ? 'Subtotal'
            : 'Total'}
        </span>

        <strong className="text-xl">
          {quote
            ? formatPrice(total / 100)
            : 'A conferir'}
        </strong>
      </div>

      <div className="mt-6 border-t border-store-border pt-5">
            <h3 className="text-xs font-medium leading-5">
              Suas peças
            </h3>

            <ul className="mt-3 max-h-72 divide-y divide-store-border overflow-y-auto pr-1">
              {items.map((item, index) => {
                const checked = quote?.items[index]

                return (
                  <li
                    key={item.variantKey}
                    className="flex items-start gap-3 py-4"
                  >
                    <Image src={item.image} alt="" width={56} height={68}
                      className="h-[68px] w-14 shrink-0 rounded-lg bg-store-raised object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-5">
                        {labretCopy(checked?.name || item.name)}
                      </p>

                      {checked?.variation && (
                        <p className="mt-1 text-xs text-store-muted">
                          {checked.variation}
                        </p>
                      )}

                      {!checked &&
                        Object.values(
                          item.variants
                        ).map((value, key) => (
                          <p
                            key={key}
                            className="mt-1 text-xs text-store-muted"
                          >
                            {value}
                          </p>
                        ))}

                      {checked?.color && (
                        <p className="mt-1 text-xs text-store-muted">
                          Anodização:{' '}
                          {item.anodization?.label ||
                            checked.color}{' '}
                          ·{' '}
                          {formatPrice(checked.fee)}{' '}
                          por unidade
                        </p>
                      )}

                      <p className="mt-2 text-xs">
                        Quantidade: {item.quantity}
                      </p>
                    </div>

                    <strong className="shrink-0 text-xs">
                      {checked
                        ? formatPrice(
                            checked.line_total
                          )
                        : 'Conferindo…'}
                    </strong>
                  </li>
                )
              })}
            </ul>

            {reviewing && (
              <p
                role="status"
                className="mt-2 text-xs text-store-muted"
              >
                Conferindo preços e disponibilidade
                automaticamente…
              </p>
            )}

            {reviewError && !coupon && (
              <div
                role="alert"
                className="mt-3 text-sm text-store-error"
              >
                {reviewError}

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() =>
                    setReviewAttempt(
                      value => value + 1
                    )
                  }
                  className="ml-2 underline"
                >
                  Tentar novamente
                </button>
              </div>
            )}
          </div>

      {couponDirty && (
        <p className="mt-3 text-xs text-store-warning">
          Aplique ou remova o código digitado
          para continuar.
        </p>
      )}

      {!delivery && (
        <p className="mt-3 text-xs text-store-muted">
          O frete será incluído após escolher a entrega.
        </p>
      )}
    </div>
  )

  return (
    <main className="mx-auto max-w-6xl px-4 pb-44 pt-7 sm:px-8 lg:pb-12">
      <Link
        href="/carrinho"
        className="text-xs underline"
      >
        ← Voltar ao carrinho
      </Link>

      <p className="mt-6 text-[10px] uppercase tracking-[0.25em] text-store-accent">Um passo mais perto das suas novas peças</p>
      <h1 className="mt-3 font-display text-4xl sm:text-5xl">
        Finalizar meu pedido
      </h1>

      <p className="mt-3 max-w-2xl text-sm leading-6 text-store-muted">
        Confira suas peças, preencha seus dados e escolha
        a entrega. Na próxima tela você escolhe Pix ou cartão e continua
        com segurança. Seu pedido só será registrado
        após a confirmação do pagamento.
      </p>

      <nav aria-label="Etapas da compra" className="my-7 rounded-2xl border border-store-border bg-store-surface p-4 sm:p-5">
        <ol className="grid grid-cols-3 gap-3 text-xs sm:text-sm">
          <li aria-current="step" className="flex items-center gap-2 font-medium"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-store-action text-white">1</span>Dados e entrega</li>
          <li className="flex items-center gap-2 text-store-muted"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-store-raised">2</span>Pagamento</li>
          <li className="flex items-center gap-2 text-store-muted"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-store-raised">3</span>Confirmação</li>
        </ol>
      </nav>

      <form
        id="checkout-form"
        ref={formRef}
        onSubmit={send}
        noValidate
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"
      >
        <fieldset
          disabled={submitting}
          className="min-w-0 space-y-5 disabled:opacity-60"
        >
          <details className={`${box} lg:hidden`}>
            <summary className="cursor-pointer text-sm font-medium">Ver peças e resumo do pedido</summary>
            <div className="mt-5">{summary}</div>
          </details>
          <section className={box}>
            <h2 className="mb-5 text-lg font-medium">
              Seus dados
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {input('name', true)}
              {input('document', true)}
              {input('email')}
              {input('phone')}
              <p className="text-[11px] leading-5 text-store-muted sm:col-span-2">Seus dados de contato são registrados para acompanhar esta compra.</p>
            </div>
          </section>

          <section className={box}>
            <h2 className="mb-4 text-lg font-medium">
              Endereço para entrega
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {input('cep')}
              {input('state')}

              <p
                role="status"
                className="text-xs text-store-muted sm:col-span-2"
              >
                {addressStatus ||
                  'Digite o CEP para buscar o endereço e as opções de entrega.'}
              </p>

              {input('street', true)}
              {input('number')}
              {input('complement')}
              {input('district')}
              {input('city')}
            </div>

            {postalCode.length === 8 && (
              <button
                type="button"
                onClick={() =>
                  setAddressAttempt(
                    value => value + 1
                  )
                }
                className="mt-3 text-xs underline"
              >
                Buscar endereço novamente
              </button>
            )}
          </section>

          <section className={box}>
            <h2 className="text-lg font-medium">
              Cupom de desconto
            </h2>

            <div className="mt-4 flex items-end gap-3">
              <label
                htmlFor="checkout-coupon"
                className="min-w-0 flex-1 text-xs"
              >
                Código

                <input
                  id="checkout-coupon"
                  value={couponDraft}
                  onChange={event => {
                    setCouponDraft(
                      event.target.value.toUpperCase()
                    )

                    setCouponError('')
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      applyCoupon()
                    }
                  }}
                  maxLength={40}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(
                    couponError ||
                    (coupon && reviewError)
                  )}
                  aria-describedby="checkout-coupon-status"
                  className={
                    'mt-2 min-h-[46px] w-full rounded-xl border bg-store-surface px-3 text-base uppercase sm:text-sm ' +
                    (couponError ||
                    (coupon && reviewError)
                      ? 'border-red-600'
                      : 'border-store-border')
                  }
                />
              </label>

              <button
                type="button"
                onClick={applyCoupon}
                disabled={
                  !requestId ||
                  !couponDraft.trim() ||
                  reviewing
                }
                className={button}
              >
                Aplicar
              </button>
            </div>

            <div
              id="checkout-coupon-status"
              className="mt-3 text-xs"
              aria-live="polite"
            >
              {couponError ||
              (coupon && reviewError) ? (
                <p className="text-store-error">
                  ⚠ {couponError || reviewError}
                </p>
              ) : coupon && quote ? (
                <p className="text-store-success">
                  {(quote?.coupon?.discount_cents || 0) > 0
                    ? `Cupom ${coupon}: desconto de ${formatPrice((quote?.coupon?.discount_cents || 0) / 100)} incluído no resumo.`
                    : 'O cupom não acrescentou desconto aos produtos desta seleção. Confira os benefícios no resumo.'}
                </p>
              ) : coupon && reviewing ? (
                'Conferindo cupom…'
              ) : null}
            </div>

            {(coupon || couponDraft) && (
              <button
                type="button"
                onClick={() => {
                  setCoupon('')
                  setCouponDraft('')
                  setCouponError('')

                  setReviewAttempt(
                    value => value + 1
                  )
                }}
                className="mt-2 min-h-[44px] text-xs underline"
              >
                Remover cupom
              </button>
            )}

            <p className="mt-2 text-[11px] leading-relaxed text-store-muted">
              {STORE_INFORMATION.couponCombination}
            </p>

            {quote?.coupon
              ?.customer_check_required && (
              <p className="mt-2 text-xs text-store-muted">
                O limite por cliente será validado com
                seu CPF ou CNPJ.
              </p>
            )}
          </section>

          <section className={box}>
            <h2 className="text-lg font-medium">
              Opções de entrega
            </h2>

            {postalCode.length !== 8 ? (
              <p className="mt-3 text-sm text-store-muted">
                Preencha o CEP para ver as opções de entrega.
              </p>
            ) : !quote ? (
              <p className="mt-3 text-sm text-store-muted">
                {reviewError
                  ? 'Resolva o aviso dos valores ou do cupom para consultar o frete.'
                  : 'Conferindo os valores antes de consultar a entrega…'}
              </p>
            ) : !currentShipping ||
              currentShipping.status === 'loading' ? (
              <p
                role="status"
                className="mt-3 text-sm text-store-muted"
              >
                Buscando as opções de entrega…
              </p>
            ) : null}

            {currentShipping?.message && (
              <p
                role={
                  currentShipping.status === 'error'
                    ? 'alert'
                    : 'status'
                }
                className={
                  'mt-3 text-sm ' +
                  (currentShipping.status === 'error'
                    ? 'text-store-error'
                    : 'text-store-muted')
                }
              >
                {currentShipping.message}
              </p>
            )}

            <div className="mt-4 space-y-3">
              {options.map(option => (
                <label
                  key={option.id}
                  className={
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-4 ' +
                    (selected === option.id
                      ? 'border-[#947B57] bg-store-raised'
                      : 'border-store-border')
                  }
                >
                  <input
                    type="radio"
                    name="delivery"
                    checked={selected === option.id}
                    onChange={() =>
                      setSelected(option.id)
                    }
                    className="mt-1"
                  />

                  <span className="flex-1">
                    <span className="block text-sm font-medium">
                      {option.company} · {option.service}
                    </span>

                    <span className="mt-1 block text-xs text-store-muted">
                      {option.manual
                        ? 'Frete combinado com a equipe'
                        : option.days === null
                          ? 'Prazo a confirmar'
                          : `${option.days} dia(s) estimado(s) após a confirmação do pagamento`}
                    </span>
                  </span>

                  <strong className="text-sm">
                    {option.manual
                      ? 'A confirmar'
                      : option.amount_cents === 0 ? 'Grátis' : formatPrice(
                          option.amount_cents / 100
                        )}
                  </strong>
                </label>
              ))}
            </div>

            {quote &&
              postalCode.length === 8 &&
              currentShipping?.status !== 'loading' && (
                <button
                  type="button"
                  onClick={() =>
                    setShippingAttempt(
                      value => value + 1
                    )
                  }
                  className="mt-3 min-h-[44px] text-xs underline"
                >
                  {currentShipping?.status === 'error'
                    ? 'Tentar consultar novamente'
                    : 'Atualizar opções de entrega'}
                </button>
              )}
          </section>

          <div hidden aria-hidden="true">
            <label>
              Website

              <input
                name="website"
                tabIndex={-1}
                autoComplete="off"
              />
            </label>
          </div>

          <p className="text-xs leading-relaxed text-store-muted">
            Seus dados serão usados para preparar o
            pagamento e a entrega. Continuar não confirma
            uma compra nem realiza cobrança. O pedido será
            registrado somente após a aprovação do pagamento.
          </p>
        </fieldset>

        <aside
          className={`${box} hidden lg:sticky lg:top-6 lg:block lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto`}
        >
          {summary}
          <div className="mt-5 rounded-xl bg-store-canvas p-4 text-xs leading-6 text-store-muted">
            <p className="font-medium text-store-text">Como você prefere pagar?</p>
            <p>Escolha Pix ou cartão de crédito na próxima etapa. O valor é conferido antes do pagamento.</p>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className={`${button} mt-6 w-full`}
          >
            {submitting
              ? 'Abrindo pagamento…'
              : delivery?.manual
                ? 'Conferir frete'
                : 'Continuar para pagamento'}
          </button>
        </aside>

        {message && (
          <p
            role="alert"
            className="text-sm text-store-error lg:col-span-2"
          >
            {message}
          </p>
        )}

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-store-border bg-store-surface px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <div aria-live="polite">
              <p className="text-xs text-store-muted">
                {delivery && !delivery.manual
                  ? 'Total com frete'
                  : 'Subtotal sem frete'}
              </p>

              <strong className="text-lg">
                {quote
                  ? formatPrice(total / 100)
                  : 'Conferindo…'}
              </strong>

              {discount > 0 && (
                <p className="text-[11px] text-store-success">
                  Cupom: −{' '}
                  {formatPrice(discount / 100)}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className={button}
            >
              {submitting
                ? 'Abrindo pagamento…'
                : delivery?.manual
                  ? 'Conferir frete'
                  : 'Continuar para pagamento'}
            </button>
          </div>
        </div>
      </form>
    </main>
  )
}
