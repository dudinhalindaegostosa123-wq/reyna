'use client'

import { useRef, useState } from 'react'
import { testShipping } from './actions'
import type { ShippingTestResult } from '@/lib/shipping-test'

const fields = [
  ['origin', 'CEP de origem da loja', '00000-000', 'text'],
  ['destination', 'CEP de destino para teste', '00000-000', 'text'],
  ['weight', 'Peso total embalado (gramas)', 'Inclua a caixa e a proteção', 'numeric'],
  ['width', 'Largura da embalagem (cm)', 'Medida externa', 'decimal'],
  ['height', 'Altura da embalagem (cm)', 'Medida externa', 'decimal'],
  ['length', 'Comprimento da embalagem (cm)', 'Medida externa', 'decimal'],
  ['value', 'Valor declarado do conteúdo (R$)', 'Sem separador de milhar', 'decimal'],
] as const

export default function ShippingTest() {
  const formRef = useRef<HTMLFormElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ShippingTestResult | null>(null)

  async function run(kind: 'connection' | 'quote') {
    if (busy || !formRef.current) return

    setBusy(true)
    setResult(null)

    try {
      setResult(
        await testShipping(kind, new FormData(formRef.current))
      )
    } catch {
      setResult({
        ok: false,
        message: 'A consulta não terminou. Atualize a página e tente novamente.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={event => {
        event.preventDefault()
        void run('quote')
      }}
      className="space-y-6"
      aria-busy={busy}
    >
      <div className="rounded-2xl border border-[#E5DED3] bg-white p-5 sm:p-7">
        <h2 className="text-lg font-medium">
          Conexão com o Melhor Envio
        </h2>

        <p className="mt-2 text-xs leading-relaxed text-[#756B5D]">
          Confira primeiro se a chave configurada permite consultar as transportadoras.
        </p>

        <button
          type="button"
          disabled={busy}
          onClick={() => void run('connection')}
          className="mt-4 rounded-full border border-[#CFC3B1] px-5 py-3 text-xs disabled:opacity-50"
        >
          Testar conexão
        </button>
      </div>

      <div className="rounded-2xl border border-[#E5DED3] bg-white p-5 sm:p-7">
        <h2 className="text-lg font-medium">Simular um envio</h2>

        <p className="mt-2 text-xs leading-relaxed text-[#756B5D]">
          Informe uma embalagem real, já com as joias e a proteção.
          As medidas são externas.
        </p>

        <fieldset
          disabled={busy}
          className="mt-6 grid gap-4 sm:grid-cols-2"
        >
          <legend className="sr-only">
            Dados da embalagem para cotação
          </legend>

          {fields.map(([name, label, placeholder, mode]) => (
            <label key={name} className="block text-xs">
              {label}
              <input
                name={name}
                inputMode={mode}
                placeholder={placeholder}
                maxLength={30}
                autoComplete="off"
                className="mt-2 min-h-[44px] w-full rounded-xl border border-[#DDD4C7] bg-[#FCFBF8] px-3 text-base outline-none focus:border-[#947B57] sm:text-sm"
              />
            </label>
          ))}
        </fieldset>

        <button
          type="submit"
          disabled={busy}
          className="mt-6 rounded-full bg-[#292621] px-6 py-3 text-xs text-white disabled:opacity-50"
        >
          {busy ? 'Consultando…' : 'Calcular fretes de teste'}
        </button>
      </div>

      <div role="status" aria-live="polite" className="text-sm">
        {result && (
          <p
            className={`rounded-xl p-4 ${
              result.ok
                ? 'bg-[#EDF2EA] text-[#42563A]'
                : 'bg-[#F8EDE8] text-[#8A4933]'
            }`}
          >
            {result.message}
          </p>
        )}
      </div>

      {result?.ok && Boolean(result.quotes?.length) && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {result.quotes?.map((quote, index) => (
            <li
              key={`${quote.id}-${index}`}
              className="rounded-2xl border border-[#E5DED3] bg-white p-5"
            >
              <p className="text-xs text-[#756B5D]">
                {quote.company}
              </p>

              <h3 className="mt-1 text-sm font-medium">
                {quote.service}
              </h3>

              <p className="mt-4 text-xl font-medium">
                {quote.price.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </p>

              <p className="mt-1 text-xs text-[#756B5D]">
                {quote.days === null
                  ? 'Prazo a confirmar'
                  : `Prazo de entrega estimado: ${quote.days} dia(s) após a confirmação do pagamento`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}
