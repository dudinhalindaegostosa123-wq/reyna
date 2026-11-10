'use client'

import { useEffect, useRef, useState } from 'react'
import { CHECKOUT_STATES } from '@/lib/checkout'

type Address = {
  street: string
  district: string
  city: string
  state: string
}

const empty: Address = {
  street: '',
  district: '',
  city: '',
  state: '',
}

const keys: (keyof Address)[] = [
  'street', 'district', 'city', 'state'
]

const field = 'mt-1 min-h-[46px] w-full rounded-xl border border-store-border bg-store-surface px-3 py-2 text-base sm:text-sm'

export default function CheckoutAddressFields({
  cep,
  onCepChange,
}: {
  cep: string
  onCepChange: (value: string) => void
}) {
  const [address, setAddress] = useState<Address>(empty)
  const [number, setNumber] = useState('')
  const [complement, setComplement] = useState('')
  const [status, setStatus] = useState('')
  const [attempt, setAttempt] = useState(0)

  const revisions = useRef({
    street: 0,
    district: 0,
    city: 0,
    state: 0,
  })

  const postalCode = cep.replace(/\D/g, '')

  useEffect(() => {
    if (postalCode.length !== 8) {
      setStatus('')
      return
    }

    let active = true
    const controller = new AbortController()
    const initial = { ...revisions.current }
    let timeout: ReturnType<typeof setTimeout> | undefined

    setStatus('Buscando endereço…')

    const timer = setTimeout(async () => {
      timeout = setTimeout(() => controller.abort(), 8000)

      try {
        const response = await fetch(
          `https://viacep.com.br/ws/${postalCode}/json/`,
          {
            signal: controller.signal,
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
          }
        )

        if (!response.ok) throw new Error('CEP_LOOKUP')

        const data: unknown = await response.json()

        if (!active) return

        if (
          !data ||
          typeof data !== 'object' ||
          Array.isArray(data)
        ) {
          throw new Error('CEP_LOOKUP')
        }

        const result = data as Record<string, unknown>

        if (result.erro) {
          setStatus(
            'CEP não encontrado. Confira o CEP ou preencha o endereço manualmente.'
          )
          return
        }

        if (
          String(result.cep || '').replace(/\D/g, '') !==
          postalCode
        ) {
          throw new Error('CEP_LOOKUP')
        }

        const text = (value: unknown, max: number) =>
          typeof value === 'string'
            ? value.trim().slice(0, max)
            : ''

        const state = text(result.uf, 2)

        const found: Address = {
          street: text(result.logradouro, 180),
          district: text(result.bairro, 100),
          city: text(result.localidade, 100),
          state: CHECKOUT_STATES.includes(state) ? state : '',
        }

        setAddress(previous => {
          const next = { ...previous }

          for (const key of keys) {
            if (revisions.current[key] === initial[key]) {
              next[key] = found[key]
            }
          }

          return next
        })

        setStatus(
          found.street && found.district &&
          found.city && found.state
            ? 'Endereço encontrado. Confira os dados e informe o número.'
            : 'CEP localizado. Complete os campos que ficaram vazios e informe o número.'
        )
      } catch {
        if (active) {
          setStatus(
            'Não foi possível buscar o CEP agora. Você pode preencher o endereço manualmente.'
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
  }, [postalCode, attempt])

  function edit(key: keyof Address, value: string) {
    revisions.current[key]++
    setAddress(previous => ({ ...previous, [key]: value }))
  }

  return (
    <section className="rounded-3xl border border-store-border bg-store-surface p-5 sm:p-7">
      <h2 className="mb-5 text-lg font-medium">
        Endereço para entrega
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs">
          CEP
          <input
            name="cep"
            value={cep}
            onChange={event => {
              const digits = event.target.value
                .replace(/\D/g, '')
                .slice(0, 8)

              if (digits !== postalCode) {
                for (const key of keys) revisions.current[key]++
                setAddress({ ...empty })
                setNumber('')
                setComplement('')
                setStatus('')
              }

              onCepChange(
                digits.length > 5
                  ? digits.slice(0, 5) + '-' + digits.slice(5)
                  : digits
              )
            }}
            required
            maxLength={9}
            inputMode="numeric"
            autoComplete="postal-code"
            aria-describedby="checkout-cep-status"
            className={field}
          />
        </label>

        <label className="text-xs">
          Estado
          <select
            name="state"
            value={address.state}
            onChange={event => edit('state', event.target.value)}
            required
            autoComplete="address-level1"
            className={field}
          >
            <option value="">Selecione</option>
            {CHECKOUT_STATES.map(state => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
        </label>

        <div className="sm:col-span-2">
          <p
            id="checkout-cep-status"
            role="status"
            className="text-xs leading-relaxed text-store-muted"
          >
            {status || 'Digite o CEP para buscar seu endereço.'}
          </p>

          {postalCode.length === 8 && (
            <button
              type="button"
              onClick={() => setAttempt(value => value + 1)}
              className="mt-2 py-1 text-xs underline"
            >
              Buscar endereço novamente
            </button>
          )}
        </div>

        <label className="text-xs sm:col-span-2">
          Rua ou avenida
          <input name="street" value={address.street}
            onChange={event => edit('street', event.target.value)}
            required maxLength={180} autoComplete="address-line1"
            className={field} />
        </label>

        <label className="text-xs">
          Número
          <input name="number" value={number}
            onChange={event => setNumber(event.target.value)}
            required maxLength={30} className={field} />
        </label>

        <label className="text-xs">
          Complemento (opcional)
          <input name="complement" value={complement}
            onChange={event => setComplement(event.target.value)}
            maxLength={180} autoComplete="address-line2"
            className={field} />
        </label>

        <label className="text-xs">
          Bairro
          <input name="district" value={address.district}
            onChange={event => edit('district', event.target.value)}
            required maxLength={100} className={field} />
        </label>

        <label className="text-xs">
          Cidade
          <input name="city" value={address.city}
            onChange={event => edit('city', event.target.value)}
            required maxLength={100} autoComplete="address-level2"
            className={field} />
        </label>
      </div>
    </section>
  )
}
