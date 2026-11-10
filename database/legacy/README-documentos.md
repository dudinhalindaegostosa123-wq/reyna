# Recuperar documentos para etiquetas antigas

1. Depois do deploy Ready, executar `03-documentos-destinatarios.sql` no SQL Editor do Supabase.
2. Em Histórico do site antigo → Recuperar CPF/CNPJ dos pedidos antigos para etiquetas, enviar o CSV com `pedido_antigo,campo,valor`. Campos aceitos: `_billing_cpf`, `_billing_document`, `_billing_cnpj`. Limite: 3 MB.
3. A importação informa pedidos aptos, pedidos para conferir e registros fora do histórico elegível. A lista de conferência mostra somente números de pedido e o motivo, sem expor documentos.
4. Nos envios aptos: atualizar a página, conferir destinatário, salvar o rascunho, consultar o frete novamente e preparar. Uma cotação anterior com outro documento é considerada desatualizada.

Regras:

- Valida dígitos verificadores de CPF/CNPJ, preservando zeros à esquerda. Não inventa documentos.
- Não escolhe arbitrariamente entre documentos válidos diferentes no mesmo pedido.
- Mesmo documento encontrado em nomes de cobrança distintos é separado para conferência. Validade dos dígitos não comprova que o CPF pertence ao destinatário.
- Exige correspondência entre nome de cobrança e nome de entrega preservados no pedido. Vínculos com pendências também ficam para conferência.
- Documentos de pedidos inexistentes, invisíveis ou de estorno não são associados a outros pedidos por aproximação de nome/e-mail.
- Armazena somente os documentos aprovados em tabela privada com RLS e acesso exclusivo de service_role. Os casos para conferência guardam o motivo e não guardam um CPF como aprovado.
- Não altera pedidos originais, faturamento, valores, estoque, campos de conta ou etiquetas compradas. Não cria notificações nem faz compras de etiqueta.
- Não substitui documento preenchido manualmente no rascunho. Se o nome do destinatário for alterado, o documento recuperado não é preenchido por suposição.
- Repetir o arquivo é permitido. Um documento aprovado diferente de uma importação anterior aborta a transação; pedidos antes separados para conferência não são liberados automaticamente por um arquivo menor.

A tabela privada não é acrescentada às views da central nem ao histórico público da conta. O acesso aos documentos ocorre somente nos dados de preparação de envio do administrador autenticado. O resumo retornado e os testes não registram CPFs reais em logs.
