# Pagamentos da Serenity: Pix e cartão de crédito

A main contém um único checkout ativo. Ele cria uma sessão temporária e só
registra o pedido após aprovação consultada na API do Mercado Pago. O caminho
antigo de criação de pedidos e o iniciador de Pix V1 estão desativados.

## O que está implementado

- Escolha entre Pix e cartão de crédito dentro do site. Ao escolher Pix, o código é solicitado automaticamente.
- Cartão com o SDK oficial @mercadopago/sdk-react, campos seguros, tokenização e até 12 parcelas.
- Autenticação 3D Secure com o componente StatusScreen oficial quando o banco exigir.
- Separação explícita entre teste e produção, incluindo live_mode e conta recebedora.
- Valor calculado no servidor; validação de moeda, método, checkout e tentativa.
- Chave de idempotência por tentativa; falhas incertas não permitem reenvio cego.
- Webhook HMAC SHA-256, consulta autenticada do pagamento e aplicação idempotente.
- Confirmação com o navegador fechado, sem confiar em status enviados pelo cliente.
- Pedido inserido diretamente como pago, com estoque e cupom na mesma transação.
- Consulta pela página de pagamento e por Admin → Pagamentos.
- Reconciliação diária como contingência (não substitui o webhook).
- Pausa de novas cobranças sem impedir receber e consultar pagamentos existentes.

Pix e cartão usam as mesmas credenciais de produção e o mesmo webhook de
Pagamentos (legacy). Não são necessárias novas chaves específicas para cartão.
Selecionar outros meios no portal não os implementa: boleto, carteira e pagamentos
por débito não estão incluídos nesta entrega.

O cliente escolhe o meio antes de iniciar a tentativa. Não é possível gerar cartão
enquanto há um Pix pendente, ou gerar Pix enquanto há cartão em andamento.
Após recusa/cancelamento definitivo, uma nova tentativa só ocorre por ação do
cliente. Resposta incerta continua bloqueada e deve ser conferida, sem reenvio.

Número, CVV e validade são coletados pelo componente seguro do Mercado Pago.
O servidor recebe o token do SDK, nunca campos de cartão bruto. O token não é
armazenado em sessão, no banco ou em logs; persiste-se somente o HMAC da tentativa.
Valor, referência e conta recebedora vêm do checkout salvo, não do formulário.
As condições de parcelamento/juros são exibidas pelo SDK e dependem da conta.

## Aplicação em quatro passos

1. No Supabase SQL Editor, executar **database/payments/03-pix-cartao.sql** inteiro.
   Ele é uma atualização das funções V2 já instaladas; não é uma instalação
   independente. Corrige a leitura restrita da confirmação de conta, a comparação
   numérica do desconto no frete, instala o marcador V3 e as funções de cartão.
   Pode ser reaplicado mesmo se o SQL anterior de Pix já foi executado. Não cria
   pedidos, não move estoque, não cancela tentativas e não chama o Mercado Pago.

2. Na aplicação correta da loja no Mercado Pago Developers, ativar as credenciais
   de produção e configurar Webhooks de **Pagamentos** para:
   `https://serenitypiercings.com.br/api/webhooks/mercado-pago`
   Copiar a assinatura secreta fornecida pelo Mercado Pago. Ela não é um segredo
   criado por nós nem o Access Token. A conta da loja precisa estar habilitada
   para receber Pix. Não é possível garantir essa habilitação apenas pelo código.

3. Na Vercel, em **Production**, configurar:

   | Variável | Valor |
   | --- | --- |
   | MERCADO_PAGO_ENVIRONMENT | production |
   | MERCADO_PAGO_ACCESS_TOKEN | Access Token de produção da aplicação da loja |
   | NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY | Public Key de produção da mesma aplicação |
   | MERCADO_PAGO_WEBHOOK_SECRET | Assinatura secreta dos Webhooks dessa aplicação |
   | SERENITY_SITE_URL | https://serenitypiercings.com.br |
   | MERCADO_PAGO_PAYMENTS_ENABLED | false durante a configuração; true para liberar |

   Supabase e CRON_SECRET devem continuar configurados em Production. O cron
   exige CRON_SECRET com pelo menos 32 caracteres. Nunca publicar credenciais
   no GitHub, nesta documentação ou em mensagens de erro.

