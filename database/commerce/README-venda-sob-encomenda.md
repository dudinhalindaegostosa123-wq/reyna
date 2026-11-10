# Venda sob encomenda e aprovação após expiração

Solicitação de 01/11/2026: a loja vende independentemente do saldo físico e faz a compra ao fornecedor. O modo anterior bloqueava o produto sem estoque e a conclusão de um pagamento aprovado depois de vencer a reserva. O caso informado foi Pix R$133,89, em review, sem pedido, com reserva vencida; não foi possível consultar o Mercado Pago ou o banco de produção daqui.

## Ativação

Executar `04-venda-sob-encomenda.sql` inteiro no Supabase SQL Editor. É uma migração de banco: o deploy de código sozinho não ativa a regra. Não reexecutar as migrações anteriores de preço/desconto/esterilização para ativar esta. Se uma função instalada diferir do contrato esperado, o instalador aborta e desfaz tudo.

O modo deixa o saldo operacional ilimitado (`stock_quantity = null`, status disponível) para produtos publicados e visíveis e suas variantes habilitadas. Guarda o saldo/status anterior em tabela privada `serenity_unlimited_stock_backup_v1`; não inventa saldo positivo. Triggers mantêm esse modo em novas inserções/atualizações. Isso é uma escolha de operação sem controle de saldo físico, não um sistema de reservas de unidades físicas. Para desativar/restaurar, é preciso conciliar os movimentos e compras desde a ativação; não restaurar cegamente saldos históricos.

Produtos desativados/ocultos e variantes desabilitadas não são reativados. Preços continuam obrigatórios e a restrição de venda individual permanece. O estoque ilimitado é lido pelas mesmas consultas já utilizadas por catálogo, checkout varejo/atacado, projetos e feed; pode haver cache de aproximadamente 60 segundos por camada. Não altera preços nem descontos.

## Confirmação de pagamento

A conclusão original é preservada em `serenity_unlimited_complete_base_v1`. O wrapper renova reservas somente para pagamento de produção já aprovado, com status do provedor aprovado, ID do provedor existente, sem estorno e com valor exatamente igual ao checkout. Não revive checkout cancelado, não muda prazo de acesso do navegador, preço, valor pago ou data da compra. No modo ativado, a data de expiração da reserva não impede uma aprovação já validada. Estoque e cupons são refeitos no mesmo lock/transação da conclusão; itens, snapshots, limites e valores de cupons continuam validados. Uma falha desfaz a tentativa inteira. O caminho existente de observação registra application_state=applied somente depois de concluir.

Não há API de cobrança nova. Para recuperar o caso existente, depois do SQL, Administração → Pagamentos → tentativa aprovada → **Consultar situação**. O servidor consulta o pagamento no Mercado Pago e reaplica a confirmação. Se houver outra divergência, mantém conferência e não gera cobrança. A execução SQL desta migração não conclui retroativamente pagamentos sozinha.

O pedido resultante usa o fluxo existente de Compras do fornecedor; não envia uma compra real ao fornecedor. Não houve alteração nas views de compras, portanto cadastros incompletos de custo/fornecedor continuam sujeitos ao tratamento já existente nessa área. Avisos de pedido dependem da fila e worker já configurados.

## Validação

PGlite com funções e migrações do fluxo comercial: instalação repetida, backup do saldo, quantidades superiores ao saldo anterior, produto desativado e variante desabilitada continuam bloqueados, pagamento ainda não aprovado não conclui, aprovação após reserva vencida (ativa e liberada), cupom+Pix+esterilização mantêm o total, idempotência sem segundo pedido ou segunda utilização de cupom. Testado com e sem opções de preparação instaladas antes da migração. Produção ainda depende da execução manual do SQL e reconciliação do pagamento.
