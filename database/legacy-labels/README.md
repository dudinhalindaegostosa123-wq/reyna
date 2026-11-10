# Etiquetas dos pedidos antigos

Depois do deploy Ready, executar `01-etiquetas-antigas.sql` inteiro no SQL Editor do Supabase. Pode ser executado novamente: não cria etiquetas, não compra e não importa vendas. Não substitui a estrutura original de pedidos nem a central v1.

Na central Etiquetas:

- Pedidos antigos Em processamento e Concluídos entram em Antigas: etiqueta não conferida, identificados pelo número antigo. O status da venda não comprova ausência de etiqueta nem necessidade de novo envio. Só entram em Precisam de etiqueta depois da confirmação explícita da equipe. Para instalações anteriores, executar também 02-separar-etiquetas-nao-conferidas.sql.
- Ainda preciso comprar: confirmar pagamento, necessidade de envio e ausência de etiqueta; preparar endereço/embalagem, consultar opções e escolher transportadora, preparar e conferir/confirmar a compra. Uma preparação sem pagamento pode participar do grupo de até cinco etiquetas junto aos pedidos novos.
- Já comprei: informar UUID do envio do Melhor Envio e confirmar o destinatário. O servidor consulta o envio com o token da loja, exige pagamento confirmado e compara nome ou e-mail + CEP do pedido. Salva o documento e CEP completos retornados para conferir o mesmo vínculo nas consultas futuras. Não compra novamente. Depois, gerar/imprimir pela central.
- CPF/CNPJ, número e bairro não vieram na exportação inicial. Completar os campos ausentes. A embalagem padrão é apenas um ponto de partida; confirmar as medidas reais.
- Estornos, cancelamentos e vínculos em conferência não são liberados automaticamente para novo envio. A situação precisa ser resolvida antes.
- Postagem de pedidos antigos é reconhecida ao consultar a situação no Melhor Envio; não é registrada por um simples pagamento de etiqueta. O sincronizador automático de rastreio dos pedidos novos não é ampliado por esta instalação.

A instalação mantém registros logísticos próprios, RLS sem acesso de clientes, eventos próprios e as verificações de concorrência das funções instaladas. Não insere em serenity_orders, não aciona estoque/fornecedor, não reenvia e-mails de compra e não entra nos totais de vendas. A mesma etiqueta não pode ser vinculada a um pedido novo e a um antigo, nem a dois antigos.

As funções de etiqueta são copiadas da instalação existente somente após conferir as dependências conhecidas. Caso o código instalado tenha mudado, o SQL aborta em vez de copiar uma operação desconhecida. As funções originais permanecem em uso para os pedidos novos. Antes do SQL, a central usa a view v1 e informa que os antigos ainda não estão habilitados.

Validações: migração repetida, preservação do faturamento e dos pedidos originais, bloqueios por estado/estorno, compra única sob lock, rejeição de destinatário divergente, proteção de RPC/tabelas, e preservação dos centavos nas declarações de conteúdo com múltiplas unidades.

## Documento do destinatário temporariamente opcional no painel

CPF/CNPJ vazio não é uma pendência local de etiqueta. Se preenchido, continua sendo validado. O documento do remetente e as regras do checkout permanecem exigidos. Um documento vazio é omitido do payload do Melhor Envio, sem inventar CPF. A transportadora pode exigir o documento na emissão de uma etiqueta nova; a decisão do provedor é preservada.

Vincular/imprimir uma etiqueta existente não exige que o site antigo tenha coletado CPF. O vínculo novo verifica UUID do envio, CEP e nome ou e-mail. Se o provedor devolver um documento completo, ele também é preservado para conferir o vínculo. Vínculos de versões anteriores que só possuíam CPF/CEP continuam verificando o documento quando retornado e usam o mesmo UUID/CEP quando o provedor o omite.

## Busca por código da joia

Executar `04-busca-codigo-joia.sql` no Supabase após o deploy Ready e com a central v2 instalada. O campo de busca passa a aceitar pedido, cliente ou código (por exemplo TN623). Pesquisa SKU/nome preservados nos itens atuais e códigos nos nomes dos itens antigos. Não depende do cadastro atual do produto. Mantém a aba, os filtros e a paginação; um pedido com várias peças iguais aparece uma vez. A view v3 é exclusiva do service_role. Antes da instalação, as buscas de pedido/cliente continuam disponíveis e o painel informa que a busca por joia ainda não está habilitada.

As recusas definitivas de preparação passam a guardar o diagnóstico sanitizado no contexto da mesma operação rejeitada. A atualização é condicionada ao ID, operação e estado, preserva os dados da cotação e não sobrescreve outra preparação. Consultar uma nova cotação limpa o diagnóstico anterior. Tentativas anteriores à atualização podem ter apenas o estado rejeitado, sem detalhe salvo.

## Contatos e endereço antigos

A primeira exportação de pedidos não incluía número/bairro nem o telefone específico da entrega. Para recuperá-los em conjunto, executar `wordpress/04-exportar-contatos-enderecos.sql` no phpMyAdmin da Hostinger e exportar o resultado completo como CSV. A consulta inclui endereços de cobrança/entrega e metadados adicionais de contato e endereço; não altera o WordPress.

Telefones brasileiros com DDI +55 são normalizados apenas quando têm 12 ou 13 dígitos. DDD 55 de um telefone nacional não é cortado. Campos de rascunhos antigos vazios podem reutilizar dados já conhecidos do mesmo destinatário/endereço; número e bairro não são copiados se a rua/CEP/cidade/UF tiverem mudado. Complemento e valores preenchidos manualmente são preservados. Valores inexistentes na origem não são inventados.
