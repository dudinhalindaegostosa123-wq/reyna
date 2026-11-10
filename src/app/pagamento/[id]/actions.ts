'use server'

// O fluxo V1 foi aposentado. Somente a sessão V2 pode iniciar um pagamento.
export async function startTestPix(orderId: string, attemptId: string) {
  void orderId
  void attemptId
  return {
    ok: false,
    message: 'Este fluxo de pagamento foi substituído. Consulte a equipe Lunarity antes de iniciar outra tentativa.',
  }
}
