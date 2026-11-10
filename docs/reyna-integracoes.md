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
