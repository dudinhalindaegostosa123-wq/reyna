export type LabelQueueFilter = 'all' | 'prepare' | 'ready'

export function labelQueueFilter(value: string): LabelQueueFilter {
  return value === 'prepare' || value === 'ready' ? value : 'all'
}

export function labelCanSelect(row: { job_state: string; shipping_pending?: boolean; label_stage: string }) {
  return row.label_stage === 'to_buy' && ['empty','quoted','rejected','prepared'].includes(row.job_state) && !row.shipping_pending
}

export function labelNextStep(row: { job_state: string; shipping_pending?: boolean; label_stage: string }) {
  if (row.label_stage === 'unverified') return { title: 'Conferir etiqueta antiga', hint: 'O histórico importado não informa se já existe uma etiqueta. Confira no site antigo ou no Melhor Envio antes de comprar.' }
  if (row.label_stage === 'review') return { title: 'Conferir este envio', hint: 'Confira a situação antes de tentar uma nova compra.' }
  if (row.label_stage === 'shipped') return { title: 'Ver etiqueta e rastreio', hint: 'O envio já foi registrado. Acompanhe a entrega.' }
  if (row.label_stage === 'purchased') return { title: 'Gerar ou imprimir etiqueta', hint: 'A etiqueta já foi comprada. Continue para imprimir e postar.' }
  if (row.shipping_pending) return { title: 'Confirmar o frete no pedido', hint: 'Falta definir a transportadora e o serviço deste pedido.' }
  if (row.job_state === 'prepared' && labelCanSelect(row)) return { title: 'Comprar etiqueta', hint: 'Envio preparado. Selecione para comprar em grupo ou compre aqui.' }
  return { title: 'Preparar etiqueta', hint: 'Selecione o pedido para preparar automaticamente com os dados salvos.' }
}

export function labelListErrorReference(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  return 'ETIQUETAS-' + (/^[A-Z0-9_]{1,30}$/.test(code) ? code : 'CONSULTA')
}
