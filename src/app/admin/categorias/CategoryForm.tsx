'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { saveCategory } from './actions'

import {
  loadCategoryDestinations,
  previewCategoryChange,
  applyCategoryChange,
} from './bulk-actions'

import type {
  CategoryDestination,
  CategoryChangePreview,
} from './bulk-actions'

export interface EditableCategory {
  slug: string
  name: string
  hidden_from_menu: boolean
  version: number
  product_count: number
}

interface Props {
  category?: EditableCategory
}

type Mode = 'move' | 'remove'

export default function CategoryForm({ category }: Props) {
  const router = useRouter()
  const id = useId()
  const lock = useRef(false)

  const [name, setName] = useState(category?.name || '')
  const [hidden, setHidden] = useState(
    category?.hidden_from_menu || false
  )

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  const [mode, setMode] = useState<Mode | null>(null)
  const [destinations, setDestinations] = useState<
    CategoryDestination[]
  >([])
  const [target, setTarget] = useState('')
  const [preview, setPreview] = useState<
    CategoryChangePreview | null
  >(null)
  const [requestId, setRequestId] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const dirty = Boolean(
    category &&
    (
      name.trim() !== category.name.trim() ||
      hidden !== category.hidden_from_menu
    )
  )

  function clearMessage() {
    setMessage('')
    setFailed(false)
  }

  function showError(value: string) {
    setMessage(value)
    setFailed(true)
  }

  function resetPreview() {
    setPreview(null)
    setRequestId('')
    setConfirmed(false)
    clearMessage()
  }

  async function handleSave(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (lock.current || mode) return

    if (!name.trim()) {
      showError('Preencha o nome da categoria.')
      return
    }

    const form = new FormData(event.currentTarget)

    lock.current = true
    setBusy(true)
    clearMessage()

    try {
      const result = await saveCategory(form)

      if (result.error || !result.slug) {
        showError(
          result.error || 'Não foi possível salvar.'
        )
        return
      }

      setName(name.trim())
      setMessage('Categoria salva.')

      if (category?.slug === result.slug) {
        router.refresh()
      } else {
        router.replace(
          `/admin/categorias?edit=${encodeURIComponent(result.slug)}`
        )
      }
    } catch {
      showError(
        'Não foi possível confirmar o salvamento. Atualize a lista antes de repetir.'
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  async function openOperation(nextMode: Mode) {
    if (!category || lock.current || dirty) return

    setMode(nextMode)
    setTarget('')
    resetPreview()

    if (nextMode === 'remove') return

    lock.current = true
    setBusy(true)
    setDestinations([])

    try {
      const result = await loadCategoryDestinations(
        category.slug
      )

      if (result.error) {
        showError(result.error)
        return
      }

      setDestinations(result.categories)
    } catch {
      showError(
        'Não foi possível carregar os destinos.'
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  function cancelOperation() {
    if (lock.current) return

    setMode(null)
    setTarget('')
    resetPreview()
  }

  async function handlePreview() {
    if (
      !category ||
      !mode ||
      lock.current ||
      (mode === 'move' && !target)
    ) {
      return
    }

    lock.current = true
    setBusy(true)
    resetPreview()

    try {
      const result = await previewCategoryChange({
        source: category.slug,
        action: mode,
        target: mode === 'move' ? target : null,
      })

      if (result.error || !result.preview) {
        showError(
          result.error || 'Não foi possível conferir o impacto.'
        )
        return
      }

      setRequestId(crypto.randomUUID())
      setPreview(result.preview)
    } catch {
      showError(
        'Não foi possível carregar a prévia. Nenhuma alteração foi solicitada.'
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  async function handleApply() {
    if (
      !preview ||
      !requestId ||
      !confirmed ||
      lock.current
    ) {
      return
    }

    lock.current = true
    setBusy(true)
    clearMessage()

    try {
      const result = await applyCategoryChange({
        requestId,
        source: preview.sourceSlug,
        action: preview.action,
        target: preview.targetSlug,
        token: preview.token,
      })

      if (
        result.error ||
        typeof result.affectedProducts !== 'number'
      ) {
        showError(
          result.error ||
          'Não foi possível confirmar o resultado. Atualize a página.'
        )
        return
      }

      if (preview.action === 'remove') {
        router.replace('/admin/categorias')
      } else {
        setMode(null)
        setPreview(null)
        setRequestId('')
        setConfirmed(false)

        setMessage(
          `${result.affectedProducts} produto(s) movido(s).`
        )

        router.refresh()
      }
    } catch {
      showError(
        'Não foi possível confirmar o resultado. Confira os produtos antes de repetir.'
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  const fieldClass =
    'mt-2 min-h-[46px] w-full rounded-xl border border-[#DDD4C7] bg-white px-3 text-base outline-none focus:border-[#947B57] disabled:opacity-50 sm:text-sm'

  const buttonClass =
    'min-h-[44px] rounded-full border border-[#DDD4C7] px-5 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <section className="rounded-2xl border border-[#E5DED3] bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">
            {category ? 'Editar categoria' : 'Nova categoria'}
          </h2>

          {category && (
            <p className="mt-2 text-xs text-[#81796C]">
              {category.product_count} produto(s) vinculado(s)
            </p>
          )}
        </div>

        {category && !busy && (
          <Link
            href="/admin/categorias"
            className="inline-flex min-h-[44px] items-center text-xs text-[#756B5D] underline"
          >
            Nova categoria
          </Link>
        )}
      </div>

      <form onSubmit={handleSave} className="mt-6">
        <input
          type="hidden"
          name="slug"
          value={category?.slug || ''}
        />

        <input
          type="hidden"
          name="version"
          value={category?.version || 0}
        />

        <fieldset
          disabled={busy || Boolean(mode)}
          className="space-y-5"
        >
          <label className="block text-xs text-[#625B51]">
            Nome da categoria

            <input
              name="name"
              value={name}
              required
              maxLength={180}
              autoComplete="off"
              placeholder="Ex.: Hastes e Labrets"
              onChange={event => {
                setName(event.target.value)
                clearMessage()
              }}
              className={fieldClass}
            />
          </label>

          <div>
            <p className="text-xs text-[#625B51]">
              Endereço da categoria
            </p>

            {category ? (
              <>
                <p className="mt-2 break-all rounded-xl bg-[#F6F4EF] px-3 py-3 text-xs text-[#756B5D]">
                  /categoria/{category.slug}
                </p>

                <p className="mt-2 text-[11px] text-[#81796C]">
                  Alterar o nome mantém esse endereço.
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-[#81796C]">
                O endereço será gerado ao salvar.
              </p>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E5DED3] p-4">
            <input
              type="checkbox"
              name="hidden_from_menu"
              checked={hidden}
              onChange={event => {
                setHidden(event.target.checked)
                clearMessage()
              }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#292621]"
            />

            <span>
              <span className="block text-sm">
                Ocultar do menu da loja
              </span>

              <span className="mt-1 block text-xs leading-relaxed text-[#81796C]">
                A categoria continua disponível no admin.
                Produtos e endereço são preservados.
              </span>
            </span>
          </label>

          <button
            type="submit"
            className="min-h-[44px] rounded-full bg-[#292621] px-6 py-3 text-xs text-white disabled:opacity-40"
          >
            {busy
              ? 'Aguarde…'
              : category
                ? 'Salvar categoria'
                : 'Criar categoria'}
          </button>
        </fieldset>
      </form>

      {category && (
        <section className="mt-7 border-t border-[#E5DED3] pt-5">
          <h3 className="text-sm font-medium">
            Organizar produtos
          </h3>

          {!mode ? (
            <>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy || dirty}
                  onClick={() => void openOperation('move')}
                  className={buttonClass}
                >
                  Mover produtos
                </button>

                <button
                  type="button"
                  disabled={busy || dirty}
                  onClick={() => void openOperation('remove')}
                  className="min-h-[44px] rounded-full border border-red-200 px-5 py-3 text-xs text-red-700 disabled:opacity-40"
                >
                  Excluir categoria
                </button>
              </div>

              {dirty && (
                <p className="mt-3 text-xs text-[#81796C]">
                  Salve as alterações acima para liberar
                  essas ações.
                </p>
              )}
            </>
          ) : (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {mode === 'move'
                    ? 'Mover produtos'
                    : 'Excluir categoria'}
                </p>

                <button
                  type="button"
                  disabled={busy}
                  onClick={cancelOperation}
                  className="min-h-[44px] text-xs underline disabled:opacity-40"
                >
                  Cancelar
                </button>
              </div>

              {!preview ? (
                <>
                  {mode === 'move' ? (
                    <div className="mt-3">
                      <label
                        htmlFor={`${id}-target`}
                        className="block text-xs text-[#625B51]"
                      >
                        Categoria de destino
                      </label>

                      <select
                        id={`${id}-target`}
                        value={target}
                        disabled={busy}
                        onChange={event => {
                          setTarget(event.target.value)
                          resetPreview()
                        }}
                        className={fieldClass}
                      >
                        <option value="">
                          {busy
                            ? 'Carregando…'
                            : 'Selecione o destino'}
                        </option>

                        {destinations.map(item => (
                          <option
                            key={item.slug}
                            value={item.slug}
                          >
                            {item.name} · {item.slug}
                          </option>
                        ))}
                      </select>

                      {!busy && !destinations.length && (
                        <button
                          type="button"
                          onClick={() =>
                            void openOperation('move')
                          }
                          className="mt-2 min-h-[44px] text-xs underline"
                        >
                          Recarregar destinos
                        </button>
                      )}

                      <p className="mt-3 text-xs leading-relaxed text-[#81796C]">
                        Os produtos passam para o destino.
                        As outras categorias são mantidas.
                        A origem permanece cadastrada.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs leading-relaxed text-[#81796C]">
                      A categoria será removida dos produtos
                      e do gerenciamento. Nenhum produto será
                      apagado. Banners e links não serão
                      alterados automaticamente.
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={
                      busy ||
                      (mode === 'move' && !target)
                    }
                    onClick={() => void handlePreview()}
                    className="mt-4 min-h-[44px] rounded-full bg-[#292621] px-5 py-3 text-xs text-white disabled:opacity-40"
                  >
                    {busy ? 'Conferindo…' : 'Conferir impacto'}
                  </button>
                </>
              ) : (
                <div className="mt-3 rounded-xl border border-[#E5DED3] bg-[#F6F4EF] p-4">
                  <p className="text-sm font-medium">
                    {preview.affectedProducts} produto(s)
                    {' '}afetado(s)
                  </p>

                  <p className="mt-3 text-xs text-[#756B5D]">
                    Origem: {preview.sourceName}
                  </p>

                  {preview.action === 'move' && (
                    <p className="mt-1 text-xs text-[#756B5D]">
                      Destino: {preview.targetName}
                    </p>
                  )}

                  {preview.withoutCategory > 0 && (
                    <p className="mt-3 text-xs text-amber-800">
                      {preview.withoutCategory} produto(s)
                      {' '}ficarão sem categoria.
                    </p>
                  )}

                  <p className="mt-3 text-xs text-[#756B5D]">
                    Nenhum produto será apagado.
                  </p>

                  <label className="mt-4 flex cursor-pointer items-start gap-3 text-xs leading-relaxed">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={busy}
                      onChange={event =>
                        setConfirmed(event.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#292621]"
                    />

                    <span>
                      Conferi o impacto e confirmo esta operação.
                    </span>
                  </label>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busy || !confirmed}
                      onClick={() => void handleApply()}
                      className={`min-h-[44px] rounded-full px-5 py-3 text-xs text-white disabled:opacity-40 ${
                        preview.action === 'remove'
                          ? 'bg-red-700'
                          : 'bg-[#292621]'
                      }`}
                    >
                      {busy
                        ? 'Aplicando…'
                        : preview.action === 'move'
                          ? 'Confirmar movimentação'
                          : 'Confirmar exclusão'}
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={resetPreview}
                      className={buttonClass}
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {message && (
        <p
          role={failed ? 'alert' : 'status'}
          className={`mt-4 text-sm leading-relaxed ${
            failed ? 'text-red-700' : 'text-green-800'
          }`}
        >
          {message}
        </p>
      )}
    </section>
  )
}
