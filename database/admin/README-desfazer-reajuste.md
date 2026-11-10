# Desfazer reajustes de preços

Instale `06-desfazer-reajuste.sql` no SQL Editor do Supabase, após as migrações `02-precos-por-material.sql` e `03-precos-por-categoria.sql`. A instalação é transacional e pode ser repetida. Não executa nenhum reajuste ou restauração durante a instalação.

Em `/admin/precos`, cada reajuste no histórico possui **Desfazer reajuste**, seguido de confirmação. O histórico é atualizado após aplicar ou desfazer. Reajustes anteriores à instalação também podem ser desfeitos usando o backup já registrado.

A restauração usa os valores originais, inclusive centavos e preços promocionais nulos. Uma segunda solicitação para o mesmo reajuste não altera os preços novamente. A operação inteira é recusada se um produto ou variação foi removido ou se seus preços atuais diferem do resultado do reajuste. Para reajustes sobrepostos, desfaça os mais recentes primeiro. Edições manuais conflitantes precisam ser conferidas no produto.

O backup original é preservado. A tabela privada `serenity_price_undos_v1` registra o administrador e a data da restauração; somente `service_role` pode acessar a tabela e executar a função. Pedidos e pagamentos existentes não são alterados.

Validação local:

```bash
node --test tests/undo-prices.test.mjs tests/undo-prices-ui.test.cjs tests/undo-prices-actions.test.cjs tests/material-prices.test.mjs tests/category-prices.test.mjs tests/category-prices-ui.test.cjs tests/price-category-compat.test.mjs
npx --no-install tsc --noEmit
```
