# Esterilização gratuita e correção dos microdermais

1. Aguarde o novo deploy ficar Ready.
2. Execute `02-esterilizacao-microdermal.sql` no SQL Editor do Supabase. É transacional e pode ser repetido.
3. Recarregue a loja. Em uma joia, escolha “Deseja a peça já esterilizada? Sim — gratuita”, adicione ao carrinho e confira o resumo. Também é possível escolher no carrinho, inclusive em peças de projetos prontos.
4. Na próxima compra acompanhada, confira a opção no item do pedido. O campo registra uma **solicitação** de preparação: não certifica que a esterilização foi realizada. A equipe precisa cumprir a solicitação antes da expedição.

A migração não reaplica a redução de 18%, não altera preços, pedidos existentes ou tentativas de pagamento anteriores. A escolha de esterilização permanece separada por linha, usa o mesmo estoque físico e não tem taxa. Pedidos antigos sem essa informação permanecem sem informação, sem presumir uma escolha.

As hastes comuns de 4/6/8/10 mm continuam incluídas nos demais topos conforme a regra já instalada. Peças cujo nome identifica microdermal deixam de receber automaticamente uma haste de labret. Essa correção vale para os topos microdermais e para as bases microdermais que mencionam “topos” no nome.

## Pendência de compatibilidade da base microdermal

O CSV `produtos.csv` contém:

- TN1072/TN1073/TN1074 e outros topos: nome “Microdermal 1.6mm”; descrição com rosca de 1,2 mm e compatibilidade declarada com haste de 1,6 mm.
- TN1390: nome “Base Microdermal Para Topos 1.2mm”; descrição com rosca interna de 0,9 mm, altura de 2,0 mm e espessura externa de 1,6 mm.

Portanto, o cadastro não comprova que a TN1390 seja a base correta para aqueles topos. 1,2 mm, 1,6 mm e 2,0 mm descrevem dimensões diferentes no próprio arquivo. Não converter automaticamente esses números em opções de comprimento. As tentativas de consulta ao Google, site publicado e fabricantes foram bloqueadas pelo proxy de rede do ambiente; não houve verificação externa.

A escolha opcional de uma base grátis ainda depende da confirmação do código da base compatível e das especificações do fornecedor. Não foram ativadas opções 1,2/1,6 mm intercambiáveis nem prometida uma base cuja compatibilidade não foi comprovada. Até essa confirmação, a página orienta consultar o atendimento para incluir uma base compatível.

A nova interface só é ativada depois da instalação do SQL (`preparation_options=true`). A leitura das regras antigas continua funcionando antes da instalação. Não execute novamente o SQL antigo de preços para ativar essa função.
