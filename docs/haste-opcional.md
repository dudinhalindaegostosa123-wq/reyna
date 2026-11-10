# Topo avulso e joia completa

Produtos elegíveis a haste oferecem “Somente o topo” (padrão) ou “Joia completa — haste + topo (+ R$ 5,00 por peça)”. A segunda opção mostra 6 mm (padrão ao escolher completa) e 8 mm. O carrinho permite trocar ou retirar a haste e remove o adicional ao retornar ao topo avulso. Hastes que já fazem parte de uma variação física permanecem vinculadas ao SKU; não se altera o produto físico silenciosamente. Seleções antigas de 4/10 mm continuam identificadas no carrinho, mas novas hastes opcionais são 6/8 mm.

## Instalação

1. No banco, aplicar `database/commerce/05-servicos-esterilizacao-hastes.sql`, se ainda não aplicado. É pré-requisito: instala a cobrança de R$ 5 da haste e as regras de serviços já solicitadas (esterilização R$ 10 e anodização gratuita).
2. Aplicar `database/commerce/06-haste-opcional.sql`. A migração aborta se a cotação instalada não corresponder à estrutura esperada; repetir é seguro. Não editar as guardas para forçar instalação.
3. Publicar o frontend desta alteração após aplicar as migrações.
4. Conferir produto simples elegível, com e sem haste, duas unidades, alteração no carrinho, esterilização e pagamento. Validar que a etiqueta e o painel exibem o comprimento efetivamente comprado.

Não há alterações em pagamentos, pedidos, estoque ou reservas existentes. O valor cobrado é recalculado pelo servidor em novas cotações. A taxa da haste fica fora do desconto progressivo. Os testes de pagamento incluem a conclusão idempotente de compras anteriores e novas compras com e sem haste. Testes locais com banco PostgreSQL embutido não substituem a conferência do ambiente publicado e das integrações externas.
