'use client'

import {
  useEffect,
  useId,
  useState,
} from 'react'
import {
  useFormState,
  useFormStatus,
} from 'react-dom'
import { saveCustomerProfile } from './profile-actions'
import type {
  ProfileState,
  ProfileValues,
} from './profile-actions'

interface FieldsProps {
  name: string
  phone: string
  nameError: string
  phoneError: string
  id: string
  onName: (value: string) => void
  onPhone: (value: string) => void
}

function ProfileFields({
  name,
  phone,
  nameError,
  phoneError,
  id,
  onName,
  onPhone,
}: FieldsProps) {
  const { pending } = useFormStatus()

  const field =
    'mt-2 min-h-[44px] w-full rounded-xl border bg-store-surface px-3 text-base sm:text-sm'

  return (
    <fieldset
      disabled={pending}
      aria-busy={pending}
      className="space-y-4 disabled:opacity-70"
    >
      <div>
        <label
          htmlFor={`${id}-name`}
          className="text-xs text-store-muted"
        >
          Nome completo / razão social
        </label>

        <input
          id={`${id}-name`}
          name="name"
          value={name}
          onChange={event =>
            onName(event.currentTarget.value)
          }
          required
          maxLength={180}
          autoComplete="name"
          aria-invalid={
            nameError ? true : undefined
          }
          aria-describedby={
            nameError
              ? `${id}-name-error`
              : undefined
          }
          className={`${field} ${
            nameError
              ? 'border-red-600'
              : 'border-store-border'
          }`}
        />

        {nameError && (
          <p
            id={`${id}-name-error`}
            className="mt-2 text-xs text-store-error"
          >
            {nameError}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor={`${id}-phone`}
          className="text-xs text-store-muted"
        >
          Telefone com DDD
        </label>

        <input
          id={`${id}-phone`}
          name="phone"
          value={phone}
          onChange={event =>
            onPhone(event.currentTarget.value)
          }
          required
          maxLength={25}
          type="tel"
          autoComplete="tel-national"
          inputMode="tel"
          placeholder="(11) 99999-9999"
          aria-invalid={
            phoneError ? true : undefined
          }
          aria-describedby={
            phoneError
              ? `${id}-phone-error`
              : undefined
          }
          className={`${field} ${
            phoneError
              ? 'border-red-600'
              : 'border-store-border'
          }`}
        />

        {phoneError && (
          <p
            id={`${id}-phone-error`}
            className="mt-2 text-xs text-store-error"
          >
            {phoneError}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] rounded-full bg-store-action px-6 py-3 text-xs text-white disabled:opacity-60"
      >
        {pending
          ? 'Salvando…'
          : 'Salvar meus dados'}
      </button>
    </fieldset>
  )
}

export default function CustomerProfileForm({
  initial,
}: {
  initial: ProfileValues
}) {
  const id = useId()

  const [name, setName] = useState(
    initial.name
  )

  const [phone, setPhone] = useState(
    initial.phone
  )

  const [baseline, setBaseline] = useState(
    initial
  )

  const initialState: ProfileState = {
    error: '',
  }

  const [state, action] = useFormState(
    saveCustomerProfile,
    initialState
  )

  useEffect(() => {
    if (state.saved) {
      setName(state.saved.name)
      setPhone(state.saved.phone)
      setBaseline(state.saved)
    }
  }, [state.saved])

  const nameError =
    state.values?.name === name
      ? state.fieldErrors?.name || ''
      : ''

  const phoneError =
    state.values?.phone === phone
      ? state.fieldErrors?.phone || ''
      : ''

  const saved = Boolean(
    state.saved &&
    name === baseline.name &&
    phone === baseline.phone
  )

  return (
    <form
      action={action}
      className="mt-5"
    >
      <input
        type="hidden"
        name="expected_name"
        value={baseline.name}
      />

      <input
        type="hidden"
        name="expected_phone"
        value={baseline.phone}
      />

      <ProfileFields
        id={id}
        name={name}
        phone={phone}
        nameError={nameError}
        phoneError={phoneError}
        onName={setName}
        onPhone={setPhone}
      />

      {state.error && (
        <p
          role="alert"
          className="mt-4 text-sm text-store-error"
        >
          {state.error}
        </p>
      )}

      {saved && (
        <p
          role="status"
          className="mt-4 text-sm text-store-success"
        >
          Seus dados foram salvos.
        </p>
      )}
    </form>
  )
}
