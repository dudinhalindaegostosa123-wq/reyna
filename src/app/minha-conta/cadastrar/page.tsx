'use client'

import Link from 'next/link'
import { WHOLESALE_STOREFRONT_ENABLED } from '@/lib/storefront-features'
import { useEffect, useState } from 'react'
import {
  useFormState,
  useFormStatus,
} from 'react-dom'

import { normalizeCheckoutDocument } from '@/lib/checkout-document'
import { registerCustomer } from './actions'
import type { RegisterState } from './actions'

const fields = [
  ['name', 'Nome completo / razão social', 'text', 'name', 180],
  ['email', 'E-mail', 'email', 'email', 254],
  ['phone', 'WhatsApp com DDD', 'tel', 'tel', 25],
  ['document', 'CPF ou CNPJ', 'text', 'off', 24],
  ['password', 'Senha', 'password', 'new-password', 128],
  [
    'password_confirmation',
    'Confirme a senha',
    'password',
    'new-password',
    128,
  ],
] as const

type Name = typeof fields[number][0]
type Values = Record<Name, string>

const empty: Values = {
  name: '',
  email: '',
  phone: '',
  document: '',
  password: '',
  password_confirmation: '',
}

function validation(
  name: Name,
  values: Values
): string {
  const value = values[name]

  if (
    name === 'name' &&
    (
      !value.trim() ||
      value.trim().length > 180 ||
      /[\u0000-\u001F\u007F]/.test(value)
    )
  ) {
    return 'Informe seu nome completo ou razão social.'
  }

  if (
    name === 'email' &&
    (
      value.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    )
  ) {
    return 'Informe um e-mail válido.'
  }

  if (
    name === 'phone' &&
    !/^\d{10,11}$/.test(value.replace(/\D/g, ''))
  ) {
    return 'Informe seu telefone com DDD.'
  }

  if (name === 'document') {
    try {
      normalizeCheckoutDocument(value)
    } catch (error) {
      return error instanceof Error
        ? error.message
        : 'Informe um CPF ou CNPJ válido.'
    }
  }

  if (
    name === 'password' &&
    (value.length < 8 || value.length > 128)
  ) {
    return 'Use uma senha de 8 a 128 caracteres.'
  }

  if (
    name === 'password_confirmation' &&
    (!value || value !== values.password)
  ) {
    return 'As senhas precisam ser iguais.'
  }

  return ''
}

