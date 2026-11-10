# Contatos e checkouts não concluídos

1. Execute `database/releases/2026-11-09-checkouts-contatos.sql` no SQL Editor do Supabase. O arquivo instala a captura e o WhatsApp juntos; pode ser repetido. Se a captura inicial já foi instalada, também é possível executar somente `02-whatsapp.sql`.
2. Publique o código atualizado. No admin, abra **Checkouts não concluídos**.
3. Teste preenchendo nome e e-mail válidos com pelo menos uma peça no checkout. Confira o registro no ambiente correspondente (produção ou teste), sem enviar um pagamento.

A captura espera 1,5 segundo sem edição, registra atividade a cada minuto enquanto a página está visível e houve interação recente e tenta salvar ao sair da página ou avançar para pagamento. Falhas dessa captura nunca bloqueiam a compra. O aviso no checkout informa o acompanhamento pela loja. Não há envio de e-mail nem inscrição em publicidade.

São armazenados apenas nome, e-mail, WhatsApp opcional, identificação aleatória da tentativa, nomes/links/quantidades das peças, estimativa e datas. CPF, endereço e cartão não entram nesta tabela. A chave de escrita fica no sessionStorage do navegador; o banco recebe somente seu HMAC. RLS e permissões impedem leitura/escrita direta por visitantes ou contas comuns. A API verifica origem, tamanho, formato e o limite de requisições do checkout. Um token diferente não pode sobrescrever uma tentativa existente.

A captura não cria pedido, não reserva número ou estoque e não chama pagamentos. Usa o mesmo UUID da tentativa de compra para associar o contato à sessão quando a pessoa avança. O admin confere o estado do checkout e do pagamento antes de exibir uma possível desistência. “Possível abandono” exige 30 minutos sem atividade e nenhuma sessão de pagamento; não prova abandono real.

O número do pedido pode ser reservado por `serenity_guest_register_v1` antes da aprovação; por isso há intervalos na lista de vendas pagas. A consulta por número reservado permite encontrar essa sessão. Histórico já registrado no checkout V2 aparece mesmo antes de instalar a captura. Formulários antigos que nunca foram enviados ao servidor não podem ser recuperados.

Por consulta são lidos até 100 contatos e 100 sessões recentes, além das sessões exatas associadas aos contatos. A busca por número é direta. A captura remove seus contatos sem atualização há mais de 90 dias durante novas gravações; isso não remove histórico de pagamento/pedido. Sem novas gravações, a limpeza física não é executada automaticamente. O limite de retenção pode ser agendado no cron da infraestrutura se necessário.

A lista permite abrir os detalhes de uma tentativa e, se houver telefone válido com DDD, abrir o WhatsApp. Sessões existentes usam o telefone já salvo no checkout; os novos contatos registram o telefone quando preenchido. O link apenas abre a conversa, sem enviar mensagem automaticamente. Um pedido confirmado continua acessível pelo botão próprio.


## Contato anterior com compra relacionada

A consulta do admin busca sessões convertidas no mesmo ambiente e confirma o estado `paid` do pedido no banco. Com o mesmo navegador (HMAC privado), e-mail, peças/quantidades e janela de 24 horas, o cartão mostra **Possível tentativa anterior — compra concluída**.

Quando a associação estrita não é possível, uma compra paga posterior com o mesmo e-mail, em até 24 horas, gera **Compra paga encontrada para este e-mail — conferir tentativa**. Esse aviso não afirma que os dois registros são a mesma compra. O operador pode abrir o pedido relacionado para conferir. Uma tentativa que já tenha checkout próprio mantém seu estado independente. Outros ambientes, pedidos anteriores à criação do contato e pedidos cancelados/estornados não entram nessa indicação.

O contato original não é convertido, apagado ou marcado como pago. Se a conferência falhar, a tela informa que o vínculo não pôde ser conferido. Esta associação de consulta não exige SQL adicional.

## Exportação de e-mails

**Baixar e-mails em CSV** exporta todos os resultados dos filtros atuais, não apenas os 100 registros visuais. A leitura usa paginação por ID e os mesmos critérios de situação da lista. O arquivo inclui nome, e-mail, WhatsApp, situação e última atividade em UTC. E-mails repetidos (ignorando maiúsculas/espaços) aparecem uma vez, usando o registro mais recente.

O endpoint exige autenticação de administrador e nunca publica o arquivo em armazenamento público. A resposta é privada e não pode ser armazenada em cache. A exportação falha integralmente se alguma leitura necessária não puder ser concluída; não entrega uma lista parcial como se fosse completa. O CSV usa UTF-8 com BOM, separador ponto e vírgula, aspas escapadas e neutralização de fórmulas de planilha. HMACs, chaves e documentos não são exportados. Nenhum e-mail é enviado pela exportação.
