'use client'

import { useState } from 'react'
import type { ShippingSettings } from '@/lib/shipping'
import { saveShippingSettings } from './settings-actions'

export default function ShippingSettingsForm({ settings }: { settings: ShippingSettings }) {
  const [version, setVersion] = useState(settings.version)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  return (
    <form
      className="mb-7 rounded-2xl border border-[#E5DED3] bg-white p-5 sm:p-7"
      onSubmit={async event => {
        event.preventDefault()
        if (busy) return
        const data = new FormData(event.currentTarget)
        setBusy(true)
        setMessage('')

        try {
          const result = await saveShippingSettings(data)
          if (result.error) setMessage(result.error)
          else {
            setVersion(result.version!)
            setMessage('Configurações salvas. As novas cotações usarão estes dados.')
          }
        } catch {
          setMessage('Falha de conexão. Atualize a página antes de tentar novamente.')
        } finally {
          setBusy(false)
        }
      }}
    >
      <h2 className="text-lg font-medium">Embalagem padrão e origem</h2>
      <p className="mt-2 text-xs leading-relaxed text-[#756B5D]">
        Confirme o peso total embalado e o limite de peças que cabem neste pacote.
        Pedidos acima do limite ou com produtos da lista de exceções terão o frete confirmado pela equipe.
      </p>

      <input type="hidden" name="version" value={version} />

      <fieldset disabled={busy} className="mt-5 grid gap-4 sm:grid-cols-2">
        {([
          ['origin', 'CEP de origem', settings.origin],
          ['weight_g', 'Peso total embalado (g)', settings.weight_g],
          ['height', 'Altura (cm)', settings.height],
          ['width', 'Largura (cm)', settings.width],
          ['length', 'Comprimento (cm)', settings.length],
          ['max_units', 'Limite de peças por pacote', settings.max_units ?? ''],
        ] as const).map(([name, label, value]) => (
          <label key={name} className="text-xs">
            {label}
            <input
              name={name}
              defaultValue={value}
              maxLength={20}
              inputMode={name === 'origin' ? 'text' : 'decimal'}
              className="mt-2 min-h-[44px] w-full rounded-xl border border-[#DDD4C7] px-3 text-base sm:text-sm"
            />
          </label>
        ))}

        <label className="text-xs sm:col-span-2">
          Produtos que precisam de outra embalagem (opcional)
          <textarea
            name="manual_slugs"
            defaultValue={settings.manual_slugs.join('\n')}
            maxLength={36500}
            rows={3}
            placeholder="Cole os slugs dos produtos, um por linha. Ex.: porta-joias-grande"
            className="mt-2 w-full rounded-xl border border-[#DDD4C7] p-3 text-sm"
          />
        </label>

        <label className="flex items-start gap-3 text-sm sm:col-span-2">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="mt-1" />
          <span>Ativar cotação automática no checkout para pedidos que cabem neste pacote.</span>
        </label>
      </fieldset>

      <p className="mt-4 text-xs text-[#756B5D]">
        Sem um limite confirmado, deixe a cotação automática desativada.
        O cliente poderá enviar o pedido com frete a confirmar.
      </p>

      <button disabled={busy} className="mt-5 rounded-full bg-[#292621] px-6 py-3 text-xs text-white disabled:opacity-50">
        {busy ? 'Salvando…' : 'Salvar configurações'}
      </button>
      <p role="status" className="mt-3 text-sm">{message}</p>
    </form>
  )
}