4. Depois de executar o SQL e configurar o webhook, definir
   `MERCADO_PAGO_PAYMENTS_ENABLED=true` e fazer Redeploy da main. Abrir
   **Admin → Pagamentos** para conferir se o banco e o cartão estão instalados e a configuração
   está habilitada. Essa tela não certifica a autorização da conta no provedor.
   Fazer a primeira compra real de baixo valor acompanhada pelo responsável da
   loja, uma por meio de pagamento: conferir antes o valor, pagar uma única vez e confirmar o pedido no admin
   e a cobrança no Mercado Pago. Não usar uma tentativa antiga de teste como
   validação de produção. No teste real, fechar a página após gerar o código e
   conferir que o webhook confirma o pagamento sem depender dela. Para cartão,
   conferir também parcelas e desafio bancário quando solicitado. As contas
   varejo/atacado e cupons continuam usando o mesmo cálculo salvo do checkout.

## Pausar e investigar

Para pausar novas cobranças, manter MERCADO_PAGO_ENVIRONMENT=production e as
credenciais e segredo, alterar apenas MERCADO_PAGO_PAYMENTS_ENABLED=false e
fazer Redeploy. Webhooks e consultas continuam disponíveis.

Um 401/403 do provedor continua sendo uma falha de autorização. O código não
transforma uma recusa em aprovação nem faz fallback automático para outra conta.
Logs de criação incluem HTTP, código, causas e x-request-id quando disponível,
sem chave, CPF, e-mail ou corpo completo da resposta.

O webhook usa `data.id` da URL, `x-request-id` e `ts` no manifesto assinado,
conforme o formato de Webhooks do Mercado Pago. O corpo é limitado e o ID deve
corresponder ao da URL. Respostas antigas assinadas podem ser reentregues:
o sistema consulta os fatos atuais na API e usa idempotência no banco.
A URL enviada na criação do pagamento inclui `source_news=webhooks`.
Notificações IPN e chamadas sem assinatura não são aceitas.

Aprovado sem pedido, valor divergente, resposta incerta, aprovação tardia,
reembolso parcial e contestação exigem conferência. Aparecem no admin, não são
tratados como nova compra. Não remover registros para liberar outra cobrança.
Se a conversão de aprovação falhar, o webhook responde 503 para permitir nova
entrega. A API pode ter aprovado e o pedido ainda estar pendente de aplicação:
não pagar novamente. A reconciliação e o admin tentam reaplicar os mesmos fatos,
sem gerar cobrança. Estoque não é reposto automaticamente em reembolso.

Ao mudar para o domínio oficial, atualizar SERENITY_SITE_URL e a URL dos Webhooks
no Mercado Pago, manter o domínio antigo acessível durante a transição e fazer
Redeploy. O domínio precisa estar público por HTTPS, sem proteção de Preview.

## Testes e limites da validação

- npm run test:payments
- npx tsc --noEmit --incremental false
- npm run build

Os testes usam HTTP simulado e Postgres isolado com PGlite. As funções de
estoque, cupom, conversão e seus triggers são exercitadas nos fixtures do catálogo.
Os helpers de preços, regras e documento usam fixtures. Nenhum teste deste pacote
consulta uma conta real, cria cobrança ou compra etiqueta. A autorização real do
provedor e a chegada de Webhooks precisam da compra acompanhada após configuração.

Sem as variáveis do catálogo, o build local compila e verifica os tipos, mas pode
falhar na pré-renderização de /nariz e /orelha. Na Vercel, devem permanecer as
variáveis de catálogo que já eram usadas pelo site.

## Referências do componente de cartão

- https://github.com/mercadopago/sdk-js/blob/main/docs/bricks/card-payment.md
- https://github.com/mercadopago/sdk-js/blob/main/docs/bricks/status-screen.md

A implementação usa CardPayment e StatusScreen do pacote oficial, incluindo
initialization.additionalInfo.externalResourceURL e creq para 3DS. A exibição
de sucesso do SDK não cria pedido: somente a consulta autenticada no servidor
e a transação de aprovação do banco podem registrar a venda. O desafio 3DS é
retido somente para a tentativa pendente e removido na aprovação/encerramento.
