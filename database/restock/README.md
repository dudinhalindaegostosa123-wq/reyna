# Avise-me e relatório de mais vendidos

## Instalação

1. No SQL Editor do Supabase, execute `database/releases/2026-11-08-estoque-mais-vendidos.sql`. Instala as tabelas e funções de reposição e o relatório interno em uma transação, preservando produtos e pedidos. Pode repetir. Os arquivos-fonte são `database/restock/01-avisos-estoque.sql` e `database/reports/01-mais-vendidos.sql`; não é necessário executar os três arquivos.
2. Publique o código e aguarde o deploy Ready.
3. Em `/admin/emails`, confira SMTP e envie o teste existente para a própria loja. A reposição reutiliza `SMTP_USER`, `SMTP_PASSWORD`, `SERENITY_EMAIL_ENABLED=true` e `CRON_SECRET` já usados nos e-mails de pedidos. O remetente suportado é `contato@serenitypiercings.com.br`. Não coloque valores de segredos em SQL, GitHub ou chat.
4. Se o agendamento de e-mails a cada cinco minutos já está instalado, ele também processará reposições. Caso contrário, cadastre no Vault o segredo `serenity_cron_secret` com o mesmo `CRON_SECRET` da Vercel e execute `database/restock/02-agendar-avisos.sql`. Ele reutiliza o nome do job existente, sem duplicá-lo. O botão de processamento manual fica em `/admin/emails`.

A instalação não envia e-mails retroativos. Não houve validação com o SMTP ou banco de produção durante o desenvolvimento: os testes usam banco local e transporte simulado.

## Comportamento

Cards indisponíveis preservam o link da peça, mostram “Indisponível” e “Avise-me”, sem preços ou selo promocional. Na página da peça, a cliente informa o e-mail e autoriza um único aviso. Nas peças com variações esgotadas, a inscrição identifica a variação; ter outra cor em estoque não dispara o aviso errado. Produtos disponíveis não aceitam inscrição de reposição.

A fila consulta publicação, visibilidade, status, saldo físico e reservas ativas, e confere novamente antes do envio. Não reserva a peça; o e-mail informa que a disponibilidade e o preço podem mudar. Estoque não controlado (`NULL`) com status disponível conta como disponível.

Inscrições iguais são deduplicadas e expiram em 90 dias. O e-mail possui link de cancelamento. Um novo pedido explícito de aviso depois de outra falta de estoque cria um novo ciclo de notificação. Os dados e as funções são privados, restritos a `service_role`; a lista do admin não expõe os e-mails das clientes. Não há inscrição em publicidade.

O processamento usa uma lease por envio. Falhas confirmadas antes da aceitação pelo SMTP podem repetir com intervalo e até cinco tentativas; desconexão ambígua ou perda da confirmação depois de um envio exige conferência. A fila não reenvia automaticamente uma mensagem de entrega incerta. Inscrições são limitadas por requisição/origem para reduzir abuso; esse controle não limita participantes de campanhas.

## Mais vendidos

`/admin/mais-vendidos` exige administrador e mostra quantidades e pedidos por produto, somando suas variações, com períodos de 7, 30, 90, 365 dias ou todo o período. Inclui pedidos pagos do site e vendas manuais deste sistema. Exclui pedidos pendentes, cancelados, reembolsados e associados a pagamentos de teste. Pedidos com reembolso parcial ficam inteiramente fora, pois não há uma alocação de devoluções por peça. O histórico do site antigo não é somado automaticamente.

Na página inicial, Recém-chegados ocupa o lugar do bloco grande do progressivo e usa a ordenação das novidades. No carrinho, o aviso ganhou destaque e celebra os 15% nas joias elegíveis; ouro 18K e Bioflex continuam excluídos.
