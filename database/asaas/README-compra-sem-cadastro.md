# Compra sem cadastro na Lunarity

O formulário, as ações de checkout e a página `/acompanhar` já suportam visitantes.
O instalador inicial deixou esse modo desativado porque não havia a base de
acompanhamento no banco. Não basta desviar o redirecionamento de login.

## Aplicar na loja atual

1. Executar inteiro `04-compra-sem-cadastro.sql` no SQL Editor do Supabase da
   Lunarity que já recebeu `03-instalar-base-lunarity.sql`.
2. A saída esperada é `compra_sem_cadastro={"ready":true,"version":1}`.
3. Na Vercel, em Production, definir `SERENITY_GUEST_CHECKOUT_ENABLED=true`.
4. Fazer Redeploy e aguardar Ready. Testar `/checkout` em janela anônima: o
   formulário de contato e entrega aparece com login e cadastro opcionais.

Não reaplicar o instalador inicial ou o pacote antigo de visitante que depende
de e-mails/etiquetas. Esta migração é específica para a base da Lunarity e pode ser
reaplicada sem apagar pedidos, contas, cobranças, números reservados ou tokens.
As permissões e confirmações de Pix/cartão continuam sendo as do checkout Asaas.

A chave administrativa `SUPABASE_SECRET_KEY`, já exigida pelo checkout, também
pode assinar links de acompanhamento com um propósito HMAC separado, sem expor a
chave. Se existir `SERENITY_GUEST_TRACKING_SECRET`, ele continua tendo preferência.
Não trocar uma chave dedicada já existente. Na ausência dela, não é preciso
cadastrar outra credencial para habilitar este modo.

## Comportamento

- O visitante informa contato, documento e endereço; não precisa criar senha.
- Nenhuma conta de usuário é criada para ele. Uma conta com o mesmo e-mail não
  adquire automaticamente o pedido ou permissões de atacado.
- Uma sessão de pagamento mantém o cookie HttpOnly e a capacidade que já eram
  usados para autorizar a tentativa. O acesso não depende só do UUID do pedido.
- A confirmação Asaas cria o pedido pago e baixa o estoque uma única vez.
- O número reservado ao checkout é mantido no pedido confirmado.
- O acompanhamento funciona por cookie e por um link privado com token no
  fragmento da URL. A página de confirmação permite copiar esse link; o token
  bruto não fica no banco e não revela chave administrativa ou dados de cartão.
- O link só pode ser gerado após validar o cookie da própria sessão visitante.
  Dados de contato, CPF/CNPJ e ID do pagamento não são expostos pelo acompanhamento.
- Quem já tem conta pode continuar comprando conectado. Tentativas que já
  pertencem a uma conta continuam exigindo seu proprietário.
- O acompanhamento independe de tabelas de etiquetas ou e-mails. A instalação
  completa de notificações por e-mail continua sendo uma etapa separada.
- Tokens revogados, expirados ou de outro ambiente não retornam o pedido.

## Validação

```bash
node --test tests/lunarity-guest.test.mjs tests/guest-tracking-security.test.cjs tests/asaas-checkout.test.cjs tests/customer-checkout-login.test.cjs
node scripts/test-asaas-browser.cjs
```

O teste SQL parte da instalação real da Lunarity em Postgres isolado, sem tabelas
de e-mail ou etiquetas. Valida sessão visitante, desconto Pix, confirmação,
estoque, número do pedido, acompanhamento e reaplicação. O navegador usa o
componente real com respostas de servidor simuladas. Nenhuma cobrança real é
criada por esses testes.
