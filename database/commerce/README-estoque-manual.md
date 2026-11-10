# Respeitar disponibilidade definida no admin

Execute `08-respeitar-estoque-manual.sql` no SQL Editor do Supabase depois das atualizações anteriores de comércio.

A etapa 04 instalou um gatilho que, em qualquer inclusão/edição de produto publicado ou variação ativa, substitui `stock_status` por `instock` e `stock_quantity` por `null`. Isso desfaz uma escolha manual de “Sem estoque”, inclusive quando outras informações do produto são salvas depois.

Esta correção remove somente os dois gatilhos que forçam esse comportamento. Não altera dados em massa, não restaura backups antigos, não altera pagamentos/pedidos e mantém as validações de estoque. Peças com quantidade vazia continuam sem limite numérico quando marcadas como em estoque. Quantidades explícitas e “Sem estoque” passam a ser respeitadas.

Depois de executar, reabra a peça, marque **Sem estoque** e salve novamente. Os valores já sobrescritos pela automação anterior não podem ser inferidos com segurança. Para produtos com variações, confira o estoque das variações e o resumo calculado do produto.

Na loja, peças indisponíveis mantêm a foto e a identificação, escondem preços/descontos e mostram o formulário **Avise-me quando voltar ao estoque**. A volta ao estoque continua usando o fluxo de avisos existente. Se a antiga etapa 04 for executada novamente, reaplique esta correção por último.
