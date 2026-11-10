# Titânio revestido de ouro 24K e estoque manual

Execute `database/releases/2026-11-09-estoque-titanio-24k.sql` no SQL Editor do Supabase. Essa atualização inclui a correção do estoque manual e a troca de 18K para 24K nos cadastros de titânio revestido. Pode ser repetida.

São atualizados os campos existentes de nome, material, descrição curta/completa, SEO, tags textuais e atributos de produtos/variações. Nos produtos identificados como titânio revestido de ouro, as menções ao ouro do revestimento passam para 24K. “Ouro 18K maciço” permanece com sua identificação. Os registros anteriores ficam em `serenity_coating_rename_backup_v1`, com acesso restrito ao serviço/admin.

Não são alterados preços, campanhas publicadas, quantidades, situação de estoque, SKUs, slugs ou links antigos. Pedidos e outros registros financeiros históricos não são regravados. O SQL retira primeiro os gatilhos da etapa 04 que forçavam estoque disponível, para que a troca de textos não reative peças indisponíveis.

Para tirar uma peça de estoque, execute a atualização e depois reabra a peça, marque “Sem estoque” e salve novamente. A loja passa a exibi-la sem preço, com a opção de aviso de reposição existente.
