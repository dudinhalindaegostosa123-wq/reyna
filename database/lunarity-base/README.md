# Instalação inicial da Lunarity

O inventário fornecido para esta loja contém `products`, `product_variants`,
`product_media`, as views de catálogo e configurações comerciais/campanhas, mas
não contém clientes, pedidos, frete, sessões de checkout ou pagamentos.

O arquivo de entrada é **[../asaas/03-instalar-base-lunarity.sql](../asaas/03-instalar-base-lunarity.sql)**.
Ele é autocontido e deve ser executado inteiro no SQL Editor do projeto Supabase
que contém o catálogo da Lunarity. Não executar os módulos individualmente.

## Garantias e limites

- Não reimporta catálogo, não troca preços, estoque ou configurações comerciais.
- Não contém dados, usuários, pedidos, endereço, embalagem, contas ou credenciais
  da loja original. O prefixo `serenity_` continua sendo apenas o contrato do código.
- Instala contas de clientes, pedidos, cotação, reservas, cupons, controle de acesso,
  Pix/cartão e confirmação Asaas. Usa o helper de preços que já existe no catálogo.
- Respeita as configurações existentes de anodização, haste e esterilização. As
  faixas progressivas seguem a interface atual (2/3/4/5 peças: 5/7/10/15%), com as
  mesmas exclusões de materiais. Os flags existentes de campanhas não mudam.
- Frete e atacado começam desativados. Não inventa dimensões, peso, tarifa ou CEP.
  A equipe deve configurar a embalagem real e testar o Melhor Envio depois.
- Sem frete automático configurado, a cotação é manual e o checkout fica bloqueado
  para pagamento. O script não libera pagamento de pedido com frete pendente.
- Nenhuma cobrança é criada pelo SQL; `ASAAS_PAYMENTS_ENABLED` não é alterado.
- Clientes precisam entrar em uma conta com e-mail confirmado. Manter
  `SERENITY_GUEST_CHECKOUT_ENABLED=false` nesta instalação inicial. A modalidade
  visitante exige a instalação separada de seus recursos e do acompanhamento.
- A instalação completa de etiquetas, rastreamento, e-mails, histórico legado e
  analytics não está incluída. Pedidos pagos continuam visíveis sem etiquetas.
- Executa em uma única transação. Um erro desfaz a instalação inteira. Recusa
  executar sobre tabelas de checkout/contas/pedidos já existentes e sobre funções
  antigas desses módulos; não tenta adivinhar nem sobrescrever instalações parciais.
- Ao reaplicar a mesma versão concluída, preserva funções, dados e configurações;
  atualizações futuras precisam de migrações próprias, não de reset desta base.

A saída da primeira execução deve mostrar `pagamentos={"ready":true,"version":1}`,
`frete_automatico=false` e `pedidos_existentes=0`. Isso confirma a estrutura do
banco, não a autorização da conta Asaas, as credenciais na Vercel, a entrega do
webhook ou o funcionamento do frete real.

## Etapas seguintes

1. Confirmar o resultado da instalação, sem habilitar cobranças.
2. Conferir as variáveis de Supabase da própria Lunarity na Vercel, em Production.
   A chave administrativa fica em `SUPABASE_SECRET_KEY`, nunca no chat ou Git.
3. No Supabase Authentication, conferir Site URL e Redirect URLs para a loja:
   `https://reyna-three.vercel.app` e o callback de cadastro/login usado pelo site.
   Manter as credenciais e os usuários de outra loja separados.
4. Configurar peso e dimensões reais em Admin → Frete e validar uma cotação do
   Melhor Envio. Sem uma tarifa confirmada não liberar pagamentos.
5. Seguir [o guia Asaas](../asaas/README.md): token, webhook de
   `https://reyna-three.vercel.app/api/webhooks/asaas`, sandbox e validação antes da
   liberação em produção. Não usar a rota de webhook Mercado Pago.

## Fontes e geração

As rotinas de reserva, cupom e conversão foram promovidas dos snapshots SQL completos
presentes no repositório e revisadas como módulos de produção. Não são usadas as
implementações simuladas dos helpers dos testes. Autenticação, CPF/CNPJ, limites,
perfil, permissões, regras de cotação e configurações de frete são implementados
nos módulos deste diretório. O preço efetivo existente não é substituído.

As migrações de pagamentos, progressivo, desconto Pix e Asaas já existentes são
incluídas na ordem compatível pelo gerador, sem suas transações individuais.

```bash
python3 scripts/build-lunarity-installer.py
node --test tests/lunarity-installer.test.mjs tests/lunarity-admin-start.test.cjs
npm run test:payments
```

O teste inicia somente com um catálogo que reproduz o inventário e verifica a
instalação inteira em Postgres isolado (PGlite). Exercita CPF/CNPJ, registro de
cliente, preço de campanha vigente, serviços, cupons e progressivo, desconto Pix,
aprovação Asaas, estoque, estorno, sandbox, RLS, reaplicação e rollback. A API de
transportadora e a conta Asaas real não são acessadas por esses testes.
