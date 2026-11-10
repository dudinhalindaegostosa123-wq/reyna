'use client'

import { useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'

import type { Customer } from '@/lib/admin-sales'
import { saveCustomer } from '../pedidos/actions'

interface CustomerValues {
  name: string
  email: string
  phone: string
  notes: string
}

type FieldName = keyof CustomerValues

type FieldErrors = Partial<
  Record<FieldName, string>
>

function fieldError(
  name: FieldName,
  value: string
): string {
  const text = value.trim()

  switch (name) {
    case 'name':
      if (!text) {
        return 'Preencha o nome do cliente.'
      }

      return text.length > 180
        ? 'O nome deve ter até 180 caracteres.'
        : ''

    case 'email':
      if (!text) return ''

      return (
        text.length <= 254 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
      )
        ? ''
        : 'Confira o e-mail informado.'

    case 'phone':
      if (!text) return ''

      return /^\d{10,15}$/.test(
        text.replace(/\D/g, '')
      )
        ? ''
        : 'Informe de 10 a 15 números, incluindo o DDD.'

    case 'notes':
      return value.length > 2000
        ? 'Use até 2.000 caracteres nas observações.'
        : ''
  }
}

const fieldClass =
  'mt-2 block min-h-[44px] min-w-0 w-full rounded-xl border bg-white px-3 py-2 text-base outline-none sm:text-sm'

export default function CustomerForm({
  customer,
}: {
  customer?: Customer
}) {
  const router = useRouter()
  const formId = useId()
  const saving = useRef(false)

  const [id, setId] = useState(
    customer?.id || ''
  )

  const [values, setValues] = useState<CustomerValues>({
    name: customer?.name || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    notes: customer?.notes || '',
  })

  const [errors, setErrors] = useState<FieldErrors>({})
  const [pending, setPending] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')

  function update(
    name: FieldName,
    value: string
  ) {
    setValues(previous => ({
      ...previous,
      [name]: value,
    }))

    setDirty(true)
    setMessage('')

    if (
      submitted ||
      errors[name] !== undefined
    ) {
      setErrors(previous => ({
        ...previous,
        [name]: fieldError(name, value),
      }))
    }
  }

  function check(
    name: FieldName,
    value: string
  ) {
    setErrors(previous => ({
      ...previous,
      [name]: fieldError(name, value),
    }))
  }

  return (
    <form
      noValidate
      className="min-w-0 rounded-3xl border border-[#E5DED3] bg-white p-5 sm:p-7"
      onSubmit={async event => {
        event.preventDefault()

        if (saving.current) return

        const form = event.currentTarget

        setSubmitted(true)
        setMessage('')

        const names: FieldName[] = [
          'name',
          'email',
          'phone',
          'notes',
        ]

        const nextErrors: FieldErrors = {}

        for (const name of names) {
          nextErrors[name] = fieldError(
            name,
            values[name]
          )
        }

        setErrors(nextErrors)

        const firstError = names.find(
          name => Boolean(nextErrors[name])
        )

        if (firstError) {
          const element = form.elements.namedItem(
            firstError
          ) as HTMLInputElement | HTMLTextAreaElement | null

          element?.focus()

          setMessage(
            'Confira os campos destacados antes de salvar.'
          )

          return
        }

        const customerId =
          id || crypto.randomUUID()

        setId(customerId)

        const payload = {
          id: customerId,
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone.replace(/\D/g, ''),
          notes: values.notes.trim(),
        }

        saving.current = true
        setPending(true)

        try {
          const result = await saveCustomer(payload)

          if (result.error) {
            setMessage(result.error)
            return
          }

          setValues({
            name: payload.name,
            email: payload.email,
            phone: payload.phone,
            notes: payload.notes,
          })

          setErrors({})
          setDirty(false)
          setSubmitted(false)
          setMessage('Cliente salvo com sucesso.')

          const params = new URLSearchParams(
            window.location.search
          )

          const currentCustomer = params.get('edit')

          params.set('edit', customerId)
          params.delete('novo')

          if (currentCustomer === customerId) {
            router.refresh()
          } else {
            params.delete('history')

            router.push(
              '/admin/clientes?' + params.toString()
            )
          }
        } catch {
          setMessage(
            'Não foi possível confirmar o salvamento. Confira a lista de clientes antes de tentar novamente.'
          )
        } finally {
          saving.current = false
          setPending(false)
        }
      }}
    >
      <div className="mb-5">
        <h2 className="text-lg font-medium">
          {customer
            ? 'Editar cliente'
            : 'Novo cliente'}
        </h2>

        <p className="mt-2 text-xs leading-relaxed text-[#81796C]">
          Nome é obrigatório. E-mail, telefone e
          observações são opcionais.
        </p>
      </div>

      <fieldset
        disabled={pending}
        className="min-w-0 space-y-4 disabled:opacity-60"
      >
        {[
          {
            name: 'name' as const,
            label: 'Nome',
            type: 'text',
            max: 180,
            autoComplete: 'name',
          },
          {
            name: 'email' as const,
            label: 'E-mail',
            type: 'email',
            max: 254,
            autoComplete: 'email',
          },
          {
            name: 'phone' as const,
            label: 'Telefone com DDD',
            type: 'tel',
            max: 25,
            autoComplete: 'tel',
          },
        ].map(field => {
          const error = errors[field.name]
          const inputId =
            `${formId}-${field.name}`
          const errorId =
            `${inputId}-error`

          return (
            <div
              key={field.name}
              className="min-w-0 text-xs"
            >
              <label
                htmlFor={inputId}
                className="flex items-center gap-2"
              >
                {field.label}

                {field.name === 'name' && (
                  <span className="text-[#81796C]">
                    *
                  </span>
                )}

                {error && (
                  <AlertTriangle
                    size={15}
                    aria-hidden="true"
                    className="shrink-0 text-red-700"
                  />
                )}
              </label>

              <input
                id={inputId}
                name={field.name}
                type={field.type}
                required={field.name === 'name'}
                maxLength={field.max}
                autoComplete={field.autoComplete}
                value={values[field.name]}
                onChange={event =>
                  update(
                    field.name,
                    event.currentTarget.value
                  )
                }
                onBlur={event =>
                  check(
                    field.name,
                    event.currentTarget.value
                  )
                }
                aria-invalid={
                  error ? true : undefined
                }
                aria-describedby={
                  error ? errorId : undefined
                }
                className={
                  fieldClass +
                  (
                    error
                      ? ' border-red-600 focus:border-red-600'
                      : ' border-[#DCD4C8] focus:border-[#947B57]'
                  )
                }
              />

              {error && (
                <p
                  id={errorId}
                  aria-live="polite"
                  className="mt-2 text-xs text-red-700"
                >
                  {error}
                </p>
              )}
            </div>
          )
        })}

        <div className="min-w-0 text-xs">
          <label
            htmlFor={`${formId}-notes`}
            className="flex items-center gap-2"
          >
            Observações internas

            {errors.notes && (
              <AlertTriangle
                size={15}
                aria-hidden="true"
                className="text-red-700"
              />
            )}
          </label>

          <textarea
            id={`${formId}-notes`}
            name="notes"
            rows={4}
            maxLength={2000}
            value={values.notes}
            onChange={event =>
              update(
                'notes',
                event.currentTarget.value
              )
            }
            onBlur={event =>
              check(
                'notes',
                event.currentTarget.value
              )
            }
            aria-invalid={
              errors.notes ? true : undefined
            }
            aria-describedby={
              errors.notes
                ? `${formId}-notes-error`
                : undefined
            }
            className={
              fieldClass +
              (
                errors.notes
                  ? ' border-red-600'
                  : ' border-[#DCD4C8]'
              )
            }
          />

          {errors.notes && (
            <p
              id={`${formId}-notes-error`}
              className="mt-2 text-red-700"
            >
              {errors.notes}
            </p>
          )}

          <p className="mt-2 text-right text-[11px] text-[#81796C]">
            {values.notes.length}/2000
          </p>
        </div>

        {dirty && (
          <p className="text-xs text-amber-900">
            Existem alterações não salvas.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] rounded-full bg-[#292621] px-6 py-3 text-sm text-white disabled:opacity-40"
        >
          {pending
            ? 'Salvando…'
            : customer
              ? 'Salvar alterações'
              : 'Cadastrar cliente'}
        </button>
      </fieldset>

      <p
        role="status"
        className="mt-4 text-sm leading-relaxed"
      >
        {message}
      </p>

      {customer && (
        <p className="mt-4 text-[11px] leading-relaxed text-[#81796C]">
          Alterar este cadastro não modifica os
          dados já registrados nos pedidos anteriores.
        </p>
      )}
    </form>
  )
}
