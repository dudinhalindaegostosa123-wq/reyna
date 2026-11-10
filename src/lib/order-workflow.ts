export type OrderWorkflowStage =
  | 'awaiting_payment'
  | 'paid'
  | 'processing'
  | 'awaiting_dispatch'
  | 'completed'
  | 'cancelled'
  | 'refunded'

export const ORDER_WORKFLOW_LABELS: Record<
  OrderWorkflowStage,
  string
> = {
  awaiting_payment: 'Aguardando pagamento',
  paid: 'Aguardando preparação',
  processing: 'Em andamento',
  awaiting_dispatch: 'Pendente de envio',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  refunded: 'Estornado integralmente',
}

export interface OrderWorkflowInput {
  paymentStatus: string
  preparationState?: string | null
  purchasePhase?: string | null
  carrierStatus?: string | null
  dispatchedAt?: string | null
}

export interface OrderWorkflowResult {
  stage: OrderWorkflowStage | 'unknown'
  label: string
  description: string
}

function normalize(
  value: string | null | undefined
): string {
  return String(value || '').trim().toLowerCase()
}

export function getOrderWorkflow(
  input: OrderWorkflowInput
): OrderWorkflowResult {
  const payment = normalize(input.paymentStatus)
  const preparation = normalize(input.preparationState)
  const purchase = normalize(input.purchasePhase)
  const carrier = normalize(input.carrierStatus)

  if (payment === 'cancelled') {
    return {
      stage: 'cancelled',
      label: ORDER_WORKFLOW_LABELS.cancelled,
      description: 'O pedido foi cancelado.',
    }
  }

  if (payment === 'refunded') {
    return {
      stage: 'refunded',
      label: ORDER_WORKFLOW_LABELS.refunded,
      description:
        'O pedido possui estorno integral registrado.',
    }
  }

  if (payment === 'pending') {
    return {
      stage: 'awaiting_payment',
      label: ORDER_WORKFLOW_LABELS.awaiting_payment,
      description:
        'Aguardando confirmação do pagamento.',
    }
  }

  if (payment !== 'paid') {
    return {
      stage: 'unknown',
      label: 'Conferir situação',
      description:
        'A situação do pagamento precisa de conferência.',
    }
  }

  const shipmentBlocked = [
    'canceled',
    'cancelled',
    'expired',
  ].includes(carrier)

  if (shipmentBlocked) {
    return {
      stage: 'processing',
      label: ORDER_WORKFLOW_LABELS.processing,
      description:
        'O envio foi cancelado ou expirou. Confira a situação antes de continuar.',
    }
  }

  const manualDispatchConfirmed =
    typeof input.dispatchedAt === 'string' &&
    Number.isFinite(Date.parse(input.dispatchedAt))

  const carrierDispatchConfirmed = [
    'posted',
    'delivered',
  ].includes(carrier)

  if (
    preparation === 'prepared' &&
    (
      manualDispatchConfirmed ||
      carrierDispatchConfirmed
    )
  ) {
    return {
      stage: 'completed',
      label: ORDER_WORKFLOW_LABELS.completed,
      description: manualDispatchConfirmed
        ? 'A equipe confirmou a postagem do pacote. Isso não representa confirmação de entrega ao destinatário.'
        : 'O envio vinculado possui postagem ou entrega confirmada no registro local.',
    }
  }

  const labelPurchased = [
    'paid',
    'generating',
    'ready',
  ].includes(purchase)

  if (
    preparation === 'prepared' &&
    labelPurchased
  ) {
    return {
      stage: 'awaiting_dispatch',
      label: ORDER_WORKFLOW_LABELS.awaiting_dispatch,
      description:
        'Etiqueta paga. Aguardando confirmação da postagem.',
    }
  }

  const preparationStarted = [
    'quoted',
    'creating',
    'prepared',
    'uncertain',
    'rejected',
  ].includes(preparation)

  if (preparationStarted) {
    return {
      stage: 'processing',
      label: ORDER_WORKFLOW_LABELS.processing,
      description:
        'Preparação iniciada. A compra da etiqueta ainda precisa ser confirmada.',
    }
  }

  return {
    stage: 'paid',
    label: ORDER_WORKFLOW_LABELS.paid,
    description:
      'Pagamento confirmado. Aguardando início da preparação do envio.',
  }
}
