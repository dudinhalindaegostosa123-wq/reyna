'use client'

import { useState } from 'react'
import type { SenderData } from '@/lib/label-draft'
import { partyIssues } from '@/lib/label-draft'
import LabelPartyFields from './LabelPartyFields'
import { saveLabelSender } from '@/app/admin/frete/label-actions'

export default function LabelSenderForm({
  initial,
}: {
  initial: SenderData
}) {
  const [sender, setSender] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [dirty, setDirty] = useState(false)

  const savedIssues = partyIssues(
    sender.fields,
    'Remetente'
  )

  return (
    <section className="mb-7 rounded-2xl border border-[#E5DED3] bg-white p-5 sm:p-7">
      <h2 className="text-lg font-medium">
        Remetente das etiquetas
      </h2>

      <p className="mb-5 mt-2 text-xs leading-relaxed text-[#756B5D]">
        Cadastre os dados reais da pessoa ou empresa
        que despacha os pedidos. É possível salvar
        parcialmente; os campos pendentes aparecerão
        na preparação de cada envio. O CEP deve ser
        o mesmo da origem configurada para o frete.
      </p>

      <form
        key={sender.version}
        onChange={() => setDirty(true)}
        onSubmit={async event => {
          event.preventDefault()

          if (busy) return

          const form = new FormData(
            event.currentTarget
          )

          setBusy(true)
          setMessage('')

          try {
            const result = await saveLabelSender(form)

            if (result.error) {
              setMessage(result.error)
            } else if (result.sender) {
              setSender(result.sender)
              setDirty(false)

              setMessage(
                'Remetente salvo. Os próximos rascunhos usarão estes dados.'
              )
            }
          } catch {
            setMessage(
              'A conexão falhou. Atualize a página antes de tentar novamente.'
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        <input
          type="hidden"
          name="version"
          value={sender.version}
        />

        <fieldset disabled={busy}>
          <LabelPartyFields
            fields={sender.fields}
          />

          <button
            type="submit"
            disabled={busy}
            className="mt-5 rounded-full bg-[#292621] px-6 py-3 text-xs text-white disabled:opacity-50"
          >
            {busy
              ? 'Salvando…'
              : 'Salvar remetente'}
          </button>
        </fieldset>
      </form>

      <div className="mt-5 rounded-xl border border-[#E5DED3] bg-[#F8F4ED] p-4">
        <h3 className="text-sm font-medium">
          Conferência do remetente salvo
        </h3>

        {dirty && (
          <p
            role="status"
            className="mt-3 text-xs font-medium text-amber-900"
          >
            Existem alterações não salvas. A lista
            abaixo corresponde aos últimos dados
            salvos.
          </p>
        )}

        {savedIssues.length ? (
          <ul className="mt-3 list-disc space-y-2 pl-4 text-xs text-[#756B5D]">
            {savedIssues.map(issue => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-[#52654B]">
            Sem pendências nos campos gerais do
            remetente.
          </p>
        )}

        <p className="mt-3 text-xs leading-relaxed text-[#756B5D]">
          A inscrição estadual ou situação do
          remetente será exigida na preparação
          quando o modo NF-e estiver selecionado.
          Após editar os campos, salve para
          atualizar esta conferência.
        </p>
      </div>

      <p
        role="status"
        className="mt-3 text-sm"
      >
        {message}
      </p>
    </section>
  )
}
