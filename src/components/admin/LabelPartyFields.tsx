'use client'

import { useId, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { PARTY_FIELDS, partyFieldError } from '@/lib/label-draft'
import type {
  LabelFields,
  PartyFieldName,
} from '@/lib/label-draft'

interface PartyInputProps {
  name: PartyFieldName
  label: string
  max: number
  initialValue: string
  documentOptional?: boolean
}

function PartyInput({
  name,
  label,
  max,
  initialValue,
  documentOptional = false,
}: PartyInputProps) {
  const id = useId()
  const errorId = `${id}-error`

  const [error, setError] = useState(() =>
    partyFieldError(name, initialValue, documentOptional)
  )

  return (
    <div className="text-xs">
      <label
        htmlFor={id}
        className="flex items-center gap-2"
      >
        {label}

        {error && (
          <AlertTriangle
            size={15}
            className="shrink-0 text-red-700"
            aria-hidden="true"
          />
        )}
      </label>

      <input
        id={id}
        name={name}
        defaultValue={initialValue}
        maxLength={max}
        autoComplete="off"
        autoCapitalize={
          name === 'state' || name === 'document'
            ? 'characters'
            : undefined
        }
        inputMode={
          name === 'email'
            ? 'email'
            : name === 'phone'
              ? 'tel'
              : name === 'cep'
                ? 'numeric'
                : undefined
        }
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onBlur={event => {
          setError(
            partyFieldError(name, event.currentTarget.value, documentOptional)
          )
        }}
        onChange={event => {
          if (error) {
            setError(
              partyFieldError(name, event.currentTarget.value, documentOptional)
            )
          }
        }}
        className={`mt-2 min-h-[44px] w-full rounded-xl border bg-white px-3 text-base sm:text-sm ${
          error
            ? 'border-red-600 focus:outline-red-600'
            : 'border-[#DDD4C7]'
        }`}
      />

      {error && (
        <p
          id={errorId}
          className="mt-2 text-xs text-red-700"
          aria-live="polite"
        >
          {error}
        </p>
      )}
    </div>
  )
}

export default function LabelPartyFields({
  fields,
  documentOptional = false,
}: {
  fields: LabelFields
  documentOptional?: boolean
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {PARTY_FIELDS.map(([name, label, max]) => (
        <PartyInput
          key={`${name}:${fields[name] || ''}`}
          name={name}
          label={name === 'document' && documentOptional ? label + ' (opcional no painel)' : label}
          documentOptional={documentOptional}
          max={max}
          initialValue={fields[name] || ''}
        />
      ))}
    </div>
  )
}
