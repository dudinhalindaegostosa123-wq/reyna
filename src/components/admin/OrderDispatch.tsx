'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Truck } from 'lucide-react'

import { saleDate } from '@/lib/admin-sales'
import { confirmOrderDispatch } from '@/app/admin/pedidos/dispatch-actions'

interface Props {
  orderId: string
  remoteId: string
  eligible: boolean
  dispatchedAt?: string | null
}

export default function OrderDispatch({
  orderId,
  remoteId,
  eligible,
  dispatchedAt,
}: Props) {
  const router = useRouter()
  const savingRef = useRef(false)

  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const recordedAt = savedAt || dispatchedAt

  if (recordedAt) {
    return (
      <section className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2
            size={20}
            className="mt-0.5 shrink-0 text-green-700"
            aria-hidden="true"
          />

          <div>
            <h3 className="text-sm font-medium text-green-900">
              Postagem confirmada pela equipe
            </h3>

            <p className="mt-2 text-xs leading-relaxed text-green-800">
              Confirmação registrada em {saleDate(recordedAt)}.
            </p>

            <p className="mt-2 text-xs leading-relaxed text-green-800">
              Este registro confirma a postagem informada
              pela equipe, não a entrega ao destinatário.
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (!eligible) {
    return (
      <section className="mt-5 border-t border-[#E5DED3] pt-5">
        <h3 className="text-sm font-medium">
          Confirmação de postagem
        </h3>

        <p className="mt-2 text-xs leading-relaxed text-[#81796C]">
          Para confirmar a postagem, o pedido precisa estar
          pago e a etiqueta vinculada precisa estar gerada,
          sem cancelamento ou expiração registrados.
        </p>
      </section>
    )
  }

  async function handleConfirm() {
    if (
      !confirmed ||
      !eligible ||
      !remoteId ||
      savingRef.current
    ) {
      return
    }

    savingRef.current = true
    setBusy(true)
    setMessage('')

    try {
      const result = await confirmOrderDispatch(
        orderId,
        remoteId
      )

      if (result.error || !result.dispatchedAt) {
        setMessage(
          result.error ||
          'Não foi possível confirmar a postagem. Atualize a página.'
        )
        return
      }

      setSavedAt(result.dispatchedAt)
      router.refresh()
    } catch {
      setMessage(
        'Não foi possível verificar o resultado. Atualize a página antes de tentar novamente.'
      )
    } finally {
      savingRef.current = false
      setBusy(false)
    }
  }

  return (
    <section className="mt-5 border-t border-[#E5DED3] pt-5">
      <div className="flex items-center gap-2">
        <Truck size={18} aria-hidden="true" />

        <h3 className="text-sm font-medium">
          Confirmar postagem
        </h3>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-[#81796C]">
        Use esta opção somente depois de entregar o pacote
        à transportadora ou à agência de postagem.
        Comprar ou imprimir a etiqueta não confirma o envio.
      </p>

      <label className="mt-4 flex cursor-pointer items-start gap-3 text-xs leading-relaxed">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={event => {
            setConfirmed(event.target.checked)
            setMessage('')
          }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#292621]"
        />

        <span>
          Confirmo que este pacote já foi postado.
        </span>
      </label>

      <button
        type="button"
        disabled={!confirmed || busy || !remoteId}
        onClick={handleConfirm}
        className="mt-4 min-h-[44px] rounded-full bg-[#292621] px-5 py-3 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy
          ? 'Confirmando…'
          : 'Confirmar envio e concluir pedido'}
      </button>

      <p className="mt-3 text-[11px] leading-relaxed text-[#81796C]">
        A confirmação registra o administrador responsável
        e o horário. Não altera o pagamento nem movimenta
        novamente o estoque.
      </p>

      {message && (
        <p
          role="alert"
          className="mt-3 text-xs leading-relaxed text-red-700"
        >
          {message}
        </p>
      )}
    </section>
  )
}
