'use client'

import { useState } from 'react'
import type { EditableProduct } from '@/lib/admin-product-editor'

export interface ClassificationOptions {
  materials: string[]
  tags: string[]
  categoryLabels?: Record<string, string>
  groups: {
    label: string
    categories: string[]
  }[]
}

const fieldClass =
  'mt-2 min-h-[44px] min-w-0 w-full rounded-xl border border-[#DFD7CB] bg-white px-3 py-2 text-base outline-none focus:border-[#947B57] sm:text-sm'

export default function ProductClassification({
  product,
  options,
}: {
  product: EditableProduct
  options: ClassificationOptions
}) {
  const [selected, setSelected] = useState<string[]>(
    (product.categories || []) as string[]
  )

  const [material, setMaterial] = useState(
    String(product.material || '')
  )

  const [tags, setTags] = useState<string[]>(
    (product.tags || []) as string[]
  )

  const [newTag, setNewTag] = useState('')

  function categoryLabel(value: string): string {
    const labels = options.categoryLabels

    if (
      labels &&
      Object.prototype.hasOwnProperty.call(labels, value)
    ) {
      return labels[value] || value
    }

    return value
  }

  const tagOptions = Array.from(
    new Set([...options.tags, ...tags])
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const materials = Array.from(
    new Set([
      ...options.materials,
      ...(material ? [material] : []),
    ])
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const known = new Set(
    options.groups.flatMap(group => group.categories)
  )

  const extra = selected.filter(value => !known.has(value))

  const groups = extra.length
    ? [
        ...options.groups,
        {
          label: 'Outras categorias deste produto',
          categories: extra,
        },
      ]
    : options.groups

  function toggle(value: string) {
    setSelected(old =>
      old.includes(value)
        ? old.filter(item => item !== value)
        : [...old, value]
    )
  }

  function addTag() {
    const value = newTag.trim()

    if (
      !value ||
      value.length > 180 ||
      tags.length >= 80
    ) {
      return
    }

    setTags(old =>
      old.includes(value) ? old : [...old, value]
    )

    setNewTag('')
  }

  return (
    <section className="rounded-3xl border border-[#E5DED3] bg-white p-5 sm:p-7">
      <h2 className="mb-5 text-lg font-medium">
        Material, categorias e subcategorias
      </h2>

      <label className="block text-xs text-[#625B51]">
        Material

        <select
          name="p.material"
          value={material}
          onChange={event => setMaterial(event.target.value)}
          className={fieldClass}
        >
          <option value="">
            Selecione o material
          </option>

          {materials.map(value => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <input
        type="hidden"
        name="p.categories"
        value={selected.join('\n')}
      />

      <p className="mb-4 mt-6 text-xs text-[#625B51]">
        Categorias e subcategorias · Marque as opções
        adequadas à peça.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map(group => {
          const selectedCount = group.categories.filter(
            value => selected.includes(value)
          ).length

          return (
            <details
              key={group.label}
              open={selectedCount > 0}
              className="min-w-0 rounded-2xl border border-[#E5DED3] p-4"
            >
              <summary className="cursor-pointer text-sm font-medium">
                {group.label}

                {selectedCount > 0 && (
                  <span className="ml-2 text-xs font-normal text-[#81796C]">
                    {selectedCount}
                  </span>
                )}
              </summary>

              <div className="mt-4 space-y-2">
                {group.categories.map(value => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-xs ${
                      selected.includes(value)
                        ? 'border-[#B8986A] bg-[#F8F5EF]'
                        : 'border-[#E5DED3] bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(value)}
                      onChange={() => toggle(value)}
                      className="mt-0.5"
                    />

                    <span className="min-w-0 break-words">
                      {categoryLabel(value)}
                    </span>
                  </label>
                ))}
              </div>
            </details>
          )
        })}
      </div>

      {selected.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {selected.map(value => (
            <button
              key={value}
              type="button"
              onClick={() => toggle(value)}
              className="max-w-full break-words rounded-full bg-[#F0EBE3] px-3 py-2 text-left text-xs"
              aria-label={`Remover categoria ${categoryLabel(value)}`}
            >
              {categoryLabel(value)} ×
            </button>
          ))}
        </div>
      )}

      <input
        type="hidden"
        name="p.tags"
        value={tags.join('\n')}
      />

      <details className="mt-6 rounded-2xl border border-[#E5DED3] p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Tags e características ({tags.length})
        </summary>

        <p className="mb-4 mt-3 text-xs text-[#81796C]">
          A tag Anodizável permite oferecer a personalização
          da cor para esta peça.
        </p>

        <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
          {tagOptions.map(value => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E5DED3] px-3 py-3 text-xs"
            >
              <input
                type="checkbox"
                checked={tags.includes(value)}
                onChange={() =>
                  setTags(old =>
                    old.includes(value)
                      ? old.filter(item => item !== value)
                      : [...old, value]
                  )
                }
                className="mt-0.5"
              />

              <span className="break-words">
                {value}
              </span>
            </label>
          ))}
        </div>

        {!tagOptions.length && (
          <p className="text-xs text-[#81796C]">
            Nenhuma tag cadastrada no catálogo.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 text-xs">
            Nova característica

            <input
              value={newTag}
              onChange={event => setNewTag(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addTag()
                }
              }}
              maxLength={180}
              placeholder="Ex.: Anodizável"
              className={fieldClass}
            />
          </label>

          <button
            type="button"
            onClick={addTag}
            className="min-h-[44px] rounded-full border border-[#DFD7CB] px-4 text-xs"
          >
            Adicionar tag
          </button>
        </div>
      </details>

      <div className="mt-5 flex flex-wrap gap-5 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="p.featured"
            defaultChecked={product.featured === true}
          />
          Destaque
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="p.sold_individually"
            defaultChecked={product.sold_individually === true}
          />
          Limitar a uma unidade por compra
        </label>
      </div>
    </section>
  )
}
