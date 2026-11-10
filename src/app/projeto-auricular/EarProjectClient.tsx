'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import ProjectPagination from './ProjectPagination'
import {
  REGIONS,
  COLORS,
  TYPES,
  DETAILS,
  newChoice,
  suggestionUrl,
  projectMessage,
} from '@/lib/ear-project'
import type {
  RegionId,
  Color,
  JewelType,
  Detail,
  Choice,
  Choices,
  ProjectProduct,
} from '@/lib/ear-project'

const POINTS: Record<RegionId, { x: number; y: number }> = {
  helix: { x: 26, y: 32 },
  flat: { x: 44, y: 28 },
  conch: { x: 47, y: 53 },
  daith: { x: 58, y: 43 },
  tragus: { x: 65, y: 57 },
  lobulo: { x: 48, y: 81 },
  transversal: { x: 44, y: 17 },
}

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)

async function fetchSuggestions(
  region: RegionId,
  choice: Choice,
  signal?: AbortSignal,
  page = 1
): Promise<{ products: ProjectProduct[]; page: number; totalPages: number; total: number }> {
  const response = await fetch(suggestionUrl(region, choice, page), {
    signal,
  })

  if (!response.ok) {
    throw new Error(
      'Não foi possível carregar as joias. Tente novamente.'
    )
  }

  const data = await response.json()

  if (!Array.isArray(data.products) || !Number.isSafeInteger(data.page) || !Number.isSafeInteger(data.totalPages) || !Number.isSafeInteger(data.total)) {
    throw new Error('Resposta inesperada do catálogo.')
  }

  return data
}

function Arrow({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className={className}
    >
      <path d="M4 12h15M13 5l7 7-7 7" />
    </svg>
  )
}

function OptionGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Record<string, string>
  onChange: (value: string) => void
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-[12px] font-medium text-store-muted">
        {label}
      </legend>

      <div className="flex flex-wrap gap-2">
        {Object.entries(options).map(([option, name]) => {
          const selected = value === option

          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option)}
              className={`inline-flex min-h-[42px] items-center gap-2 rounded-full border px-4 py-2 text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#947B57] ${
                selected
                  ? 'border-store-selected bg-store-action text-white'
                  : 'border-store-border bg-store-surface text-store-muted hover:border-[#B6A58A]'
              }`}
            >
              {option === 'dourado' && (
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full bg-gradient-to-br from-[#F3D995] via-[#C6A25D] to-[#997137]"
                />
              )}

              {option === 'prateado' && (
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full bg-gradient-to-br from-white via-[#C7C9CB] to-[#858A90]"
                />
              )}

              {name}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export default function EarProjectClient({
  whatsapp,
}: {
  whatsapp: string
}) {
  const [choices, setChoices] = useState<Choices>({})
  const [active, setActive] = useState<RegionId>('helix')
  const [side, setSide] = useState('Direita')
  const [notes, setNotes] = useState('')
  const [products, setProducts] = useState<ProjectProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [retry, setRetry] = useState(0)
  const [requestedPage, setRequestedPage] = useState({ key: '', page: 1 })
  const [pagination, setPagination] = useState({ page: 1, totalPages: 0, total: 0 })

  const choice = choices[active]
  const selected = Boolean(choice)
  const color = choice?.color || 'livre'
  const type = choice?.type || 'livre'
  const detail = choice?.detail || 'livre'
  const mirrored = side === 'Esquerda'
  const pageKey = JSON.stringify([active, color, type, detail, selected])
  const page = requestedPage.key === pageKey ? requestedPage.page : 1

  const regionName =
    REGIONS.find((region) => region.id === active)?.name || ''

  const selectedRegions = REGIONS.filter(
    (region) => choices[region.id]
  )

  useEffect(() => {
    setProducts([])
    setError('')
    setPagination({ page: 1, totalPages: 0, total: 0 })

    if (!selected) {
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)

    fetchSuggestions(
      active,
      { ...newChoice(), color, type, detail },
      controller.signal,
      page
    )
      .then((items) => {
        if (!controller.signal.aborted) {
          setProducts(items.products)
          setPagination({ page: items.page, totalPages: items.totalPages, total: items.total })
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Não foi possível carregar as joias.'
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [active, color, type, detail, selected, retry, page])

  function selectRegion(id: RegionId) {
    if (building) return
    setRequestedPage({ key: '', page: 1 })

    setChoices((current) => ({
      ...current,
      [id]: current[id] || newChoice(),
    }))

    setActive(id)
    setStatus('')
  }

  function update(patch: Partial<Omit<Choice, 'product'>>) {
    if (building) return
    if ('color' in patch || 'type' in patch || 'detail' in patch) setRequestedPage({ key: '', page: 1 })

    setChoices((current) => {
      const old = current[active]
      if (!old) return current

      const clear =
        'color' in patch ||
        'type' in patch ||
        'detail' in patch

      return {
        ...current,
        [active]: {
          ...old,
          ...patch,
          product: clear ? null : old.product,
        },
      }
    })

    setStatus('')
  }

  function selectProduct(product: ProjectProduct | null) {
    if (building) return

    setChoices((current) =>
      current[active]
        ? {
            ...current,
            [active]: {
              ...current[active]!,
              product,
            },
          }
        : current
    )

    setStatus('')
  }

  function removeRegion() {
    if (building) return

    const next = { ...choices }
    delete next[active]

    setChoices(next)

    const remaining = REGIONS.find(
      (region) => next[region.id]
    )

    setActive(remaining?.id || 'helix')
    setStatus('')
  }

  async function buildProject() {
    if (!whatsapp || !selectedRegions.length || building) return

    setBuilding(true)
    setStatus('Buscando sugestões para seu projeto…')

    const snapshot = { ...choices }

    const results = await Promise.allSettled(
      selectedRegions.map(async (region) => ({
        id: region.id,
        products: (await fetchSuggestions(
          region.id,
          snapshot[region.id]!
        )).products,
      }))
    )

    const used = new Set<string>()
    let found = 0
    let failed = 0

    results.forEach((result) => {
      if (result.status === 'rejected') {
        failed += 1
        return
      }

      const { id, products: suggestions } = result.value

      const product =
        suggestions.find((item) => !used.has(item.id)) ||
        suggestions[0] ||
        null

      if (product) {
        used.add(product.id)
        found += 1
      }

      snapshot[id] = {
        ...snapshot[id]!,
        product,
      }
    })

    setChoices(snapshot)
    setBuilding(false)

    setStatus(
      `${found} de ${selectedRegions.length} regiões receberam sugestões.${
        failed
          ? ' Algumas consultas falharam. Tente novamente ou peça ajuda à equipe.'
          : ' Você pode trocar as peças e pedir ajuda nas regiões sem resultado.'
      }`
    )
  }

  function openWhatsapp() {
    if (!whatsapp || !selectedRegions.length || building) return

    const text = projectMessage(
      choices,
      side,
      notes,
      window.location.origin
    )

    window.open(
      `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  return (
    <div className="min-h-screen bg-store-canvas text-store-text">
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-5 sm:px-6 md:px-10 md:pt-7">
        <Link
          href="/orelha"
          className="inline-flex min-h-[40px] items-center gap-2 text-[12px] text-store-muted transition-colors hover:text-store-text"
        >
          <span aria-hidden="true">←</span>
          Orelha
        </Link>

        <header className="mb-7 mt-4 md:mb-9">
          <h1 className="max-w-2xl font-display text-[36px] font-light leading-[1.08] tracking-[-0.035em] md:text-5xl">
            Seu projeto auricular
          </h1>

          <p className="mt-3 text-[13px] leading-relaxed text-store-muted">
            Toque na orelha e escolha as joias para cada região.
          </p>
        </header>

        <fieldset disabled={building} className="min-w-0">
          <legend className="sr-only">
            Personalização do projeto auricular
          </legend>

          <div className="grid items-start gap-7 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12">
            <section
              aria-labelledby="ear-map-title"
              className="min-w-0 lg:sticky lg:top-28"
            >
              <div className="overflow-hidden rounded-[32px] bg-store-surface p-3 sm:p-5 md:rounded-[40px]">
                <div className="flex flex-wrap items-center justify-between gap-3 px-2 pt-1">
                  <h2
                    id="ear-map-title"
                    className="text-[12px] text-store-muted"
                  >
                    Escolha os pontos
                  </h2>

                  <div
                    role="group"
                    aria-label="Escolha a orelha"
                    className="inline-flex rounded-full bg-store-raised p-1"
                  >
                    {['Direita', 'Esquerda'].map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={side === value}
                        onClick={() => setSide(value)}
                        className={`min-h-[36px] rounded-full px-3 text-[11px] transition-colors ${
                          side === value
                            ? 'bg-store-surface text-store-text shadow-sm'
                            : 'text-store-muted'
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative mx-auto aspect-square w-full max-w-[500px]">
                  <Image
                    src="/banners/orelha-simulador.webp"
                    alt={`Orelha ${side.toLowerCase()} de demonstração para montar o projeto`}
                    fill
                    priority
                    sizes="(max-width: 1023px) 90vw, 500px"
                    className="object-contain"
                    style={{
                      transform: mirrored
                        ? 'scaleX(-1)'
                        : undefined,
                    }}
                  />

                  {REGIONS.map((region, index) => {
                    const item = choices[region.id]
                    const isActive =
                      active === region.id && Boolean(item)
                    const point = POINTS[region.id]

                    return (
                      <button
                        key={region.id}
                        type="button"
                        onClick={() => selectRegion(region.id)}
                        aria-pressed={Boolean(item)}
                        aria-label={`${region.name}${
                          item
                            ? ', selecionado. Editar'
                            : ', adicionar'
                        }`}
                        title={region.name}
                        style={{
                          left: `${
                            mirrored ? 100 - point.x : point.x
                          }%`,
                          top: `${point.y}%`,
                        }}
                        className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#292621] motion-reduce:transition-none ${
                          isActive ? 'z-20' : 'z-10'
                        }`}
                      >
                        <span
                          className={`relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border shadow-[0_2px_10px_rgba(44,34,22,0.12)] ${
                            isActive
                              ? 'border-white bg-store-action text-white ring-4 ring-white/50'
                              : item
                                ? 'border-white bg-[#B49A73] text-white'
                                : 'border-store-border bg-store-surface text-store-muted'
                          }`}
                        >
                          {item?.product ? (
                            <Image
                              src={item.product.image}
                              alt=""
                              fill
                              sizes="32px"
                              className="object-cover"
                            />
                          ) : (
                            <span className="text-[11px] font-medium">
                              {index + 1}
                            </span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <p className="px-3 pb-2 text-center text-[11px] leading-relaxed text-store-muted">
                  Toque em um ponto para adicionar ou editar.
                </p>
              </div>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {REGIONS.map((region, index) => {
                  const isSelected = Boolean(choices[region.id])
                  const isActive =
                    active === region.id && isSelected

                  return (
                    <button
                      key={region.id}
                      type="button"
                      onClick={() => selectRegion(region.id)}
                      aria-pressed={isSelected}
                      className={`inline-flex min-h-[40px] items-center gap-2 rounded-full px-3 py-2 text-[11px] transition-colors ${
                        isActive
                          ? 'bg-store-action text-white'
                          : isSelected
                            ? 'bg-store-raised text-store-muted'
                            : 'bg-store-raised text-store-muted hover:bg-store-raised'
                      }`}
                    >
                      <span className="opacity-60">
                        {index + 1}
                      </span>
                      {region.name}
                    </button>
                  )
                })}
              </div>

              <p className="mx-auto mt-4 max-w-sm text-center text-[10px] leading-relaxed text-store-muted">
                Posições indicativas. As miniaturas das joias
                não representam tamanho ou encaixe reais.
              </p>
            </section>

            <section
              aria-labelledby="preferences-title"
              className="min-w-0 pt-1"
            >
              <div className="flex items-center justify-between gap-4">
                <h2
                  id="preferences-title"
                  className="font-display text-3xl font-light tracking-[-0.025em]"
                >
                  {selected ? regionName : 'Por onde começar?'}
                </h2>

                {choice && (
                  <button
                    type="button"
                    onClick={removeRegion}
                    className="min-h-[40px] text-[11px] text-store-muted underline decoration-[#D7CDBF] underline-offset-4 hover:text-store-text"
                  >
                    Remover região
                  </button>
                )}
              </div>

              {!choice ? (
                <div className="mt-5 rounded-[28px] bg-store-raised px-6 py-7">
                  <p className="max-w-sm text-[13px] leading-relaxed text-store-muted">
                    Escolha uma região na orelha. Depois,
                    explore cores, estilos e joias para
                    compor seu projeto.
                  </p>

                  <button
                    type="button"
                    onClick={() => selectRegion('helix')}
                    className="mt-5 inline-flex min-h-[44px] items-center gap-4 rounded-full bg-store-action px-5 py-3 text-[12px] text-white"
                  >
                    Começar pelo Hélix
                    <Arrow />
                  </button>
                </div>
              ) : (
                <>
                  <div className="mt-6 space-y-6">
                    <OptionGroup
                      label="Cor da joia"
                      value={choice.color}
                      options={COLORS}
                      onChange={(value) =>
                        update({ color: value as Color })
                      }
                    />

                    <OptionGroup
                      label="Tipo de peça"
                      value={choice.type}
                      options={TYPES}
                      onChange={(value) =>
                        update({ type: value as JewelType })
                      }
                    />

                    <OptionGroup
                      label="Estilo"
                      value={choice.detail}
                      options={DETAILS}
                      onChange={(value) =>
                        update({ detail: value as Detail })
                      }
                    />

                    <OptionGroup
                      label="Sobre esse ponto"
                      value={choice.intention}
                      options={{
                        tenho: 'Já tenho o furo',
                        quero: 'Quero perfurar',
                      }}
                      onChange={(value) =>
                        update({
                          intention: value as Choice['intention'],
                        })
                      }
                    />
                  </div>

                  <div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-[12px] font-medium text-store-muted">
                      Joias para sua composição
                    </h3>

                    {choice.product && (
                      <button
                        type="button"
                        onClick={() => selectProduct(null)}
                        className="text-[11px] text-store-muted underline underline-offset-4"
                      >
                        Retirar joia
                      </button>
                    )}
                  </div>

                  {loading ? (
                    <div
                      role="status"
                      className="flex items-center gap-3 rounded-[24px] bg-store-raised p-6 text-[12px] text-store-muted"
                    >
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin rounded-full border border-store-border border-t-[#62513A] motion-reduce:animate-none"
                      />
                      Buscando joias…
                    </div>
                  ) : error ? (
                    <div
                      role="alert"
                      className="rounded-[24px] bg-store-raised p-6 text-[13px] text-store-muted"
                    >
                      <p>{error}</p>

                      <button
                        type="button"
                        onClick={() =>
                          setRetry((value) => value + 1)
                        }
                        className="mt-3 min-h-[40px] underline underline-offset-4"
                      >
                        Tentar novamente
                      </button>
                    </div>
                  ) : !products.length ? (
                    <p className="rounded-[24px] bg-store-raised p-6 text-[13px] leading-relaxed text-store-muted">
                      Não encontramos joias para essa
                      combinação. Experimente outras
                      preferências ou envie suas ideias
                      para a equipe ajudar.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {products.map((product) => {
                        const picked =
                          choice.product?.id === product.id

                        return (
                          <article
                            key={product.id}
                            className={`flex min-w-0 flex-col rounded-[24px] bg-store-surface p-2.5 ring-1 transition-shadow ${
                              picked
                                ? 'ring-[#B49A73]'
                                : 'ring-transparent'
                            }`}
                          >
                            <button
                              type="button"
                              aria-label={`${
                                picked ? 'Escolhida' : 'Escolher'
                              }: ${product.name}`}
                              aria-pressed={picked}
                              onClick={() =>
                                selectProduct(product)
                              }
                              className="relative block aspect-square w-full overflow-hidden rounded-[18px] bg-store-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#947B57]"
                            >
                              <Image
                                src={product.image}
                                alt=""
                                fill
                                sizes="(max-width: 639px) 42vw, 180px"
                                className="object-contain p-2"
                              />

                              {picked && (
                                <span
                                  aria-hidden="true"
                                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-store-action text-[11px] text-white"
                                >
                                  ✓
                                </span>
                              )}
                            </button>

                            <p className="mt-3 line-clamp-3 px-1 text-[11px] leading-relaxed text-store-muted">
                              {product.name}
                            </p>

                            <p className="mb-3 mt-2 px-1 text-[12px]">
                              {product.variable && (
                                <span className="text-[10px] text-store-muted">
                                  A partir de{' '}
                                </span>
                              )}
                              {money(product.price)}
                            </p>

                            <button
                              type="button"
                              onClick={() =>
                                selectProduct(product)
                              }
                              aria-pressed={picked}
                              className={`mt-auto min-h-[40px] w-full rounded-full px-2 py-2 text-[11px] transition-colors ${
                                picked
                                  ? 'bg-store-action text-white'
                                  : 'bg-store-raised text-store-muted hover:bg-store-raised'
                              }`}
                            >
                              {picked
                                ? 'Escolhida'
                                : 'Adicionar'}
                            </button>

                            <Link
                              href={`/produto/${product.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              prefetch={false}
                              className="mt-1 block py-2 text-center text-[10px] text-store-muted underline underline-offset-2"
                            >
                              Medidas e opções
                            </Link>
                          </article>
                        )
                      })}
                    </div>
                  )}
                  {!loading && !error && products.length > 0 && <ProjectPagination
                    page={pagination.page} totalPages={pagination.totalPages} total={pagination.total}
                    onChange={next => setRequestedPage({ key: pageKey, page: next })}
                  />}
                </>
              )}
            </section>
          </div>
        </fieldset>

        <section
          aria-labelledby="project-summary-title"
          className="mt-9 rounded-[30px] bg-store-raised p-5 sm:p-7 md:mt-12 md:rounded-[40px] md:p-9"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2
                id="project-summary-title"
                className="font-display text-3xl font-light tracking-[-0.025em]"
              >
                Sua composição
              </h2>

              <p
                role="status"
                className="mt-2 max-w-xl text-[12px] leading-relaxed text-store-muted"
              >
                {status ||
                  `${selectedRegions.length} ${
                    selectedRegions.length === 1
                      ? 'região selecionada'
                      : 'regiões selecionadas'
                  }.`}
              </p>
            </div>

            <button
              type="button"
              onClick={buildProject}
              disabled={!selectedRegions.length || building}
              className="inline-flex min-h-[44px] items-center gap-3 rounded-full bg-store-surface px-5 py-3 text-[12px] text-store-muted transition-colors hover:bg-store-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              {building
                ? 'Buscando sugestões…'
                : 'Sugerir uma composição'}

              {!building && <Arrow />}
            </button>
          </div>

          {!selectedRegions.length ? (
            <p className="mt-6 text-[13px] text-store-muted">
              As regiões e joias escolhidas aparecerão aqui.
            </p>
          ) : (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {selectedRegions.map((region) => {
                const item = choices[region.id]!

                return (
                  <li key={region.id}>
                    <button
                      type="button"
                      disabled={building}
                      onClick={() => selectRegion(region.id)}
                      className="flex h-full w-full items-start gap-3 rounded-[24px] bg-store-surface p-4 text-left transition-colors hover:bg-store-surface disabled:opacity-60"
                    >
                      {item.product ? (
                        <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-full bg-store-surface">
                          <Image
                            src={item.product.image}
                            alt=""
                            fill
                            sizes="56px"
                            className="object-contain p-1"
                          />
                        </span>
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-store-raised font-display text-xl text-store-accent"
                        >
                          +
                        </span>
                      )}

                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">
                          {region.name}
                        </span>

                        <span className="mt-1 block text-[10px] leading-relaxed text-store-muted">
                          {COLORS[item.color]} ·{' '}
                          {TYPES[item.type]} ·{' '}
                          {DETAILS[item.detail]}
                        </span>

                        <span className="mt-2 block line-clamp-2 text-[11px] leading-relaxed text-store-muted">
                          {item.product?.name ||
                            'Escolher com a equipe'}
                        </span>

                        <span className="mt-2 block text-[10px] text-store-accent underline underline-offset-2">
                          Editar
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mt-7 grid items-end gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
            <label className="block text-[12px] text-store-muted">
              Quer acrescentar algo?

              <textarea
                value={notes}
                onChange={(event) =>
                  setNotes(event.target.value)
                }
                disabled={building}
                maxLength={600}
                rows={3}
                placeholder="Seu estilo, as joias que já usa ou alguma ideia que gostaria de experimentar…"
                className="mt-3 w-full resize-y rounded-[22px] border border-transparent bg-store-surface px-4 py-3 text-[13px] leading-relaxed outline-none placeholder:text-store-muted focus:border-[#B49A73]"
              />
            </label>

            {whatsapp && <div className="pb-1">
              <button
                type="button"
                onClick={openWhatsapp}
                disabled={!selectedRegions.length || building}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-4 rounded-full bg-store-action px-5 py-3.5 text-[12px] text-white transition-colors hover:bg-[#504638] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                Conversar sobre meu projeto
                <Arrow />
              </button>

              <p className="mt-3 max-w-sm text-[11px] leading-relaxed text-store-muted">
                O WhatsApp abrirá com suas escolhas prontas
                para revisar e enviar.
              </p>
            </div>}
          </div>
        </section>

        <p className="mt-5 max-w-3xl text-[10px] leading-relaxed text-store-muted">
          Simulação visual com posições indicativas. A equipe
          confirma anatomia, medidas, encaixes e possibilidade
          de novas perfurações. Preços, variações e
          disponibilidade são confirmados no atendimento.
          As escolhas não reservam estoque.
        </p>
      </div>
    </div>
  )
}
