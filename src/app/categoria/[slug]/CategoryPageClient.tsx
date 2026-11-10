'use client'

import { useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {coatedGoldCopy} from '@/lib/stem-description'
import type { Product } from '@/lib/data'
import ProductCard from '@/components/ui/ProductCard'
import { ChevronDown } from 'lucide-react'

interface FilterOption {
  value: string
  label: string
}

interface Props {
  products: Product[]
  categoryName: string
  categoryDescription: string
  materials: string[]
  material: string
  sort: string
  areaLabel?: string
  area?: string
  areas?: FilterOption[]
  subarea?: string
  subareas?: FilterOption[]
  jewelry?: string
  jewelryOptions?: FilterOption[]
  page: number
  total: number
  totalPages: number
}

const SORT_OPTIONS = [
  { value: 'default', label: 'Padrão' },
  { value: 'price-asc', label: 'Menor preço' },
  { value: 'price-desc', label: 'Maior preço' },
  { value: 'name-asc', label: 'A-Z' },
]

function FilterOptions({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2.5 text-[11px] font-medium text-store-muted">
        {label}
      </legend>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`min-h-[40px] rounded-full border px-3 py-2 text-[11px] transition-colors disabled:opacity-50 md:px-4 md:text-[12px] ${
              value === option.value
                ? 'border-store-selected bg-store-action text-white'
                : 'border-store-border bg-store-surface text-store-muted hover:border-[#B6A58A]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export default function CategoryPageClient(props: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  const area = props.area || 'all'
  const areas = props.areas || []
  const subarea = props.subarea || 'all'
  const subareas = props.subareas || []
  const jewelry = props.jewelry || 'all'
  const jewelryOptions = props.jewelryOptions || []

  const materials = Array.from(
    new Set(props.materials.filter(Boolean))
  )

  const materialOptions = [
    { value: 'all', label: 'Todos' },
    ...materials.map((material) => ({
      value: material,
      label: coatedGoldCopy(material),
    })),
  ]

  const filterCount = [
    props.material,
    area,
    subarea,
    jewelry,
  ].filter((value) => value && value !== 'all').length

  const hasFilters = filterCount > 0

  function href(
    page: number,
    material = props.material,
    sort = props.sort,
    nextArea = area,
    nextSubarea = subarea,
    nextJewelry = jewelry
  ) {
    const query = new URLSearchParams()

    if (page > 1) {
      query.set('page', String(page))
    }

    if (material !== 'all') {
      query.set('material', material)
    }

    if (sort !== 'default') {
      query.set('sort', sort)
    }

    if (areas.length && nextArea !== 'all') {
      query.set('area', nextArea)

      if (nextSubarea !== 'all') {
        query.set('subarea', nextSubarea)
      }
    }

    if (jewelryOptions.length && nextJewelry !== 'all') {
      query.set('jewelry', nextJewelry)
    }

    const search = query.toString()
    return `${pathname}${search ? `?${search}` : ''}`
  }

  function change(
    material: string,
    sort: string,
    nextArea = area,
    nextSubarea = subarea,
    nextJewelry = jewelry
  ) {
    startTransition(() => {
      router.push(
        href(
          1,
          material,
          sort,
          nextArea,
          nextSubarea,
          nextJewelry
        ),
        { scroll: false }
      )
    })
  }

  function clearFilters() {
    change('all', props.sort, 'all', 'all', 'all')
  }

  function renderFilters() {
    return (
      <fieldset
        disabled={pending}
        className="min-w-0 space-y-5"
      >
        <legend className="sr-only">
          Filtrar produtos
        </legend>

        {areas.length > 0 && (
          <FilterOptions
            label={props.areaLabel || "Local da perfuração"}
            value={area}
            options={areas}
            onChange={(value) =>
              change(
                props.material,
                props.sort,
                value,
                'all'
              )
            }
          />
        )}

        {subareas.length > 0 && (
          <div className="rounded-2xl bg-store-raised p-3 md:p-4">
            <FilterOptions
              label="Subcategoria"
              value={subarea}
              options={subareas}
              onChange={(value) =>
                change(
                  props.material,
                  props.sort,
                  area,
                  value
                )
              }
            />
          </div>
        )}

        {jewelryOptions.length > 0 && (
          <FilterOptions
            label="Tipo de joia"
            value={jewelry}
            options={jewelryOptions}
            onChange={(value) =>
              change(
                props.material,
                props.sort,
                area,
                subarea,
                value
              )
            }
          />
        )}

        <FilterOptions
          label="Material"
          value={props.material}
          options={materialOptions}
          onChange={(value) =>
            change(value, props.sort)
          }
        />

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="min-h-[40px] text-[11px] text-store-muted underline underline-offset-4"
          >
            Limpar filtros
          </button>
        )}
      </fieldset>
    )
  }

  function renderSort() {
    return (
      <label className="relative block">
        <span className="sr-only">
          Ordenar produtos
        </span>

        <select
          value={props.sort}
          disabled={pending}
          onChange={(event) =>
            change(props.material, event.target.value)
          }
          className="min-h-[44px] w-full appearance-none rounded-full border border-store-border bg-store-surface py-2 pl-4 pr-9 text-[11px] text-store-muted outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B49A73] disabled:opacity-50 md:min-w-[165px] md:text-[12px]"
        >
          {SORT_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>

        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-store-muted"
        />
      </label>
    )
  }

  const pages = Array.from(
    new Set([
      1,
      props.page - 2,
      props.page - 1,
      props.page,
      props.page + 1,
      props.page + 2,
      props.totalPages,
    ])
  )
    .filter(
      (page) => page >= 1 && page <= props.totalPages
    )
    .sort((a, b) => a - b)

  return (
    <div
      className="min-h-screen bg-store-canvas text-store-text"
      aria-busy={pending}
    >
      <div className="border-b border-store-border">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 md:px-10 md:py-8">
          <h1 className="font-display text-[25px] font-medium leading-[1.2] tracking-[-0.025em] sm:text-[28px] md:text-4xl">
            {props.categoryName}
          </h1>

          {props.categoryDescription && (
            <p className="mt-2.5 max-w-xl text-[12px] leading-6 text-store-muted md:text-[13px]">
              {props.categoryDescription}
            </p>
          )}

          <p className="mt-2 text-[11px] text-store-muted">
            {props.total}{' '}
            {props.total === 1 ? 'produto' : 'produtos'}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 md:px-10 md:py-7">
        {/* Filtros recolhidos no celular */}

        <div className="relative mb-5 border-b border-store-border pb-5 md:hidden">
          <details className="group">
            <summary className="flex min-h-[44px] w-[calc(50%-6px)] cursor-pointer list-none items-center justify-center gap-2 rounded-full border border-store-border bg-store-surface px-3 text-[11px] text-store-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B49A73] [&::-webkit-details-marker]:hidden">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="h-4 w-4"
              >
                <path d="M4 7h16M4 17h16M8 4v6M16 14v6" />
              </svg>

              Filtrar

              {hasFilters && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-store-action px-1 text-[10px] text-white">
                  {filterCount}
                </span>
              )}

              <ChevronDown
                size={13}
                className="transition-transform group-open:rotate-180"
              />
            </summary>

            <div className="pt-5">
              {renderFilters()}
            </div>
          </details>

          <div className="absolute right-0 top-0 w-[calc(50%-6px)]">
            {renderSort()}
          </div>
        </div>

        {/* Filtros visíveis no computador */}

        <div className="mb-6 hidden border-b border-store-border pb-6 md:block">
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="text-[12px] font-medium text-store-muted">
              Filtrar por
            </p>

            {renderSort()}
          </div>

          {renderFilters()}
        </div>

        <p role="status" className="sr-only">
          {pending
            ? 'Atualizando produtos.'
            : `${props.total} produtos encontrados.`}
        </p>

        <div
          className={`transition-opacity ${
            pending ? 'opacity-50' : 'opacity-100'
          }`}
        >
          {props.products.length ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
              {props.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[20px] bg-store-raised px-5 py-10 text-center">
              <p className="text-[13px] text-store-muted">
                Nenhum produto encontrado para essa seleção.
              </p>

              {hasFilters && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={clearFilters}
                  className="mt-3 min-h-[44px] text-[12px] text-store-accent underline underline-offset-4"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>

        {props.totalPages > 1 && (
          <nav
            aria-label="Paginação"
            className="mt-8 flex flex-wrap items-center justify-center gap-2"
          >
            {props.page > 1 && (
              <Link
                prefetch={false}
                href={href(props.page - 1)}
                aria-label="Página anterior"
                className="flex h-11 min-w-[44px] items-center justify-center rounded-full border border-store-border px-3 text-xs"
              >
                ←
              </Link>
            )}

            {pages.map((page, index) => (
              <span
                key={page}
                className="flex items-center gap-2"
              >
                {index > 0 &&
                  page - pages[index - 1] > 1 && (
                    <span className="text-store-muted">
                      …
                    </span>
                  )}

                <Link
                  prefetch={false}
                  href={href(page)}
                  aria-current={
                    page === props.page ? 'page' : undefined
                  }
                  aria-label={`Página ${page}`}
                  className={`flex h-11 min-w-[44px] items-center justify-center rounded-full border px-3 text-xs ${
                    page === props.page
                      ? 'border-store-selected bg-store-action text-white'
                      : 'border-store-border hover:border-[#B49A73]'
                  }`}
                >
                  {page}
                </Link>
              </span>
            ))}

            {props.page < props.totalPages && (
              <Link
                prefetch={false}
                href={href(props.page + 1)}
                aria-label="Próxima página"
                className="flex h-11 min-w-[44px] items-center justify-center rounded-full border border-store-border px-3 text-xs"
              >
                →
              </Link>
            )}
          </nav>
        )}
      </div>
    </div>
  )
}