function RegistrationFields({
  state,
}: {
  state: RegisterState
}) {
  const { pending } = useFormStatus()

  const [values, setValues] =
    useState<Values>(empty)

  const [touched, setTouched] = useState<
    Partial<Record<Name, boolean>>
  >({})

  const [changed, setChanged] = useState<
    Partial<Record<Name, boolean>>
  >({})

  const [type, setType] = useState('retail')

  useEffect(() => {
    setChanged({})
  }, [state])

  return (
    <fieldset
      disabled={pending}
      className="space-y-5 disabled:opacity-60"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(
          ([
            name,
            label,
            inputType,
            autocomplete,
            max,
          ]) => {
            const error =
              (
                touched[name]
                  ? validation(name, values)
                  : ''
              ) ||
              (
                !changed[name]
                  ? state.fieldErrors?.[name] || ''
                  : ''
              )

            const id = `register-${name}`

            return (
              <div
                key={name}
                className={
                  name === 'name' || name === 'email'
                    ? 'sm:col-span-2'
                    : ''
                }
              >
                <label
                  htmlFor={id}
                  className="text-xs"
                >
                  {label}{' '}

                  {error && (
                    <span
                      aria-hidden="true"
                      className="text-store-error"
                    >
                      ⚠
                    </span>
                  )}
                </label>

                <input
                  id={id}
                  name={name}
                  type={inputType}
                  value={values[name]}
                  onChange={event => {
                    const value =
                      name === 'document'
                        ? event.target.value.toUpperCase()
                        : event.target.value

                    setValues(previous => ({
                      ...previous,
                      [name]: value,
                    }))

                    setChanged(previous => ({
                      ...previous,
                      [name]: true,
                    }))
                  }}
                  onBlur={() =>
                    setTouched(previous => ({
                      ...previous,
                      [name]: true,
                    }))
                  }
                  required
                  maxLength={max}
                  autoComplete={autocomplete}
                  autoCapitalize={
                    name === 'document'
                      ? 'characters'
                      : name === 'email'
                        ? 'none'
                        : undefined
                  }
                  spellCheck={
                    name === 'document' || name === 'email'
                      ? false
                      : undefined
                  }
                  aria-invalid={Boolean(error)}
                  aria-describedby={
                    error
                      ? `${id}-error`
                      : name === 'password'
                        ? 'register-password-help'
                        : undefined
                  }
                  className={
                    'mt-2 min-h-[48px] w-full rounded-xl border bg-store-surface px-4 text-base focus:outline-offset-2 sm:text-sm ' +
                    (
                      error
                        ? 'border-red-600 focus:outline-red-600'
                        : 'border-store-border focus:outline-[#947B57]'
                    )
                  }
                />

                {error && (
                  <p
                    id={`${id}-error`}
                    aria-live="polite"
                    className="mt-2 text-xs text-store-error"
                  >
                    {error}
                  </p>
                )}

                {name === 'password' && (
                  <p
                    id="register-password-help"
                    className="mt-2 text-[11px] text-store-muted"
                  >
                    Pelo menos 8 caracteres. Prefira uma
                    senha exclusiva para sua conta.
                  </p>
                )}
              </div>
            )
          }
        )}
      </div>

      {!WHOLESALE_STOREFRONT_ENABLED && <input type="hidden" name="account_type" value="retail" />}
      {WHOLESALE_STOREFRONT_ENABLED && <fieldset className="rounded-2xl border border-store-border p-4">
        <legend className="px-2 text-xs font-medium">
          Como deseja comprar?
        </legend>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm">
          <input
            type="radio"
            name="account_type"
            value="retail"
            checked={type === 'retail'}
            onChange={() => setType('retail')}
          />
          Comprar na loja
        </label>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm">
          <input
            type="radio"
            name="account_type"
            value="wholesale"
            checked={type === 'wholesale'}
            onChange={() => setType('wholesale')}
          />
          Solicitar acesso ao atacado
        </label>

        {type === 'wholesale' && (
          <p className="mt-2 text-xs leading-relaxed text-store-muted">
            Aceitamos CPF ou CNPJ. A equipe analisará seu
            cadastro antes de liberar as condições de atacado.
          </p>
        )}
      </fieldset>}

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
        Usaremos seus dados para criar sua conta e atender
        seus pedidos. Você precisará confirmar o e-mail informado.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="min-h-[48px] w-full rounded-full bg-store-action px-6 py-3 text-sm text-white disabled:opacity-50"
      >
        {pending ? 'Enviando…' : 'Criar minha conta'}
      </button>

      {state.error && (
        <p
          role="alert"
          className="text-sm leading-relaxed text-store-error"
        >
          {state.error}
        </p>
      )}
    </fieldset>
  )
}

export default function CustomerRegistrationPage({ searchParams = {} }: {
  searchParams?: { retorno?: string | string[] }
}) {
  const returningToCheckout = searchParams.retorno === 'checkout'
  const loginHref = returningToCheckout ? '/minha-conta/entrar?retorno=checkout' : '/minha-conta/entrar'
  const [state, action] = useFormState(
    registerCustomer,
    { error: '' }
  )

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-16">
      <Link
        href={loginHref}
        className="inline-flex min-h-[44px] items-center text-xs text-store-muted underline"
      >
        ← Já tenho conta
      </Link>

      <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-store-accent">
        Lunarity
      </p>

      <h1 className="mt-3 text-3xl font-medium tracking-tight">
        Criar minha conta
      </h1>

      <p className="mb-7 mt-3 text-sm leading-relaxed text-store-muted">
        Cadastre seus dados para acessar sua conta e
        acompanhar seus próximos pedidos.
      </p>

      <section className="rounded-3xl border border-store-border bg-store-surface p-6 sm:p-8">
        {state.success ? (
          <div role="status">
            <h2 className="text-lg font-medium">
              Confira seu e-mail
            </h2>

            <p className="mt-3 text-sm leading-relaxed text-store-muted">
              Para continuar, confira sua caixa de entrada
              e o spam. Use o link de confirmação recebido.
              Se você já possui uma conta, entre com sua senha.
            </p>

            <Link
              href={loginHref}
              className="mt-6 inline-flex min-h-[46px] items-center rounded-full bg-store-action px-6 py-3 text-sm text-white"
            >
              Ir para a entrada
            </Link>
          </div>
        ) : (
          <form action={action} noValidate>
            <input type="hidden" name="return_to" value={returningToCheckout ? '/checkout' : '/minha-conta'} />
            <RegistrationFields state={state} />
          </form>
        )}
      </section>
    </main>
  )
}
