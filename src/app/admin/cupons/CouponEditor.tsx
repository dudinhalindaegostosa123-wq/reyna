'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import {
  couponAmountInput,
  couponDateParts,
  couponPhase,
} from '@/lib/coupon-ui'

import type {
  Coupon,
  CouponProduct,
  CouponStatus,
  CouponScope,
  CouponDiscountType,
} from '@/lib/coupon-ui'

import {
  saveCoupon,
  searchCouponProducts,
} from './actions'

export default function CouponEditor({
  initial,
}: {
  initial: Coupon
}) {
  const router = useRouter()
  const lock = useRef(false)

  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  const [status, setStatus] = useState<CouponStatus>(
    initial.status
  )

  const [scope, setScope] = useState<CouponScope>(
    initial.scope
  )

  const [discountType, setDiscountType] =
    useState<CouponDiscountType>(
      initial.discountType
    )

  const [code, setCode] = useState(initial.code)

  const [products, setProducts] = useState<CouponProduct[]>(
    initial.products
  )

  const [search, setSearch] = useState('')
  const [results, setResults] = useState<CouponProduct[]>([])
  const [searchMessage, setSearchMessage] = useState('')

  const starts = couponDateParts(initial.startsAt)
  const ends = couponDateParts(initial.endsAt)

  const working = Boolean(busy)

  const field =
    'mt-2 min-h-[46px] min-w-0 w-full rounded-xl border border-[#DDD4C7] bg-white px-3 text-base outline-none focus:border-[#947B57] disabled:opacity-50 sm:text-sm'

  const label =
    'block min-w-0 text-xs text-[#625B51]'

  async function findProducts() {
    if (lock.current) return

    lock.current = true
    setBusy('search')
    setSearchMessage('')

    try {
      const result = await searchCouponProducts(search)

      setResults(result.products)

      setSearchMessage(
        result.error ||
        `${result.products.length} produto(s) encontrado(s).`
      )
    } catch {
      setResults([])
      setSearchMessage(
        'Não foi possível buscar os produtos.'
      )
    } finally {
      lock.current = false
      setBusy('')
    }
  }

  async function handleSave(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (lock.current) return

    if (scope === 'products' && products.length === 0) {
      setFailed(true)
      setMessage(
        'Adicione ao menos um produto participante.'
      )
      return
    }

    const form = new FormData(event.currentTarget)

    lock.current = true
    setBusy('save')
    setMessage('')
    setFailed(false)

    try {
      const result = await saveCoupon(form)

      if (result.error || !result.id) {
        setFailed(true)
        setMessage(
          result.error ||
          'Não foi possível confirmar o salvamento.'
        )
        return
      }

      setMessage('Cupom salvo.')

      const params = new URLSearchParams(
        window.location.search
      )

      const previous = params.toString()

      params.set('edit', result.id)
      params.set('salvo', '1')

      if (params.toString() === previous) {
        router.refresh()
      } else {
        router.replace(
          `/admin/cupons?${params.toString()}`
        )
      }
    } catch {
      setFailed(true)
      setMessage(
        'Não foi possível confirmar o resultado. Confira a lista antes de repetir.'
      )
    } finally {
      lock.current = false
      setBusy('')
    }
  }

  function addProduct(product: CouponProduct) {
    setProducts(current =>
      current.some(item => item.id === product.id) ||
      current.length >= 500
        ? current
        : [...current, product]
    )

    setMessage('')
    setFailed(false)
  }

  return (
    <section className="min-w-0 rounded-2xl border border-[#E5DED3] bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">
            {initial.version > 0
              ? 'Editar cupom'
              : 'Novo cupom'}
          </h2>

          {initial.version > 0 && (
            <p className="mt-2 text-xs text-[#81796C]">
              Situação salva: {couponPhase(initial)}
            </p>
          )}
        </div>

        {initial.version > 0 && !working && (
          <Link
            href="/admin/cupons"
            className="inline-flex min-h-[44px] items-center text-xs underline"
          >
            Novo cupom
          </Link>
        )}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-[#81796C]">
        Entre promoções de preço e cupom, vale o maior desconto nos produtos participantes.
        O desconto progressivo da loja é aplicado depois do cupom, e os 5% OFF no Pix são adicionais.
        Frete e anodização ficam fora desses descontos.
      </p>

      <form onSubmit={handleSave} className="mt-6">
        <input
          type="hidden"
          name="id"
          value={initial.id}
        />

        <input
          type="hidden"
          name="version"
          value={initial.version}
        />

        <input
          type="hidden"
          name="products"
          value={JSON.stringify(
            products.map(product => product.id)
          )}
        />

        <fieldset
          disabled={working}
          className="space-y-5"
        >
          <label className={label}>
            Nome interno

            <input
              name="name"
              defaultValue={initial.name}
              required
              maxLength={180}
              placeholder="Ex.: Boas-vindas"
              className={field}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Código para o cliente

              <input
                name="code"
                value={code}
                onChange={event =>
                  setCode(event.target.value.toUpperCase())
                }
                readOnly={initial.codeLocked}
                required
                minLength={3}
                maxLength={40}
                autoComplete="off"
                spellCheck={false}
                placeholder="Ex.: BEMVINDO10"
                className={`${field} uppercase read-only:bg-[#F6F4EF]`}
              />
            </label>

            <label className={label}>
              Situação

              <select
                name="status"
                value={status}
                onChange={event =>
                  setStatus(
                    event.target.value as CouponStatus
                  )
                }
                className={field}
              >
                <option value="draft">
                  Rascunho
                </option>

                <option value="active">
                  Ativo / agendado
                </option>

                <option value="disabled">
                  Desativado
                </option>
              </select>
            </label>
          </div>

          {initial.codeLocked && (
            <p className="text-[11px] text-[#81796C]">
              O código não pode ser alterado porque
              já possui registros de uso.
            </p>
          )}

          <p className="text-xs leading-relaxed text-[#81796C]">
            {status === 'active'
              ? 'Ao salvar, o cupom ficará ativo, respeitando as datas abaixo.'
              : status === 'draft'
                ? 'Rascunhos não podem ser usados pelos clientes.'
                : 'Ao salvar, o cupom ficará indisponível para novos pedidos.'}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Tipo de desconto

              <select
                name="discount_type"
                value={discountType}
                onChange={event =>
                  setDiscountType(
                    event.target.value as CouponDiscountType
                  )
                }
                className={field}
              >
                <option value="percent">
                  Porcentagem (%)
                </option>

                <option value="fixed">
                  Valor fixo (R$)
                </option>
              </select>
            </label>

            <label className={label}>
              {discountType === 'percent'
                ? 'Desconto em porcentagem'
                : 'Desconto em reais'}

              <input
                name="discount_value"
                defaultValue={couponAmountInput(
                  initial.discountValue
                )}
                required
                inputMode="decimal"
                maxLength={20}
                placeholder="10,00"
                className={field}
              />
            </label>
          </div>

          <label className={label}>
            Compra mínima em produtos (R$)

            <input
              name="minimum_subtotal"
              defaultValue={couponAmountInput(
                initial.minimumSubtotal
              )}
              inputMode="decimal"
              maxLength={20}
              placeholder="0,00"
              className={field}
            />
          </label>

          <div className="border-t border-[#EEE9E1] pt-5">
            <h3 className="text-sm font-medium">
              Período
            </h3>

            <p className="mt-2 text-xs text-[#81796C]">
              Datas e horários seguem Brasília.
              Início vazio significa imediato;
              término vazio significa sem data final.
            </p>

            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
                <label className={label}>
                  Data de início

                  <input
                    type="date"
                    name="starts_date"
                    defaultValue={starts.date}
                    className={field}
                  />
                </label>

                <label className={label}>
                  Horário

                  <input
                    type="time"
                    name="starts_time"
                    defaultValue={starts.time}
                    className={field}
                  />
                </label>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
                <label className={label}>
                  Data de término

                  <input
                    type="date"
                    name="ends_date"
                    defaultValue={ends.date}
                    className={field}
                  />
                </label>

                <label className={label}>
                  Horário

                  <input
                    type="time"
                    name="ends_time"
                    defaultValue={ends.time}
                    className={field}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="border-t border-[#EEE9E1] pt-5">
            <h3 className="text-sm font-medium">
              Limites de uso
            </h3>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className={label}>
                Total de usos

                <input
                  name="max_uses"
                  type="number"
                  min={1}
                  max={100000000}
                  step={1}
                  defaultValue={initial.maxUses ?? ''}
                  placeholder="Sem limite"
                  className={field}
                />
              </label>

              <label className={label}>
                Usos por cliente

                <input
                  name="max_uses_per_customer"
                  type="number"
                  min={1}
                  max={100000000}
                  step={1}
                  defaultValue={
                    initial.maxUsesPerCustomer ?? ''
                  }
                  placeholder="Sem limite"
                  className={field}
                />
              </label>
            </div>

            <p className="mt-2 text-[11px] text-[#81796C]">
              Deixe vazio para não limitar.
            </p>
          </div>

          <div className="border-t border-[#EEE9E1] pt-5">
            <label className={label}>
              Produtos participantes

              <select
                name="scope"
                value={scope}
                onChange={event => {
                  setScope(
                    event.target.value as CouponScope
                  )
                  setMessage('')
                }}
                className={field}
              >
                <option value="all">
                  Todos os produtos
                </option>

                <option value="products">
                  Somente produtos selecionados
                </option>
              </select>
            </label>

            {scope === 'products' && (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <label className={`${label} flex-1`}>
                    Buscar por nome ou SKU

                    <input
                      value={search}
                      onChange={event =>
                        setSearch(event.target.value)
                      }
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void findProducts()
                        }
                      }}
                      maxLength={100}
                      className={field}
                    />
                  </label>

                  <button
                    type="button"
                    disabled={working}
                    onClick={() => void findProducts()}
                    className="min-h-[46px] rounded-full border border-[#DDD4C7] px-5 text-xs disabled:opacity-40"
                  >
                    {busy === 'search'
                      ? 'Buscando…'
                      : 'Buscar'}
                  </button>
                </div>

                {searchMessage && (
                  <p
                    role="status"
                    className="text-xs text-[#81796C]"
                  >
                    {searchMessage}
                  </p>
                )}

                {results.length > 0 && (
                  <ul className="max-h-64 divide-y divide-[#EEE9E1] overflow-y-auto rounded-xl border border-[#E5DED3]">
                    {results.map(product => {
                      const selected = products.some(
                        item => item.id === product.id
                      )

                      return (
                        <li
                          key={product.id}
                          className="flex items-center justify-between gap-3 p-3"
                        >
                          <div className="min-w-0">
                            <p className="break-words text-xs">
                              {product.name}
                            </p>

                            {product.sku && (
                              <p className="mt-1 text-[11px] text-[#81796C]">
                                {product.sku}
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={
                              selected ||
                              products.length >= 500
                            }
                            onClick={() =>
                              addProduct(product)
                            }
                            className="min-h-[44px] shrink-0 px-3 text-xs underline disabled:opacity-40"
                          >
                            {selected
                              ? 'Adicionado'
                              : 'Adicionar'}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}

                <p className="text-xs font-medium">
                  Selecionados: {products.length} / 500
                </p>

                {products.length ? (
                  <ul className="max-h-72 divide-y divide-[#EEE9E1] overflow-y-auto">
                    {products.map(product => (
                      <li
                        key={product.id}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="break-words text-xs">
                            {product.name}
                          </p>

                          {product.sku && (
                            <p className="mt-1 text-[11px] text-[#81796C]">
                              {product.sku}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setProducts(current =>
                              current.filter(
                                item =>
                                  item.id !== product.id
                              )
                            )
                          }
                          aria-label={`Remover ${product.name} do cupom`}
                          className="min-h-[44px] shrink-0 px-3 text-xs text-red-700"
                        >
                          Remover
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#81796C]">
                    Nenhum produto adicionado.
                  </p>
                )}

                <p className="text-[11px] leading-relaxed text-[#81796C]">
                  Selecionar um produto inclui suas
                  variações disponíveis.
                </p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={working}
            className="min-h-[46px] rounded-full bg-[#292621] px-6 py-3 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === 'save'
              ? 'Salvando…'
              : status === 'active'
                ? 'Salvar e ativar / agendar'
                : status === 'draft'
                  ? 'Salvar rascunho'
                  : 'Salvar como desativado'}
          </button>
        </fieldset>

        {message && (
          <p
            role={failed ? 'alert' : 'status'}
            className={`mt-4 text-sm leading-relaxed ${
              failed
                ? 'text-red-700'
                : 'text-green-800'
            }`}
          >
            {message}
          </p>
        )}
      </form>
    </section>
  )
}
