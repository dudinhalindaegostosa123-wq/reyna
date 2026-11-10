# Venda individual de push pin e mamilo

A escolha Par/Unidade deixa de ser uma apresentação disponível para novas compras desses produtos. Para duas joias, o cliente escolhe quantidade 2. O preço de Unidade existente é preservado; quando só existe Par para uma combinação, seu preço atual passa a valer para uma peça, sem divisão, conforme decisão explícita do usuário. Não alterar preços normais, promocionais ou estoque ao normalizar.

Executar `database/commerce/07-venda-individual-push-pin-mamilo.sql` antes de publicar o código desta alteração. O script guarda cópia privada dos cadastros alterados, remove o limite `sold_individually` de uma peça por pedido nos produtos elegíveis publicados e normaliza as variantes:

- Par com Unidade equivalente: desativa somente a variante Par.
- Somente Par: troca a apresentação para Unidade e preserva exatamente os preços e o estoque.
- Combinações duplicadas sem unidade inequívoca: aborta a transação para não escolher um SKU arbitrariamente.

A cotação instalada é preservada numa função-base e recebe uma validação adicional para impedir novas compras de variantes Par que sejam reativadas/criadas posteriormente. Somente novos orçamentos são afetados. A conclusão de pagamentos já emitidos usa os valores e dados salvos, incluindo a apresentação histórica; não se reescrevem pedidos, cobranças ou vendas anteriores.

A vitrine remove a palavra Par do título desses produtos, retira a dimensão de embalagem das variações unitárias e seleciona automaticamente uma única opção unitária quando não há escolha real restante. Cores e medidas diferentes continuam sendo escolhidas. A indicação “Venda por unidade; para duas peças selecione quantidade 2” aparece junto às opções de compra. Não há mudança em outros pares/conjuntos (como brincos) fora de push pin/mamilo.

Após executar o SQL e publicar, aguardar a atualização do cache do catálogo (até 60 segundos) e conferir uma joia de cada grupo, 1 e 2 unidades, preços e carrinho. Links/carrinhos antigos com a variante Par desativada precisam selecionar o cadastro unitário novamente antes de pagar; não se gera nova cobrança automaticamente.
