'use client'

import type { LabelScope } from '@/lib/label-scope'
import { useEffect, useRef, useState } from 'react'
import LabelPurchase from '@/components/admin/LabelPurchase'
import { labelJobAction } from '@/app/admin/frete/cart-actions'
import type { LabelJobView } from '@/lib/label-cart'
import { saleMoney } from '@/lib/admin-sales'

export default function LabelOperations({
  initial,
  scope = 'current',
  onPrepared,
}: {
  initial: LabelJobView
  scope?: LabelScope
  onPrepared?: () => void
}) {
  const [view, setView] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [remoteId, setRemoteId] = useState('')
  const [dirty, setDirty] = useState(false)
  const [selectedChoice, setSelectedChoice] = useState('')

  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    setView(initial)
  }, [initial])

  const locked = [
    'creating',
    'prepared',
    'uncertain',
  ].includes(view.state)

  const option =
    view.choices.length === 1
      ? view.choices[0]
      : view.choices.find(choice => choice.id === selectedChoice)

  async function run(
    command: 'quote' | 'prepare' | 'recover'
  ) {
    if (busy || !formRef.current) return

    const data = new FormData(formRef.current)

    data.set('operation', view.operation)
    data.set('selected', option?.id || '')
    data.set('remote_id', remoteId)

    setBusy(true)
    setMessage('')

    try {
      const result = await labelJobAction(
        view.orderId,
        command,
        data,
        scope
      )

      if (result.view) {
        setView(result.view)
        if (!result.error && result.view.state === 'prepared') onPrepared?.()
      }

      if (result.remoteHint) {
        setRemoteId(result.remoteHint)
      }

      setMessage(
        result.error ||
          (
            command === 'quote'
              ? scope === 'legacy' ? 'Cotação atualizada. Escolha o serviço para este envio.' : 'Custo atualizado para o serviço escolhido no checkout.'
              : result.message || ''
          )
      )

      if (!result.error && command === 'quote') {
        setDirty(false)
        setSelectedChoice('')
      }
    } catch {
      setMessage(
        'A conexão falhou. Atualize a página para conferir o estado do envio antes de continuar.'
      )
    } finally {
      setBusy(false)
    }
  }

  const preparationStates: Record<
    string,
    {
      title: string
      next: string
    }
  > = {
    empty: {
      title: 'Custo ainda não consultado',
      next:
        'Usamos os dados salvos. Consulte o frete para preparar a etiqueta.',
    },
    quoted: {
      title: 'Custo consultado',
      next:
        'Dados e frete carregados. Prepare a etiqueta para seguir à compra.',
    },
    creating: {
      title: 'Preparação em andamento',
      next:
        'Confira o carrinho do Melhor Envio antes de qualquer nova tentativa.',
    },
    uncertain: {
      title:
        'Resultado da preparação não confirmado',
      next:
        'Confira o carrinho e recupere o envio pelo ID, se ele já existir.',
    },
    prepared: {
      title:
        'Envio vinculado ao carrinho do Melhor Envio',
      next:
        'Consulte a seção de compra e emissão abaixo para conferir pagamento e geração.',
    },
    rejected: {
      title: 'Última tentativa: preparação recusada',
      next:
        'Confira o motivo abaixo, corrija os dados indicados e consulte as opções de frete novamente.',
    },
  }

  const preparationState =
    preparationStates[view.state]
  const lastFailure = view.state === 'rejected' ? view.lastError || message : ''

  return (
    <section className="rounded-2xl bg-[#F8F5EF] p-4 sm:p-5">
      <h2 className="text-sm font-medium">
        Preparar etiqueta
      </h2>

      <p className="mt-2 text-xs leading-relaxed text-[#756B5D]">
        {scope === 'legacy' ? 'Consulte as opções de frete e escolha a transportadora para este pedido antigo.' : 'Usa o mesmo serviço escolhido no checkout e os dados salvos do envio.'}
      </p>

      <div
        role="status"
        className="mt-4 rounded-xl border border-[#E5DED3] bg-white p-4"
      >
        <p className="text-xs font-medium">
          {preparationState?.title ||
            'Situação precisa de conferência'}
        </p>

        <p className="mt-2 text-xs leading-relaxed text-[#756B5D]">
          {preparationState?.next ||
            'Atualize a página e confira o envio antes de continuar.'}
        </p>

        {view.state === 'rejected' && <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-6 text-amber-950">{lastFailure || 'O motivo detalhado desta tentativa antiga não foi salvo. Clique em consultar o frete novamente e depois prepare o envio para obter o diagnóstico atualizado.'}</p>}
        {!locked && (
          <p className="mt-2 text-xs text-[#756B5D]">
            Preparar cria o envio no carrinho do Melhor
            Envio. A compra é uma etapa separada.
          </p>
        )}
      </div>

      {view.state === 'prepared' && (
        <div className="mt-4 rounded-xl bg-white p-4">
          <p className="text-sm font-medium">
            Envio preparado no carrinho
          </p>

          <p className="mt-2 break-all text-xs">
            ID: {view.remoteId}
          </p>

          <p className="mt-2 text-xs">
            Custo retornado:{' '}
            {view.remotePrice === null
              ? 'A confirmar no Melhor Envio'
              : saleMoney(view.remotePrice)}
          </p>

          <p className="mt-2 text-xs leading-relaxed text-[#756B5D]">
            Consulte abaixo a compra e a emissão da
            etiqueta.
          </p>

          <a
            href="https://melhorenvio.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-xs underline"
          >
            Abrir Melhor Envio ↗
          </a>
        </div>
      )}

      <form
        ref={formRef}
        key={view.operation || 'empty'}
        className="mt-4"
        onSubmit={event => {
          event.preventDefault()
          void run('quote')
        }}
      >
        {!locked && (
          <>
            <details className="mb-4 rounded-xl border border-[#E5DED3] bg-white p-3">
              <summary className="cursor-pointer text-xs text-[#756B5D]">
                Dados adicionais da transportadora,
                se exigidos
              </summary>

              <fieldset
                disabled={busy}
                className="mt-4 grid gap-4 sm:grid-cols-2"
              >
                <label className="text-xs">
                  ID da agência de postagem

                  <input
                    name="agency"
                    defaultValue={view.agency}
                    maxLength={9}
                    inputMode="numeric"
                    onChange={() => setDirty(true)}
                    className="mt-2 min-h-[44px] w-full rounded-xl border border-[#DDD4C7] px-3 text-sm"
                  />
                </label>

                <label className="text-xs">
                  CNAE do remetente

                  <input
                    name="cnae"
                    defaultValue={view.cnae}
                    maxLength={12}
                    inputMode="numeric"
                    onChange={() => setDirty(true)}
                    className="mt-2 min-h-[44px] w-full rounded-xl border border-[#DDD4C7] px-3 text-sm"
                  />
                </label>
              </fieldset>
            </details>

            <button
              type="submit"
              disabled={busy}
              className="rounded-full border border-[#BDA98B] bg-white px-5 py-3 text-xs disabled:opacity-50"
            >
              {busy
                ? 'Aguarde…'
                : scope === 'legacy' ? 'Consultar opções de frete' : 'Atualizar custo do frete escolhido'}
            </button>

            {view.choices.length > 1 && !view.stale && <label className="mt-4 block text-xs">Escolha a transportadora e o serviço<select className="mt-2 min-h-[44px] w-full rounded-xl border bg-white px-3" value={selectedChoice} onChange={event => setSelectedChoice(event.target.value)} disabled={busy}><option value="">Selecione uma opção</option>{view.choices.map(choice => <option key={choice.id} value={choice.id}>{choice.company} · {choice.service} · {saleMoney(choice.cents / 100)}</option>)}</select></label>}
            {option && !view.stale && (
              <div className="mt-4 rounded-xl bg-white p-4">
                <p className="text-sm font-medium">
                  {option.company} · {option.service}
                </p>

                <dl className="mt-4 space-y-2 text-xs">
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt>Frete cobrado do cliente</dt>
                    <dd>{saleMoney(view.charged)}</dd>
                  </div>

                  <div className="flex flex-wrap justify-between gap-2">
                    <dt>Custo atualizado</dt>
                    <dd>
                      {saleMoney(option.cents / 100)}
                    </dd>
                  </div>

                  <div className="flex flex-wrap justify-between gap-2 border-t border-[#EEE9E1] pt-2">
                    <dt>Diferença</dt>
                    <dd>
                      {saleMoney(
                        view.charged -
                          option.cents / 100
                      )}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 text-[11px] leading-relaxed text-[#756B5D]">
                  O valor cobrado no pedido permanece o
                  mesmo. Cotação válida por 15 minutos.
                </p>
              </div>
            )}

            {(
              view.stale ||
              dirty
            ) && (
              <p className="mt-4 text-xs leading-relaxed text-[#8A6532]">
                Atualize o custo para usar os dados
                atuais e o serviço escolhido no
                checkout.
              </p>
            )}

            {option && (
              <button
                type="button"
                disabled={
                  busy ||
                  view.stale ||
                  dirty ||
                  view.issues.length > 0 ||
                  view.state !== 'quoted'
                }
                onClick={() => void run('prepare')}
                className="mt-4 rounded-full bg-[#292621] px-6 py-3 text-xs text-white disabled:opacity-40"
              >
                Preparar etiqueta — sem pagar
              </button>
            )}
          </>
        )}
      </form>

      {!locked && view.issues.length > 0 && (
        <details
          open
          className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4"
        >
          <summary className="cursor-pointer text-xs font-medium">
            Pendências para preparar o envio (
            {view.issues.length})
          </summary>

          <ul className="mt-3 list-disc space-y-2 pl-4 text-xs leading-relaxed text-[#756B5D]">
            {view.issues.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-[#756B5D]">
            A documentação pode ficar pendente durante
            a consulta de custo.
          </p>
        </details>
      )}

      {['creating', 'uncertain'].includes(
        view.state
      ) && (
        <div className="mt-4 rounded-xl border border-[#D5B98E] bg-white p-4">
          <p className="text-xs leading-relaxed">
            A preparação ainda não foi confirmada.
            Confira o carrinho no Melhor Envio. Se o
            envio estiver lá, informe seu ID para
            recuperar o vínculo sem criar outro.
          </p>

          <label className="mt-4 block text-xs">
            ID do envio existente

            <input
              value={remoteId}
              onChange={event =>
                setRemoteId(event.target.value)
              }
              maxLength={36}
              className="mt-2 min-h-[44px] w-full rounded-xl border border-[#DDD4C7] px-3 text-sm"
            />
          </label>

          <button
            type="button"
            disabled={busy || !remoteId}
            onClick={() => void run('recover')}
            className="mt-3 rounded-full border border-[#BDA98B] px-5 py-3 text-xs disabled:opacity-50"
          >
            Recuperar envio existente
          </button>

          <a
            href="https://melhorenvio.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block text-xs underline"
          >
            Abrir Melhor Envio ↗
          </a>
        </div>
      )}

      <p
        role="status"
        className="mt-4 text-xs leading-relaxed"
      >
        {message !== lastFailure ? message : ''}
      </p>

      {view.state === 'prepared' && (
        <LabelPurchase orderId={view.orderId} scope={scope} />
      )}
    </section>
  )
}
