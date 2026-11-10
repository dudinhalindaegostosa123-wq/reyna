# Integrações da Reyna

Configuração escolhida para esta loja:

- Pagamentos: Asaas, Pix e cartão de crédito.
- Entrega: Melhor Envio.
- CEP de origem informado: **18053-350**.
- A responsável já possui conta Asaas; ainda precisa criar a conta Melhor Envio.

## Estado atual

O código copiado implementa Mercado Pago. Cadastrar credenciais Asaas não troca
esse provedor: abertura da cobrança, formulário de cartão, consulta de status,
webhook, reconciliação e validações no banco precisam ser adaptados juntos.
A confirmação deve consultar o Asaas e conferir referência, valor e ambiente;
um retorno do navegador nunca deve, sozinho, marcar um pedido como pago.

A instalação `01-instalar-vitrine.sql` foi limitada ao catálogo. Não contém a
instalação completa das sessões de checkout, pedidos, reservas, cupons ou frete.
Os SQLs em `database/payments` são atualizações de uma instalação anterior e não
devem ser executados isoladamente em um banco novo para tentar habilitar Asaas.

As chaves da conta original não vieram no ZIP. Nenhum pagamento Asaas, cotação
real ou emissão de etiqueta desta loja foi validado nesta etapa.

## Preparação nas contas

### Asaas

Usar uma aplicação/conta da própria loja. Separar credenciais de sandbox e de
produção. Credenciais só devem ser inseridas em campos seguros das configurações,
nunca em chat, código, CSV, SQL ou Git.

A configuração do webhook depende da rota Asaas que ainda será implementada.
Não usar a rota `/api/webhooks/mercado-pago` para notificações Asaas.

### Melhor Envio

Criar a conta da própria loja e configurar o remetente com o CEP **18053-350**.
Ainda é necessário informar e conferir endereço completo, dados do remetente,
e-mail de contato, peso e medidas reais da embalagem. O CEP sozinho não permite
comprar etiquetas nem definir as dimensões do pacote.

O código existente usa `MELHOR_ENVIO_TOKEN` na Vercel. Ele faz chamadas à API de
produção do Melhor Envio. O token precisa ter os acessos correspondentes às
operações desejadas de cotação e etiquetas; não misturar um token de sandbox com
a API de produção.

As variáveis da Vercel são separadas dos Secrets do GitHub usados para importar
produtos e imagens.

## Condições para liberar

1. Completar a instalação do checkout/frete no banco novo, sem copiar clientes
   ou pedidos da loja original.
2. Implementar Asaas com proteção contra cobranças duplicadas, confirmação
   autenticada, conferência de valor e vínculo com a sessão do checkout.
3. Validar Pix e cartão em sandbox, incluindo recusa, retorno repetido de webhook
   e resposta incerta do provedor. Não gerar cobranças reais durante essa etapa.
4. Configurar e conferir o remetente e a embalagem no Melhor Envio. Validar uma
   cotação sem comprar etiqueta.
5. Configurar credenciais e webhook de produção da própria loja e validar o fluxo
   completo antes de anunciar que a loja está pronta para receber pagamentos.

## Validação da conta Asaas sem cobrar

A base da API está em `src/lib/asaas-server.ts`. Ela fornece criação e consulta de
clientes/cobranças, Pix, links de fatura para cartão e conferência da referência,
cliente, ambiente, método e valor. Ela ainda **não está conectada ao checkout**.
O chamador precisará adquirir a trava de tentativa no banco antes de chamar a
criação. Uma resposta incerta deve ser reconciliada pela referência, nunca
reenviada automaticamente. O cliente não coleta números de cartão nem CVV.

A base usa as APIs e modelos publicados no SDK oficial:
https://github.com/asaasdev/asaas-api-sdk-java

Para testar acesso à conta antes da adaptação do checkout:

1. Criar a chave na conta de **sandbox** do Asaas.
2. No repositório `reyna`, cadastrar o Repository secret `ASAAS_API_KEY` com a
   chave de sandbox. Não colar o valor em mensagens.
3. Executar **Actions → Validar conexao Asaas → Run workflow → sandbox**.

Esse workflow faz somente `GET /v3/myAccount/accountNumber`. O resultado não
exibe o número da conta e não cria cliente, cobrança ou webhook. Ele não valida
habilitação de Pix/cartão nem substitui um teste completo de checkout.

As variáveis previstas para o cliente de API na Vercel são `ASAAS_ENVIRONMENT`
(`sandbox` ou `production`), `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` (pelo menos
32 caracteres) e `ASAAS_PAYMENTS_ENABLED`. O token do webhook é separado da
chave de API. Ainda não há rota de webhook Asaas instalada. Não cadastrar uma
URL de webhook até a integração com o banco e o checkout estar concluída.
A ativação em produção exige deployment de Production e o webhook configurado;
uma chave de sandbox não é enviada à API de produção, nem vice-versa.

O tamanho da embalagem ainda não foi informado: “caixa pequena de joias” não é
uma medida verificável. Não foram salvos peso ou dimensões fictícios.
