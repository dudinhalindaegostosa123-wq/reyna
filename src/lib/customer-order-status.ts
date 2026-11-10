export interface CustomerShipment {
  status?: string | null
  workflow?: string | null
  carrier?: string | null
  trackingCode?: string | null
}
/** Traduz apenas situações confirmadas. Gerar etiqueta não significa enviar o pedido. */
export function customerOrderStatus(input: CustomerShipment) {
  const status = String(input.status || '').replace(/^wc-/, '').toLowerCase()
  const carrier = String(input.carrier || '').toLowerCase()
  if (['cancelled', 'canceled'].includes(status)) return { title: 'Pedido cancelado', message: 'Fale com a Serenity se precisar de ajuda.', tone: 'neutral', code: '' }
  if (status === 'refunded') return { title: 'Pedido reembolsado', message: 'O reembolso foi registrado.', tone: 'neutral', code: '' }
  if (status === 'failed') return { title: 'Pagamento não concluído', message: 'Fale com a Serenity para conferir sua compra.', tone: 'attention', code: '' }
  if (['pending', 'on-hold'].includes(status)) return { title: 'Aguardando pagamento', message: 'Seu pedido aguarda a confirmação do pagamento.', tone: 'neutral', code: '' }
  const code = typeof input.trackingCode === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(input.trackingCode) ? input.trackingCode : ''
  if (carrier === 'delivered') return { title: 'Pedido entregue', message: 'Sua entrega foi confirmada. Aproveite suas joias!', tone: 'success', code }
  if (['undelivered', 'paused', 'suspended'].includes(carrier)) return { title: carrier === 'undelivered' ? 'Entrega não concluída' : 'Envio em acompanhamento', message: 'Fale com a Serenity para acompanhar os próximos passos.', tone: 'attention', code }
  if (carrier === 'posted' || input.workflow === 'completed' && status === 'paid') return { title: 'Pedido enviado', message: code ? 'Acompanhe sua entrega pelo código de rastreio.' : 'Seu pedido está a caminho. O rastreio aparecerá aqui assim que estiver disponível.', tone: 'success', code }
  // No arquivo antigo, "completed" não comprova uma postagem na transportadora atual.
  if (status === 'completed') return { title: 'Pedido concluído', message: 'Confira os detalhes da sua compra abaixo.', tone: 'neutral', code: '' }
  if (['paid', 'processing'].includes(status)) return { title: 'Pedido recebido e em preparação', message: 'Estamos cuidando das suas joias para o envio.', tone: 'neutral', code: '' }
  return { title: 'Pedido recebido', message: 'Acompanhe as próximas atualizações por aqui.', tone: 'neutral', code: '' }
}
