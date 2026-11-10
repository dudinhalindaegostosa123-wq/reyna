'use client'

import { useFormState, useFormStatus } from 'react-dom'
import type { Commercial, EditableProduct, ProductBundle } from '@/lib/admin-product-editor'
import { saveProduct } from './actions'

const inputClass = 'mt-2 min-h-[44px] w-full rounded-xl border border-[#DFD7CB] bg-white px-3 py-2 text-[16px] outline-none focus:border-[#947B57] sm:text-sm'
const cardClass = 'rounded-[24px] border border-[#E5DED3] bg-white p-5 sm:p-7'

interface FieldProps {
  name: string
  label: string
  value: unknown
  long?: boolean
  limit?: number
}

function Field({ name, label, value, long = false, limit = 300 }: FieldProps) {
  const text = value == null ? '' : String(value)

  return (
    <label className="block text-xs text-[#625B51]">
      {label}
      {long ? (
        <textarea
          name={name}
          defaultValue={text}
          maxLength={limit}
          rows={5}
          className={inputClass}
        />
      ) : (
        <input
          name={name}
          defaultValue={text}
          maxLength={limit}
          className={inputClass}
        />
      )}
    </label>
  )
}

function CommercialFields({
  value,
  prefix,
  variation = false,
}: {
  value: Commercial
  prefix: string
  variation?: boolean
}) {
  return (
    <div className="mt-5 rounded-2xl bg-[#F8F5EF] p-4">
      <p className="text-xs font-medium">
        Fornecedor e custo · Uso interno
      </p>

      <p className="mb-4 mt-1 text-[11px] leading-relaxed text-[#81796C]">
        Opcionais e protegidos do catálogo público.{' '}
        {variation
          ? 'Vazio: usar os dados do produto quando houver.'
          : 'Sem custo preenchido, a margem fica não informada.'}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name={`${prefix}supplier_name`}
          label="Fornecedor"
          value={value.supplier_name}
          limit={180}
        />
        <Field
          name={`${prefix}unit_cost`}
          label="Custo unitário (R$)"
          value={value.unit_cost}
          limit={40}
        />
      </div>
    </div>
  )
}

function PriceStock({
  row,
  prefix,
}: {
  row: EditableProduct
  prefix: string
}) {
  const scheduled = row.sale_starts_at || row.sale_ends_at

  return (
    <>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field
          name={`${prefix}regular_price`}
          label="Preço base (R$)"
          value={row.regular_price}
          limit={40}
        />
        <Field
          name={`${prefix}sale_price`}
          label="Preço promocional (R$) · Opcional"
          value={row.sale_price}
          limit={40}
        />
        <Field
          name={`${prefix}stock_quantity`}
          label="Quantidade em estoque · Vazio: sem quantidade definida"
          value={row.stock_quantity}
          limit={40}
        />

        <label className="block text-xs text-[#625B51]">
          Situação do estoque
          <select
            name={`${prefix}stock_status`}
            defaultValue={row.stock_status}
            className={inputClass}
          >
            <option value="instock">Em estoque</option>
            <option value="outofstock">Sem estoque</option>
            <option value="onbackorder">Sob encomenda</option>
          </select>
        </label>
      </div>

      {Boolean(scheduled) && (
        <p className="mt-3 text-[11px] text-[#81796C]">
          A promoção possui agendamento importado, que será preservado ao salvar.
          {' '}Início:{' '}
          {row.sale_starts_at
            ? new Date(String(row.sale_starts_at)).toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
              })
            : 'não definido'}.
          {' '}Fim:{' '}
          {row.sale_ends_at
            ? new Date(String(row.sale_ends_at)).toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
              })
            : 'não definido'}.
        </p>
      )}
    </>
  )
}

