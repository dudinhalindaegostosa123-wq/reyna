# Recuperação de pagamentos aprovados fora do painel

A tela de pagamentos lista tentativas, incluindo Pix ainda pendentes no banco. Não basta haver um identificador do Mercado Pago para criar uma venda: a aplicação consulta o provedor e confere conta, ambiente, checkout, tentativa, moeda e valor antes de registrar a aprovação. Não atualizar `state` para `approved` por SQL para contornar a consulta.

Na Administração → Pagamentos, **Atualizar pagamentos recentes** consulta até 20 tentativas não concluídas de produção, dos últimos 3 dias, dentro do orçamento de duração. Repetir se ainda houver pendências. **Consultar situação** permanece disponível por tentativa, inclusive para tentativas antigas. Nenhum dos botões gera outra cobrança. Resultado em conferência exige ler o código salvo; não significa pedido recuperado.

O Vercel Hobby tem somente a recuperação diária em `vercel.json`. Para recuperação recorrente, aplicar `05-agendamento-pagamentos.sql`: reutiliza `serenity_cron_secret` no Vault (igual ao `CRON_SECRET` de Production da Vercel), pg_cron e pg_net já usados por e-mails/logística. Cria um job fixo a cada 5 minutos; repetir atualiza o mesmo job. O job consulta o endpoint protegido, que processa até 20 tentativas por execução, com limite de tempo. Não garante atualização instantânea de toda a fila.

Se o segredo estiver ausente ou diferente, o agendamento não funciona. O script recusa segredo ausente/curto; para divergência de valor, verificar o retorno HTTP do pg_net. Não publicar segredos, respostas com dados de compradores ou tokens.

`diagnostico-pagamentos-pendentes.sql` é somente leitura e lista pagamentos de hoje no horário de Brasília, situação salva, erro, última reconciliação e vínculo com pedido, sem dados pessoais.

A falta de notificações desses Pix ainda precisa ser confirmada com os logs reais. Rejeição da assinatura passa a registrar somente `PAYMENT_WEBHOOK_SIGNATURE_INVALID`, sem corpo, assinatura ou segredo; conferir se o segredo corresponde à mesma aplicação do Mercado Pago que recebe os pagamentos. A sincronização recorrente é contingência e não comprova que o webhook foi corrigido.

Validação local: testes de autenticação de administração, lote sem cobrança, tratamento de erro, agendamento idempotente com Vault simulado, assinatura e processamento de notificações, proteção do cron e revisão pendente. Sem acesso à conta Mercado Pago ou ao Supabase de produção, a recuperação real só pode ser confirmada após executar as consultas no painel.
