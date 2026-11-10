# Medidas e opções preservadas na compra antiga

O CSV inicial de itens tem IDs de produto/variação, mas não os textos das opções escolhidas. Não recuperar a medida pelo catálogo atual: ele pode ter mudado desde a compra.

1. Executar `database/legacy-labels/wordpress/02-exportar-opcoes-compradas.sql` na aba SQL do phpMyAdmin da Hostinger (MySQL antigo). Exportar o resultado inteiro como CSV.
2. Depois do deploy Ready, executar `database/legacy/02-opcoes-compradas.sql` no SQL Editor do Supabase.
3. Em Histórico do site antigo → Complementar medidas e opções, enviar o CSV. Colunas: pedido_antigo, item_antigo, atributo, valor. Limite de arquivo: 3 MB.
4. Conferir um pedido com haste. As opções aparecem nos detalhes administrativos e no histórico da conta do cliente.

A função altera somente payload.opcoes_compra dos itens históricos correspondentes. Não altera nome original, valores, quantidades, pedidos atuais, estoque ou documentos de envio já preparados. Repetir o mesmo arquivo não duplica opções. Um valor divergente já importado ou um par item/pedido inexistente aborta a transação inteira.

O importador não cria uma medida quando a opção não está no arquivo. Se o banco antigo também não tiver guardado as escolhas, o item precisa ser conferido pela equipe antes da separação.
