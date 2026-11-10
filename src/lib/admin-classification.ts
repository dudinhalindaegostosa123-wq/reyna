import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  AREA_OPTIONS,
  getSubareaOptions,
} from '@/lib/catalog-area'

import type { ClassificationOptions } from '@/app/admin/produtos/[id]/ProductClassification'

type AdminClassificationOptions = ClassificationOptions & {
  categoryLabels: Record<string, string>
}

interface CategorySetting {
  slug: string
  sourceName: string
  displayName: string
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bpiercings?\b/g, ' ')
    .replace(/\b(para|de|da|do|na|no)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function getAdminClassification(
  db: SupabaseClient
): Promise<AdminClassificationOptions> {
  const categories = new Set<string>()
  const materials = new Set<string>()
  const tags = new Set<string>()

  const settings = new Map<string, CategorySetting>()

  const pageSize = 500

  for (let offset = 0; ; offset += pageSize) {
    const result = await db
      .from('products')
      .select('id,material,categories,tags')
      .order('id')
      .range(offset, offset + pageSize - 1)

    if (result.error) {
      throw new Error('ADMIN_CLASSIFICATION_READ')
    }

    const rows = result.data || []

    rows.forEach(row => {
      if (
        typeof row.material === 'string' &&
        row.material.trim()
      ) {
        materials.add(row.material)
      }

      if (Array.isArray(row.categories)) {
        row.categories.forEach((value: unknown) => {
          if (
            typeof value === 'string' &&
            value.trim()
          ) {
            categories.add(value)
          }
        })
      }

      if (Array.isArray(row.tags)) {
        row.tags.forEach((value: unknown) => {
          if (
            typeof value === 'string' &&
            value.trim()
          ) {
            tags.add(value)
          }
        })
      }
    })

    if (rows.length < pageSize) break
  }

  for (let offset = 0; ; offset += pageSize) {
    const result = await db
      .from('serenity_category_settings')
      .select('slug,source_name,display_name')
      .order('slug')
      .range(offset, offset + pageSize - 1)

    if (result.error) {
      throw new Error('ADMIN_CATEGORY_SETTINGS_READ')
    }

    const rows = result.data || []

    rows.forEach(row => {
      const slug = String(row.slug || '')
      const sourceName = String(row.source_name || '').trim()
      const displayName = String(row.display_name || '').trim()

      if (!slug) return

      settings.set(slug, {
        slug,
        sourceName,
        displayName,
      })

      if (sourceName) {
        categories.add(sourceName)
      }
    })

    if (rows.length < pageSize) break
  }

  const categoryLabels: Record<string, string> =
    Object.create(null)

  Array.from(categories).forEach(value => {
    const setting = settings.get(slugify(value))

    categoryLabels[value] =
      setting?.displayName || value
  })

  const definitions = AREA_OPTIONS
    .filter(area => area.value !== 'all')
    .map(area => ({
      label: area.label,

      keys: [
        area.value,
        normalize(area.label),

        ...getSubareaOptions(area.value)
          .filter(option => option.value !== 'all')
          .flatMap(option => [
            option.value,
            normalize(option.label),
          ]),
      ],

      categories: [] as string[],
    }))

  const other: string[] = []

  const aliases: Record<string, string> = {
    concha: 'conch',
    lobulos: 'lobulo',
    industrial: 'transversal',
    septum: 'septo',
    'genital-masculino': 'genital-masculina',
    mamilos: 'mamilo',
  }

  Array.from(categories)
    .sort((a, b) => {
      const labelA = categoryLabels[a] || a
      const labelB = categoryLabels[b] || b

      return (
        labelA.localeCompare(labelB, 'pt-BR') ||
        a.localeCompare(b, 'pt-BR')
      )
    })
    .forEach(value => {
      const key = normalize(value)

      const canonical =
        Object.prototype.hasOwnProperty.call(aliases, key)
          ? aliases[key]
          : key

      const group = definitions.find(item =>
        item.keys.includes(canonical) ||
        item.keys.some(candidate =>
          canonical ===
          `${normalize(item.label)}-${candidate}`
        )
      )

      if (group) {
        group.categories.push(value)
      } else {
        other.push(value)
      }
    })

  return {
    materials: Array.from(materials).sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    ),

    tags: Array.from(tags).sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    ),

    categoryLabels,

    groups: [
      ...definitions
        .filter(item => item.categories.length > 0)
        .map(({ label, categories }) => ({
          label,
          categories,
        })),

      ...(other.length
        ? [
            {
              label: 'Outras categorias',
              categories: other,
            },
          ]
        : []),
    ],
  }
}
