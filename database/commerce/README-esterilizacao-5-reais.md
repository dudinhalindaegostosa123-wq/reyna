# Esterilização opcional — R$ 5 por peça

Decisão de 28/10/2026: opção em todos os produtos; Sim acrescenta R$ 5 por unidade selecionada, Não não acrescenta valor. Não há nova opção gratuita. A orientação publicada é: “Vai usar a peça em uma nova perfuração? Selecione esta opção. Para uma troca, confirme com seu profissional se é necessário.” A escolha registra uma solicitação à equipe, sem certificar execução prévia.

## Ativação

1. Aguardar Ready do deploy deste recurso.
2. Executar **03-esterilizacao-5-reais.sql inteiro**, no SQL Editor do Supabase. O instalador inclui a estrutura de preparação do 02; não é necessário instalar o 02 separadamente. Requer as regras comerciais 01 já instaladas, como no site atual. Não executar novamente o 01 de preços. Não reaplicar o antigo 02 depois do 03, pois ele contém a cotação gratuita anterior.
3. Recarregar produto/carrinho. A interface paga só aparece quando o banco informa taxa 5; a sincronização das regras recalcula carrinhos abertos e mantém as escolhas.
4. Conferir: 1 peça com Sim = +R$ 5; 2 peças com Sim = +R$ 10; Não = sem adicional. Conferir o valor no checkout e o campo no pedido.

O SQL é transacional e repetível. Preserva as funções base e não reaplica o reajuste de 18%. Preços dos produtos, taxas de anodização e estoque não mudam. A taxa é separada do preço da joia nas cotações e não recebe desconto de cupom, progressivo, Pix ou atacado. Não compõe o valor de joias elegível para frete grátis ou mínimo de atacado. O valor unitário e subtotal finais do pedido incluem o serviço selecionado, com o campo sterilization_fee preservado por item.

Pagamentos e pedidos anteriores não são recalculados. A confirmação usa a taxa do retrato reservado: ausência de taxa significa zero para tentativas antigas, em vez de cobrar retroativamente. A solicitação continua separando linhas de carrinho e compartilhando o estoque físico; mudar a haste ou a quantidade não duplica o adicional.

O backend ignora taxas sugeridas pelo navegador e calcula sempre 5 por unidade quando sterilized=true. Campos inválidos de opção continuam rejeitados. A gravação financeira valida o adicional e depende da aprovação e do valor do pagamento existentes, sem remover verificações de identidade, idempotência ou estoque.

Validação: tests/commerce-database.test.mjs cobre instalação inicial/repetida, cotação, cupom/progressivo, Pix, atacado, pedido gravado e preservação de pagamento anterior; tests/commerce-ui.test.cjs cobre adicionar, selecionar/remover, sincronizar e recalcular sem duplicar.
