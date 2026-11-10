# Incidente de conexão / checkout — 26/10/2026

## Evidência recebida

Cliente viu `CHECKOUT-INDISPONIVEL` ao continuar do frete para o pagamento. Logs enviados da Vercel mostram `fetch failed`, `ETIMEDOUT` e `UND_ERR_SOCKET` em consultas de produto, metadados de categoria e conta. Os trechos não incluem a tentativa exata do checkout; eles comprovam falhas transitórias de transporte nessas leituras, mas não determinam a causa específica do checkout.

## Mitigação implementada

- Leituras GET/HEAD do catálogo, autenticação, acesso comercial e consultas de Mercado Pago ganham no máximo uma repetição em falhas de transporte ou HTTP 502/503/504.
- Cada tentativa de leitura tem prazo de 4,5 segundos. Cancelamento do chamador é respeitado. A rotina não repete HTTP 401/403 ou falhas de validação.
- POSTs, RPCs, criação de sessão, reservas de estoque e cobranças não são repetidos automaticamente.
- O erro do início do checkout registra somente etapa validada, código técnico validado e identificador UUID da tentativa. Não registra nome, CPF, e-mail, endereço, carrinho, cookies ou credenciais.
- Falhas de conexão do limitador deixam de perder toda a classificação técnica; códigos SQL seguros são preservados.
- Referências de falha agora distinguem banco, consulta da conta Mercado Pago, abertura da sessão, leitura do contexto e gravação do acesso.
- Mensagens específicas foram adicionadas para haste ausente/inválida e opção de esterilização inválida.

## Validação e limite

Testes verificam recuperação de leitura, limite de duas tentativas, ausência de repetição de escrita, respeito a cancelamento e diagnóstico de falhas antes de reservas/cookies. Não houve acesso aos serviços de produção ou reprodução da compra da cliente. A mitigação não comprova recuperação da tentativa real. Se persistir, coletar o novo código/etapa nos logs da função do checkout, na linha temporal da tentativa, sem dados pessoais.

Não requer SQL, alteração de credenciais ou criação de pagamento de teste. Após o deploy Ready, atualizar a página no mesmo navegador e tentar continuar com o carrinho preservado. Refazer o frete somente se a tela indicar que a cotação expirou; não substituir uma tentativa de pagamento já iniciada por outra sem verificar sua situação.

## Causa reproduzida após a referência detalhada

A referência `CHECKOUT-CHECKOUT_CONTEXT_INVALID-CONTEXT` localizou a rejeição na normalização da sessão depois do RPC de abertura. O parser reutilizava a validação de inteiro estritamente positivo nos campos `payment_options.applied_discount_cents` e `pix_discount_cents`.

O SQL de Pix retorna legitimamente desconto aplicado zero antes da escolha do método e no cartão, assim como desconto Pix zero no atacado ou em condições sem benefício. Uma sessão inicial válida reproduziu exatamente `CHECKOUT_CONTEXT_INVALID` no teste antes da correção.

A correção permite inteiros não negativos somente nesses dois campos de desconto. Totais e número de pedido continuam estritamente positivos; validações de diferença entre cartão/Pix, limites de desconto e vínculo de sessão são mantidas. A regressão cobre zero, Pix selecionado, cartão, atacado, valores negativos/fracionários/ausentes/inseguros e totais incoerentes. O teste de banco do Pix agora passa as respostas SQL reais pelo mesmo parser da aplicação, antes e depois de selecionar métodos.

A falha de transporte dos logs anteriores era uma ocorrência distinta; não era prova da causa deste bloqueio. Não é necessário executar SQL ou recriar a compra para aplicar a correção do parser. O funcionamento no caso da cliente precisa ser confirmado após o deploy.
