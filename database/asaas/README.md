# Asaas no checkout da Reyna

Pix e cartão de crédito à vista ficam dentro do site. Os dados do cartão passam
pelo servidor, em memória, para a API Asaas; não entram no banco, no HMAC da
tentativa, nas respostas ao navegador, no armazenamento do carrinho ou nos logs.
Não habilitar captura de corpos de requisição nas ferramentas de observabilidade.
As páginas de pagamento excluem scripts de Google Ads/Analytics; uma navegação
interna que reteve o script recarrega a mesma URL antes de montar campos de cartão.
O formulário usa os dados do checkout como dados de cobrança do titular e pede
confirmação explícita disso. Parcelamento não está incluído nesta implementação.

## 1. Banco

`01-checkout.sql` é uma atualização de uma instalação existente de checkout V2/V3.
Não executa cobranças nem altera credenciais. Aplicar por último, depois dos SQLs
existentes de checkout, pagamentos, coleção e desconto Pix, se usados pela loja.
É transacional e pode ser reaplicado. Preserva tentativas Mercado Pago existentes.

Execute primeiro `00-diagnostico.sql` no SQL Editor do projeto correto. Se houver
itens ausentes, instalar/restaurar os componentes de checkout/frete/pedidos
correspondentes antes de executar `01-checkout.sql`. Não usar os fixtures de testes
como instalador de produção; eles contêm dados e implementações simuladas.
O instalador de catálogo sozinho não instala o checkout. Não apagar tabelas,
pedidos ou tentativas para fazer a migração passar.

Depois da aplicação, conferir:

```sql
select public.serenity_asaas_ready_v1();
```

Esperado: `{"ready": true, "version": 1}`. Isso verifica instalação local, não
habilitação de crédito/Pix no Asaas nem entrega real do webhook.

## 2. Vercel e Asaas

As credenciais de sandbox e produção são separadas. As variáveis só passam a valer
em novos deployments. Não colocar chaves no Git, SQL, mensagens ou screenshots.

| Variável | Valor |
| --- | --- |
| ASAAS_ENVIRONMENT | sandbox para teste; production para conta real |
| ASAAS_API_KEY | Chave do mesmo ambiente, em campo Sensitive |
| ASAAS_WEBHOOK_TOKEN | Segredo aleatório exclusivo com ao menos 32 caracteres |
| ASAAS_PAYMENTS_ENABLED | false durante preparação; true somente para liberar |

Produção exige deployment Vercel Production. O token do webhook é separado da API
Key e deve ser gerado em um gerenciador de senhas, sem enviar seu valor no chat.
Manter as variáveis de Supabase, frete e CRON_SECRET existentes. Para uma instalação
nova, autenticação, checkout e frete precisam estar funcionando antes do pagamento.

Após instalar o banco e fazer deploy, cadastrar em Integrações → Webhooks no Asaas:

- URL: `https://DOMINIO-ATUAL-DA-LOJA/api/webhooks/asaas`.
- Mesmo token definido em `ASAAS_WEBHOOK_TOKEN` no campo de autenticação do webhook.
  O Asaas deve enviá-lo no cabeçalho `asaas-access-token`.
- Habilitar eventos de pagamento, incluindo confirmação, recebimento, estorno,
  alteração, remoção, análise de risco e contestação, conforme disponíveis na conta.
- Manter webhook ativo. Conferir entregas e reativar a fila no painel se o Asaas
  a suspender por respostas de erro. Nunca usar a rota Mercado Pago.

O endpoint é POST; abrir a URL no navegador não testa entrega. Responde 401 sem
segredo correto e 503 quando a consulta ao provedor ou aplicação no banco falha,
para solicitar reentrega. O status enviado no corpo nunca aprova um pedido:
sempre há consulta autenticada ao Asaas, validando conta, ambiente, cliente,
referência completa de checkout/tentativa, método e valor.

## 3. Validar antes de liberar

1. Usar um deployment de testes com chave sandbox, banco apropriado e o webhook
   correspondente. Não trocar credenciais de produção por sandbox no site ao vivo.
2. Conferir Admin → Pagamentos. Testar Pix e cartão com dados oficiais do sandbox.
3. Conferir confirmação com a página fechada, repetição de webhook, recusa,
   indisponibilidade/timeout e recebimento após a reserva. Não criar outra cobrança
   para "ver se foi". HTTP ambíguo ou recusa sem fatos completos ficam em conferência.
4. Só após validar o fluxo, configurar credenciais/webhook da conta real, definir
   `ASAAS_PAYMENTS_ENABLED=true` e redeployar Production.
5. Fazer uma compra real de baixo valor acompanhada pelo responsável e conferir o
   pagamento na própria conta Asaas, o pedido pago e a baixa única de estoque.

Para pausar novas compras, alterar somente `ASAAS_PAYMENTS_ENABLED=false` e fazer
redeploy. Manter as outras variáveis e webhook para confirmar cobranças existentes.
Admin → Pagamentos e o cron existente consultam o provedor de cada tentativa,
inclusive quando não existe pedido ainda. Não há fallback automático entre contas
ou provedores. A mudança da chave para outra conta bloqueia cobranças antigas por
incompatibilidade da conta; não apagar tentativas para contornar isso.

## Reservas e respostas incertas

A trava transacional é adquirida antes de criar cliente ou cobrança. O cliente
Asaas é vinculado à tentativa antes do POST de pagamento. POSTs nunca são repetidos
automaticamente. Uma resposta incerta é reconciliada apenas por GET, pelo ID ou pela
referência exata; busca vazia não autoriza outra cobrança. Se a própria criação do
cliente falhar de forma incerta, a equipe precisa conferir no Asaas.

O QR Asaas pode continuar válido após o prazo da reserva local. O site esconde o
QR quando a reserva acaba; isso não cancela a cobrança no Asaas. Não liberar nova
cobrança automaticamente. Se houver pagamento tardio, ele fica registrado em
conferência sem criar pedido/baixar estoque. Conferir no painel e decidir o
atendimento/estorno. Reembolsos parciais, contestações, recebimento manual e estados
não reconhecidos também exigem revisão. Estorno integral não repõe estoque sozinho.

## Validação automatizada

```bash
npm run test:payments
node --test tests/asaas.test.cjs tests/asaas-checkout.test.cjs tests/asaas-database.test.mjs
npx tsc --noEmit
npm run lint
npm run build
# Ambiente de desenvolvimento com Playwright e Chromium:
node scripts/test-asaas-browser.cjs
```

Os testes de API usam respostas simuladas; os testes SQL executam funções reais em
Postgres isolado (PGlite), com fixtures nas dependências de catálogo/preço/documento.
O teste Chromium usa o componente real com ações de servidor simuladas. Nenhum deles
cria cobrança ou valida a conta real. A build local está bloqueada pelo acesso a
Google Fonts na rede do ambiente; TypeScript, lint e testes são verificáveis à parte.

Contrato dos campos de cartão conferido no SDK oficial Asaas:
https://github.com/asaasdev/asaas-api-sdk-java
(`PaymentSaveWithCreditCardRequestDto`, `CreditCardRequestDto`,
`CreditCardHolderInfoRequestDto` e `PaymentService`).
