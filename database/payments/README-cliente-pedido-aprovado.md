# Pedido aprovado com perfil incompleto

A validação de entrada exige uma conta Auth confirmada, mas a conclusão original exigia também um `customer_id` em `serenity_customer_accounts`. Contas migradas ou cadastros incompletos podem cumprir o primeiro requisito e falhar no segundo depois de pagar (`CUSTOMER_ACCOUNT_UNAVAILABLE`). O caso informado chegou com reserva vencida, cuja recuperação expôs essa segunda falha. Não foi possível provar a causa inicial apenas pelo código genérico salvo.

## Ativação

Executar `04-cliente-pedido-aprovado.sql` inteiro no Supabase SQL Editor, após `database/commerce/04-venda-sob-encomenda.sql` no cenário atual. Essa migração também funciona sem o modo de encomenda (corrige só o vínculo; não remove as reservas nesse caso). É repetível e não cria pedidos ou cobranças sozinha. Se a conclusão principal instalada mudar, aborta transacionalmente. A melhoria opcional de diagnóstico é ignorada quando a definição não corresponde ao formato esperado; isso não bloqueia a correção do cadastro.

Quando falta o cliente, a função verifica o checkout de produção e uma aprovação persistida de mesmo valor, sem estorno. Cria o cliente usando o ID e o snapshot originais do checkout. Se já existe uma linha de conta com vínculo vazio, completa somente esse campo. Se a linha de conta não existe, registra a venda sem inventar CPF, perfil de atacado ou permissões; o pedido mantém `account_user_id` do checkout. Não busca por e-mail, não reatribui pedidos, não altera vínculos existentes. Erros posteriores desfazem inclusive o novo cadastro. A função só pode ser chamada pelo servidor; usuários anônimos/autenticados não têm permissão de execução.

O motivo simbólico de falha passa a ser preservado em `last_error_code` (exemplo `PAYMENT_ORDER_CUSTOMER_ACCOUNT_UNAVAILABLE`); mensagens livres potencialmente pessoais continuam reduzidas ao SQLSTATE. Não altera confirmação de pagamento, valor ou controle de duplicação.

Depois da ativação, Consultar situação consulta novamente o Mercado Pago e conclui pelo mesmo caminho idempotente. Também é possível reaplicar o SQL pontual de conclusão já fornecido para a tentativa existente. Nenhum dos dois cria uma cobrança.

O cron de pagamentos passa a priorizar tentativas aprovadas e a reportar revisões como falhas, em vez de contá-las como sucesso. O agendamento Vercel existente continua diário; não se promete reconciliação de cinco em cinco minutos sem um agendamento adicional. Webhooks e consultas da página de pagamento continuam sendo os gatilhos imediatos. O cron é contingência, não garantia de registro instantâneo de todos os pagamentos.

## Verificação

Testes de integração com as funções comerciais existentes: estoque sem limite, reserva vencida/liberada, Pix, cupom e esterilização; conta ausente e vínculo nulo; preservação de proprietário e total; execução repetida sem duplicação de cliente/pedido; chamada não autorizada e pagamento não aprovado rejeitados. Testes do cron verificam prioridade e tratamento de revisão pendente. TypeScript e lint também passaram. É necessário executar o SQL em produção e confirmar o número do pedido recuperado; o deploy sozinho não aplica a migração.
