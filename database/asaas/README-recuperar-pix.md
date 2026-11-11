# Recuperar Pix recusado antes de criar cobrança

Para uma recusa `ASAAS_HTTP_400` causada pela falta de chave Pix, primeiro cadastre e ative a chave na conta Asaas de produção.

1. Execute `05-liberar-pix-recusado.sql` no SQL Editor do Supabase da loja. O resultado deve mostrar `recuperacao_pix_instalada = true`.
2. Com a versão atual publicada na Vercel, abra `/admin/pagamentos`. Na tentativa recusada, clique em **Conferir recusa e liberar nova tentativa**.
3. O servidor consulta a conta e a referência exata no Asaas. Só libera uma tentativa Pix com cliente já vinculado, HTTP 400 e nenhuma cobrança encontrada. Essa ação não gera cobrança.
4. Se a reserva ainda estiver válida, o cliente pode atualizar a situação na página de pagamento e escolher Pix para gerar o QR Code. Se estiver expirada, deve iniciar outro checkout.

O histórico permanece registrado. A ação não libera cartão, timeout, erro 500, cobrança já identificada ou resposta inconclusiva do provedor. Não apague tentativas nem altere seus estados manualmente. A migração pode ser reaplicada.
