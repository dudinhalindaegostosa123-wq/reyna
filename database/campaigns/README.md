# Campanhas sem limite fixo de participantes

Execute `01-sem-limite-participantes.sql` no SQL Editor do Supabase e publique a atualização do site.

O SQL lê as funções de campanhas instaladas e remove a validação de até 500 itens. Ele preserva as verificações de lista não vazia, preços, descontos, versão, períodos e permissões. As definições anteriores ficam na tabela privada `serenity_campaign_limit_backups_v1`. A instalação pode ser repetida.

Como o repositório não contém a definição original das funções instaladas, a atualização reconhece as validações diretas de `jsonb_array_length(p_items)` até 500. Se encontrar outra validação de 500/501, interrompe a transação inteira e informa a assinatura da função a conferir. Nesse caso, é necessário adaptar o SQL à definição instalada; não foi removida nenhuma validação desconhecida.

No site, materiais, variações, participantes e metadados são lidos em páginas, sem truncar o total da campanha. A tela mostra 50 participantes por página; isso limita somente a exibição. Selecionar todas, salvar e publicar usam a seleção completa. O salvamento continua em uma única transação do banco, sem criar campanhas parcialmente salvas.

Os limites normais de tamanho de requisição e tempo da hospedagem continuam existindo; não há limite fixo de quantidade de participantes no aplicativo. O banco de produção e o deploy precisam ser verificados após a instalação; os testes locais usam fixtures das formas de validação suportadas.

## Titânio natural e grau implante

A seleção de Titânio, Titânio Cor Natural ou Titânio Grau Implante reconhece as denominações equivalentes, ASTM F136 e a identificação de titânio no nome/tag quando o cadastro não declara outro material. Titânio banhado/revestido/PVD continua separado. Peças simples e variações ativas seguem os mesmos critérios de preço e visibilidade.

Campanhas publicadas guardam participantes fixos. Abra a campanha, selecione o material em **Completar a seleção por material** e use **Criar versão com as peças faltantes**. A operação prepara um rascunho com os participantes atuais e os que faltam, o mesmo desconto e o mesmo término. Confira e publique a nova campanha antes de cancelar a anterior. Nenhuma campanha é publicada ou cancelada automaticamente. Campanhas com descontos diferentes por participante exigem revisão manual, pois não existe um único desconto a copiar para as peças novas.

Essa correção de seleção e criação de rascunho não requer novo SQL; utiliza as funções de campanhas existentes.


## Conferir peças faltantes e completar por categoria

A campanha continua sendo uma lista fixa: escolher um material ou categoria não cria uma regra para produtos futuros. Na campanha publicada, use **Conferir peças faltantes por material** ou **Conferir peças faltantes por categoria** para comparar o catálogo atual com os participantes salvos, incluindo produtos novos e variações ativas. A conferência não muda preços.

Use **Criar versão com as peças da categoria que faltam** para preparar um rascunho com os participantes atuais e os ausentes, preservando o desconto uniforme e o término. Confira e publique a versão atualizada; depois cancele a anterior. Campanhas com descontos diferentes por participante exigem revisão manual. A inclusão automática de cadastros futuros não está habilitada.

A seleção de titânio revestido de ouro reconhece nomes equivalentes como titânio banhado em ouro e Titanium PVD Gold. Ouro maciço, aço dourado, bioflex, titânio natural e PVD preto continuam separados. Nenhum produto ou campanha de produção é alterado pelo deploy destas ferramentas. Não há novo SQL para esta conferência e preparação de rascunhos.
