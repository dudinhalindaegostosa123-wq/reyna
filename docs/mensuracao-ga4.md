# GA4 e mensuração de compras da Serenity

## Problemas encontrados

A loja carregava apenas a configuração AW-11257948716. A compra direta do Ads era disparada no navegador em `/pagamento/[id]`; Pix aprovado com a página fechada, ou recuperado pelo administrador, podia criar o pedido sem emitir essa conversão. Não existiam eventos padrão de carrinho. A ação antiga importada do GA4 usava o evento gerado para carregamento de `/carrinho/`, que não equivale a adicionar um produto.

## Implementação

A mesma biblioteca gtag configura o fluxo **G-ZR73XP32BW**, sem instalar outro script duplicado. Eventos `add_to_cart`, `view_cart` e `begin_checkout` descrevem adição efetiva, abertura do carrinho e entrada no checkout. A instrumentação observa diferenças de quantidade, sem contar atualização de preço, troca de haste/cor, remoção ou restauração do carrinho persistido como adições. Cliques da página de entrada são preservados para diagnóstico. URLs explícitas de mensuração descartam parâmetros fora da lista de campanha e IDs privados de pagamento. Áreas de administração, conta e acompanhamento privado não carregam a instrumentação.

Antes de continuar para pagamento, o navegador solicita ao gtag o client_id e session_id do GA4, com espera máxima de 500 ms. Não cria IDs artificiais se o Google estiver bloqueado ou indisponível. Recusa contexto com negativa explícita de analytics_storage. O servidor valida formato, propriedade e capacidade privada da sessão antes de persistir. A operação adicional tem timeout de 1,5 s; erro de mensuração não impede o checkout.

Uma tabela privada guarda o contexto. Após aprovação **aplicada** e criação do pedido de produção, um trigger gera uma única entrada na fila. Não aceita testes, histórico, vendas manuais, pendentes, revisão ou pagamentos divergentes. A falha do trigger de telemetria é isolada da transação financeira; o worker pode reconstruir entradas ausentes que tenham contexto válido. Não há backfill de identificadores para compras antigas sem contexto.

O worker envia `purchase` pelo Measurement Protocol do GA4, com transaction_id estável, contexto original e horário da compra. Valor é receita de mercadorias/serviços após descontos; frete é enviado separadamente, conforme a semântica GA4, e não incluído em value. Há distribuição exata de centavos entre itens. Não envia nome/e-mail/CPF/telefone/endereço do comprador, nem senha ou token de acompanhamento. Não presume consentimento concedido; negativas explícitas são preservadas e os demais estados são herdados da interação on-line correspondente.

A fila usa leases, chave única por pedido e resposta HTTP vinculada à lease. Erros transitórios conhecidos têm tentativas limitadas; falha de transporte ambígua vai para conferência. Leases antigas não são reenviadas cegamente. HTTP 2xx representa aceitação do pedido HTTP, **não prova** de processamento pelo GA4 ou atribuição a uma campanha. O painel chama o estado de “Enviado ao endpoint do GA4”. Teste `serenity_connection_test` permite conferir Tempo real/DebugView sem criar uma compra fictícia.

## Configuração

1. Na Vercel Production: `SERENITY_GA4_API_SECRET` recebe o segredo criado no fluxo G-ZR73XP32BW. Não colocar no chat, Git ou NEXT_PUBLIC.
2. Aplicar `database/analytics/01-eventos-compra.sql` completo no Supabase. Não cria venda nem reprocessa pagamentos.
3. Aplicar `database/analytics/02-agendamento.sql`; reutiliza serenity_cron_secret no Vault e cria o job de nome fixo a cada 5 minutos. Não cria um cron Vercel incompatível com Hobby.
4. Configurar `SERENITY_GA4_SERVER_ENABLED=true` em Production e redeploy. O ID da propriedade tem o valor padrão acima; `SERENITY_GA4_MEASUREMENT_ID` é opcional para futura troca controlada da propriedade.
5. Administração → Mensuração: testar conexão e confirmar serenity_connection_test no GA4. Depois conferir uma compra real aprovada, sua fila, `purchase` e valor, sem gerar cobrança apenas para teste. Preview não envia eventos.

## Google Ads

O código não altera a conta do Ads. Após validar `purchase` no GA4, conferir o vínculo dessa propriedade com a conta de Ads e a marcação automática de cliques. A ação **purchase importada desse GA4** deve ser a compra principal; a ação direta “Site novo Purchase” deve ficar secundária para não somar a mesma venda em duas ações principais. A deduplicação por transaction_id não elimina duplicação entre ações distintas.

Marcar/importar o evento padrão `add_to_cart` do GA4 como ação secundária para acompanhar o funil. Abertura do carrinho é `view_cart`, um evento diferente. Não transformar adição ou visita ao carrinho em meta principal de compra da campanha.

Conferir no fluxo GA4 o ajuste de pageviews por histórico do navegador: o site envia page_view explicitamente em navegação SPA; desativar a captura adicional de histórico se estiver habilitada, para evitar pageviews duplicados. Essa opção não altera os eventos de comércio explícitos.

## Limites e verificação

Sem a tag inicial/consentimento/identificadores, uma compra antiga não recebe origem inventada retroativamente. Cookies bloqueados, janelas de atribuição, aprovações tardias e regras do Google podem limitar atribuição. Eventos anteriores a 71 horas não são enviados pelo worker para não ultrapassar a janela de backdating do protocolo. Compras do site e conversões atribuídas ao Google Ads não são números necessariamente iguais. Não foi acessada a conta do Google nem realizado envio real nesta sessão; instalação SQL, segredo, agendamento e recebimento real permanecem etapas de configuração/validação.

Testes novos exercitam contexto e remoção de dados extras, quantidades de carrinho, hidratação, preço canônico, consentimento negado, payload e centavos, leases/retentativas, isolamento da compra e fila no banco com aprovação real das funções locais. Regressão, TypeScript, lint e build com catálogo fictício são registrados na entrega.

## Verificação desta atualização

A regressão direcionada passou em 11 arquivos de testes de mensuração, captura, painel, fila, cron e pagamentos. TypeScript e lint passaram. Os testes executam a aprovação nas funções SQL locais, verificam fila única por compra, proteção das tabelas e isolamento de falhas de telemetria. Não comprovam recebimento real no Google.

O painel `/admin/mensuracao` informa ambiente, chave configurada sem revelar seu valor, ativação do servidor e acesso à fila. Também confere quais das últimas 20 compras pagas do site não têm contexto de navegação capturado. A ausência de contexto não significa que uma compra seja falsa ou que não tenha sido registrada pelo antigo evento direto do Ads.

O usuário confirmou por imagem que SERENITY_GA4_API_SECRET está cadastrada em Production. O valor não foi acessado nem validado. Instalação dos SQLs, ativação de SERENITY_GA4_SERVER_ENABLED, deploy, execução do teste no painel e confirmação no GA4/Google Ads ainda precisam de conferência. O envio pelo servidor fica desativado até a configuração explícita. A conversão direta existente do Ads foi preservada; ao importar purchase do GA4, deve haver só uma ação de compra principal.
