# Google Ads — compra confirmada

A tag AW-11257948716 e a conversão _htiCIPG0fgbEKzUmvgp são habilitadas somente em deployments Vercel de produção. Previews e execuções locais não carregam a tag.

O evento usa o contexto validado pelo servidor em /pagamento/[id], após a sessão ser convertida em pedido e existir uma tentativa aprovada e aplicada. Não dispara para Pix gerado, pagamentos pendentes, testes, conferência, estornos ou chargebacks. O valor é totalCents / 100 (total cobrado, incluindo frete e descontos); moeda BRL e transaction_id = orderId.

A tag é inicializada antes de enfileirar o evento, inclusive quando o efeito do checkout roda antes do efeito do layout. Uma proteção em memória e localStorage evita repetir o envio neste navegador; o ID do pedido também permite a deduplicação pelo Google na mesma ação de conversão. Enfileirar não comprova recebimento pelo Google: bloqueadores, consentimento e falhas de rede podem impedir a medição.

## Validação após deploy

1. Abrir a loja de produção pelo Tag Assistant e confirmar AW-11257948716.
2. Criar um pedido real autorizado: gerar Pix deve produzir zero eventos de compra.
3. Confirmar o pagamento e manter a página aberta: conferir um evento conversion com o destino acima, o ID do pedido e o total em BRL.
4. Atualizar a página: não deve haver novo evento para o pedido no mesmo navegador.
5. Repetir com cartão aprovado. Não inserir informações pessoais nos parâmetros do evento.
6. Conferir no Google Ads se esta ação deve ser a compra principal; evitar outra ação principal medindo a mesma venda (por exemplo, importação de purchase do GA4 ou plugin antigo). Para vendas, configurar contagem Todas e valores diferentes por conversão. Verificar vínculos da conta antiga Google for WooCommerce antes de remover qualquer integração.

## Limite de cobertura

Esta é uma integração pelo navegador. Se o cliente fechar a página antes da aprovação do Pix e não voltar à página de pagamento com seu cookie válido, a compra não será enviada. Nenhuma chamada à API Google Ads foi acrescentada ao webhook de pagamentos. Cobertura assíncrona exige configuração separada da API, captura e persistência de identificadores de atribuição e um mecanismo de envio com repetição e deduplicação. Nunca chamar gtag dentro do webhook: ele depende do navegador.

Não há promessa de medição de 100% das vendas nem mudança no processamento financeiro.

## GA4 no site novo

A implementação posterior está em `docs/mensuracao-ga4.md`. A tag também configura G-ZR73XP32BW e acrescenta eventos do carrinho. O envio de compra pelo servidor usa uma fila privada e requer SQL, API secret, ativação e agendamento. A conversão direta AW descrita acima é preservada para uma transição controlada; não deixar as duas ações de compra como principais depois de validar a importação GA4.