function Submit() {
  const { pending } = useFormStatus()

  return (
    <button
      disabled={pending}
      className="min-h-[46px] rounded-full bg-[#292621] px-8 text-sm text-white disabled:opacity-50"
    >
      {pending ? 'Salvando…' : 'Salvar alterações'}
    </button>
  )
}

export default function ProductEditor({ bundle }: { bundle: ProductBundle }) {
  const [state, action] = useFormState(
    saveProduct.bind(null, String(bundle.product.id)),
    { error: '' }
  )

  const p = bundle.product

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="version" value={bundle.version} />

      <section className={cardClass}>
        <h2 className="mb-5 text-lg font-medium">
          Informações do produto
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="p.name" label="Nome" value={p.name} />

          <Field
            name="p.sku"
            label="Código / SKU"
            value={p.sku}
            limit={180}
          />

          <label className="block text-xs text-[#625B51]">
            Publicação
            <select
              name="p.status"
              defaultValue={String(p.status)}
              className={inputClass}
            >
              <option value="published">Publicado</option>
              <option value="draft">Rascunho</option>
            </select>
          </label>
        </div>

        <div className="mt-5 space-y-4">
          <Field
            name="p.short_description"
            label="Descrição curta"
            value={p.short_description}
            long
            limit={20000}
          />

          <Field
            name="p.description"
            label="Descrição completa · HTML existente é preservado"
            value={p.description}
            long
            limit={500000}
          />
        </div>
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-medium">
          Preços e estoque do produto
        </h2>

        {bundle.variants.length > 0 && (
          <p className="mt-2 text-xs text-[#81796C]">
            Os preços das opções são editados nas variações abaixo.
            A quantidade do produto pode limitar o estoque total das variações.
          </p>
        )}

        <PriceStock row={p} prefix="p." />
        <CommercialFields value={bundle.commercial} prefix="p." />
      </section>

      {bundle.variants.length > 0 && (
        <section className={cardClass}>
          <h2 className="mb-4 text-lg font-medium">
            Variações ({bundle.variants.length})
          </h2>

          <div className="space-y-3">
            {bundle.variants.map((variant) => {
              const prefix = `v.${variant.id}.`

              return (
                <details
                  key={String(variant.id)}
                  className="rounded-2xl border border-[#E5DED3] p-4"
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {variant.name} · ID {String(variant.woo_id ?? variant.id)}
                  </summary>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field
                      name={`${prefix}name`}
                      label="Nome da variação"
                      value={variant.name}
                    />

                    <Field
                      name={`${prefix}sku`}
                      label="SKU da variação"
                      value={variant.sku}
                      limit={180}
                    />
                  </div>

                  <p className="mt-3 text-xs text-[#81796C]">
                    {Object.entries(
                      (variant.attributes || {}) as Record<string, unknown>
                    )
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join(' · ') || 'Sem atributos informados no cadastro original'}
                  </p>

                  <label className="mt-4 flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      name={`${prefix}enabled`}
                      defaultChecked={variant.enabled !== false}
                    />
                    Variação habilitada
                  </label>

                  <PriceStock row={variant} prefix={prefix} />

                  <CommercialFields
                    value={variant.commercial || {}}
                    prefix={prefix}
                    variation
                  />
                </details>
              )
            })}
          </div>
        </section>
      )}

      <section className={cardClass}>
        <h2 className="mb-5 text-lg font-medium">
          SEO do produto
        </h2>

        <div className="space-y-4">
          <Field
            name="p.seo_title"
            label="Título para os buscadores · Opcional"
            value={p.seo_title}
          />

          <Field
            name="p.seo_description"
            label="Descrição para os buscadores · Opcional"
            value={p.seo_description}
            long
            limit={2000}
          />
        </div>
      </section>

      {state.error && (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-[#E5DED3] bg-[#FAFAF8] py-4">
        <p className="text-xs text-[#81796C]">
          Custo vazio significa não informado. Zero é um custo informado.
        </p>
        <Submit />
      </div>
    </form>
  )
}
