'use client'

import type { LabelScope } from '@/lib/label-scope'
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { LabelData } from '@/lib/label-draft'
import {
  PACKAGE_FIELDS,
  packageFieldError,
  invoiceKeyError,
} from '@/lib/label-preparation-validation'
import LabelPartyFields from './LabelPartyFields'
import { saveLabelDraft } from '@/app/admin/frete/label-actions'
import { saleMoney } from '@/lib/admin-sales'

const inputClass =
  'mt-2 min-h-[44px] w-full rounded-xl border bg-white px-3 text-base sm:text-sm'

export default function LabelPreparation({
  initial,
  scope = 'current',
}: {
  initial: LabelData
  scope?: LabelScope
}) {
  const [draft, setDraft] = useState(initial)
  const [editing, setEditing] = useState(initial.fields)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const prefix = `label-${draft.id}`

  const invoiceError = invoiceKeyError(
    editing.document_mode || '',
    editing.invoice_key || ''
  )

  const disabled =
    busy ||
    draft.status === 'cancelled' ||
    draft.status === 'refunded'

  function goTo(section: string) {
    const element = document.getElementById(
      `${prefix}-${section}`
    )

    element?.focus()
    element?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  return (
    <section className="mb-5 rounded-3xl border border-[#DED4C5] bg-white p-5 sm:p-7">
      <h2 className="text-lg font-medium">
        1. Conferir os dados do envio
      </h2>

      <p className="mt-2 text-xs leading-relaxed text-[#756B5D]">
        Confira os campos destacados e salve o rascunho.
        Salvar não envia dados ao Melhor Envio nem compra
        uma etiqueta.
      </p>

      {scope === 'legacy' && <p className="mt-3 text-xs leading-6 text-[#756B5D]">As medidas iniciais usam a embalagem padrão da loja. Confira o pacote real, complete número e bairro que faltarem e salve antes de cotar.</p>}
      {draft.documentNotice && <p className="mt-3 rounded-xl border border-[#E5DED3] bg-[#FAF8F4] p-3 text-xs leading-6">{draft.documentNotice}</p>}
      <p className="mt-4 text-sm">
        Frete do pedido:{' '}
        <strong>
          {draft.company} · {draft.service}
        </strong>
      </p>

      <p className="mt-2 text-xs text-[#756B5D]">
        Depois de salvar, atualize o custo na etapa de
        preparação no Melhor Envio.
      </p>

      <details className="mt-5 rounded-xl border border-[#E5DED3] p-4">
        <summary className="cursor-pointer text-xs font-medium">
          Conteúdo do pedido
        </summary>

        <ul className="mt-3 space-y-2 text-xs">
          {draft.products.map((product, index) => (
            <li key={index}>
              {product.quantity} × {product.name} ·{' '}
              {saleMoney(product.value)} por unidade
            </li>
          ))}
        </ul>
      </details>

      <form
        key={draft.version}
        className="mt-6"
        onChange={() => setDirty(true)}
        onSubmit={async event => {
          event.preventDefault()

          if (busy) return

          const data = new FormData(event.currentTarget)

          setBusy(true)
          setMessage('')

          try {
            const result = await saveLabelDraft(
              draft.id,
              data,
              scope
            )

            if (result.error) {
              setMessage(result.error)
            } else if (result.draft) {
              setDraft(result.draft)
              setEditing(result.draft.fields)
              setDirty(false)

              setMessage(
                result.draft.issues.length
                  ? 'Rascunho salvo. Ainda existem pendências abaixo.'
                  : 'Rascunho salvo sem pendências nesta conferência.'
              )
            }
          } catch {
            setMessage(
              'A conexão falhou. Atualize a página antes de tentar salvar novamente.'
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        <input
          type="hidden"
          name="version"
          value={draft.version}
        />

        <input
          type="hidden"
          name="order_version"
          value={draft.orderVersion}
        />

        <input
          type="hidden"
          name="sender_version"
          value={draft.senderVersion}
        />

        <fieldset
          disabled={disabled}
          className="space-y-6 disabled:opacity-60"
        >
          <div
            id={`${prefix}-recipient`}
            tabIndex={-1}
            className="scroll-mt-6"
          >
            <h3 className="mb-4 text-sm font-medium">
              Destinatário
            </h3>

            <LabelPartyFields fields={draft.fields} documentOptional />
          </div>

          <div
            id={`${prefix}-package`}
            tabIndex={-1}
            className="scroll-mt-6"
          >
            <h3 className="mb-4 text-sm font-medium">
              Pacote
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              {PACKAGE_FIELDS.map(([name, label]) => {
                const error = packageFieldError(
                  name,
                  editing[name] || ''
                )

                const inputId = `${prefix}-${name}`
                const errorId = `${inputId}-error`

                return (
                  <div key={name} className="text-xs">
                    <label
                      htmlFor={inputId}
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
                      id={inputId}
                      name={name}
                      value={editing[name] || ''}
                      onChange={event => {
                        const value =
                          event.currentTarget.value

                        setEditing(previous => ({
                          ...previous,
                          [name]: value,
                        }))
                      }}
                      inputMode="decimal"
                      maxLength={20}
                      aria-invalid={
                        error ? true : undefined
                      }
                      aria-describedby={
                        error ? errorId : undefined
                      }
                      className={`${inputClass} ${
                        error
                          ? 'border-red-600 focus:outline-red-600'
                          : 'border-[#DDD4C7]'
                      }`}
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
            </div>
          </div>

          <div
            id={`${prefix}-documentation`}
            tabIndex={-1}
            className="scroll-mt-6"
          >
            <h3 className="mb-4 text-sm font-medium">
              Documentação do envio
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs">
                Situação

                <select
                  name="document_mode"
                  value={
                    editing.document_mode || 'pending'
                  }
                  onChange={event => {
                    const value =
                      event.currentTarget.value

                    setEditing(previous => ({
                      ...previous,
                      document_mode: value,
                    }))
                  }}
                  className={`${inputClass} border-[#DDD4C7]`}
                >
                  <option value="pending">
                    A confirmar com a loja
                  </option>

                  <option value="invoice">
                    Nota fiscal eletrônica (NF-e)
                  </option>
                </select>
              </label>

              <div className="text-xs">
                <label
                  htmlFor={`${prefix}-invoice`}
                  className="flex items-center gap-2"
                >
                  Chave de acesso da NF-e

                  {invoiceError && (
                    <AlertTriangle
                      size={15}
                      className="shrink-0 text-red-700"
                      aria-hidden="true"
                    />
                  )}
                </label>

                <input
                  id={`${prefix}-invoice`}
                  name="invoice_key"
                  value={editing.invoice_key || ''}
                  onChange={event => {
                    const value =
                      event.currentTarget.value

                    setEditing(previous => ({
                      ...previous,
                      invoice_key: value,
                    }))
                  }}
                  maxLength={44}
                  inputMode="numeric"
                  aria-invalid={
                    invoiceError ? true : undefined
                  }
                  aria-describedby={
                    invoiceError
                      ? `${prefix}-invoice-error`
                      : undefined
                  }
                  className={`${inputClass} ${
                    invoiceError
                      ? 'border-red-600 focus:outline-red-600'
                      : 'border-[#DDD4C7]'
                  }`}
                />

                {invoiceError && (
                  <p
                    id={`${prefix}-invoice-error`}
                    aria-live="polite"
                    className="mt-2 text-xs text-red-700"
                  >
                    {invoiceError}
                  </p>
                )}
              </div>
            </div>

            {editing.document_mode === 'invoice' ? (
              <p className="mt-3 text-xs leading-relaxed text-[#756B5D]">
                Confira também a inscrição estadual ou
                situação do remetente em{' '}
                <a
                  href="/admin/frete"
                  className="font-medium underline"
                >
                  Envios → Configurações → Remetente
                </a>
                . A conferência da chave verifica somente
                o formato de 44 números; não comprova a
                validade fiscal da nota.
              </p>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-[#756B5D]">
                A documentação continua a confirmar.
                O sistema não presume declaração de
                conteúdo nem emite nota fiscal.
              </p>
            )}
          </div>

          <label className="block text-xs">
            Observações internas do envio

            <textarea
              name="notes"
              defaultValue={draft.fields.notes}
              rows={3}
              maxLength={2000}
              className="mt-2 w-full rounded-xl border border-[#DDD4C7] p-3 text-sm"
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-[#292621] px-6 py-3 text-xs text-white disabled:opacity-50"
          >
            {busy
              ? 'Salvando…'
              : 'Salvar rascunho e conferir'}
          </button>
        </fieldset>
      </form>

      <p
        role="status"
        className="mt-4 text-sm"
      >
        {message}
      </p>

      <div
        className={`mt-5 rounded-2xl border p-4 ${
          draft.issues.length
            ? 'border-amber-300 bg-amber-50'
            : 'border-[#E5DED3] bg-[#F8F4ED]'
        }`}
      >
        <h3 className="text-sm font-medium">
          Conferência dos dados salvos
          {draft.issues.length > 0 &&
            ` · ${draft.issues.length} pendência(s)`}
        </h3>

        {dirty && (
          <p
            role="status"
            className="mt-3 text-xs font-medium text-amber-900"
          >
            Existem alterações não salvas. A lista abaixo
            ainda corresponde ao último rascunho salvo.
          </p>
        )}

        {draft.issues.length ? (
          <>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-xs leading-relaxed text-[#756B5D]">
              {draft.issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>

            <p className="mt-4 text-xs font-medium">
              Onde corrigir
            </p>

            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <button
                type="button"
                onClick={() => goTo('recipient')}
                className="underline"
              >
                Destinatário
              </button>

              <button
                type="button"
                onClick={() => goTo('package')}
                className="underline"
              >
                Pacote
              </button>

              <button
                type="button"
                onClick={() => goTo('documentation')}
                className="underline"
              >
                Documentação
              </button>

              <a
                href="/admin/frete"
                className="underline"
              >
                Remetente e origem
              </a>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-[#756B5D]">
              Pendências de pagamento e confirmação do
              frete são resolvidas nas respectivas seções
              deste pedido.
            </p>
          </>
        ) : (
          <p className="mt-3 text-xs text-[#52654B]">
            Sem pendências nos dados salvos. Isso não
            significa que a etiqueta foi preparada,
            comprada ou gerada.
          </p>
        )}

        <p className="mt-4 text-[11px] text-[#756B5D]">
          Após corrigir os campos, salve novamente.
        </p>
      </div>
    </section>
  )
}
