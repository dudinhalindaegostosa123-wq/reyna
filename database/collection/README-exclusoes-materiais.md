# Exclusões de materiais do desconto progressivo

Execute `03-excluir-ouro-bioflex.sql` no SQL Editor do Supabase, depois da instalação original do progressivo (`01-progressivo.sql`). Pode ser executado após a atualização de faixas (`02-faixas-5-7-10-15.sql`); não altera os percentuais instalados. Pode repetir a execução.

Ouro 18K (incluindo descrições com 750) e Bioflex deixam de contar para a quantidade e para o valor elegível ao desconto progressivo. Em carrinhos mistos, somente as demais joias elegíveis contribuem para a faixa. Isso também vale para variações: a classificação é a do produto pai. Cupons continuam seguindo suas próprias regras, e a alocação do cupom entre linhas é preservada.

Titânio revestido/banhado de ouro permanece sendo titânio e não é confundido com ouro maciço. Quando o material está vazio, a classificação consulta o nome e as categorias. As demais regras instaladas de elegibilidade são preservadas em `serenity_collection_is_jewel_base_v3`.

A instalação não altera produtos, faixas, pedidos pagos ou seus registros de pagamento; novas cotações usam a nova regra. Publique também as alterações do site para exibir as exclusões nos avisos da campanha e no carrinho. Publicar o código no GitHub não executa este SQL no Supabase.
