# Checkout de visitante — implementação para homologação

**Estado:** preparado na branch local `feat/checkout-visitante`, sem push, merge ou deploy de produção. Não executar a migração na produção antes da validação. O usuário esclareceu que a configuração da homologação ainda não foi concluída. Os testes locais foram executados; a validação real com os provedores permanece pendente.

## Auditoria

O checkout V2 já recebe `p_user = null` e a conclusão original cria um cliente a partir do snapshot para visitantes. A obrigatoriedade estava na página `/checkout`, na ação que cria a sessão e nas ações de Pix, cartão e escolha do método. O acesso ao pagamento já é protegido por cookie HttpOnly e hash validado no banco; o UUID da URL sozinho não autoriza pagamento nem consulta.

O serviço atual usa SMTP Hostinger (`contato@serenitypiercings.com.br`) e a fila `serenity_email_outbox_v1`. Existem avisos de aprovação, postagem, entrega, atacado e histórico; a alteração os reutiliza. O rastreamento usa as etiquetas atualmente vinculadas ao pedido e os estados de transporte confirmados. Gerar uma etiqueta não significa postagem.

O sistema registra a venda financeira depois da aprovação efetiva. Essa regra foi mantida: o recebimento da seleção reserva o número e envia um aviso sem afirmar que houve pagamento; a aprovação cria a venda com o mesmo número. Pedidos pendentes/recusados não são contados como pagos. A migração não altera pedidos, preços ou vínculos antigos e não envia mensagens retroativas.

## Fluxo e comportamento

Produto → carrinho → contato/e-mail/CPF/endereço → frete → pagamento → confirmação. Login e cadastro são opcionais. E-mail e dados necessários continuam validados; não há senha ou confirmação de e-mail antes de comprar. Uma sessão expirada ou não confirmada pode comprar no varejo, sem ganhar condições de atacado. Contas válidas e condições de atacado preservam o fluxo existente.

O cliente paga na tela atual de pagamento. Pix continua sendo consultado automaticamente. Não há redirecionamento automático para e-mail, cadastro ou acompanhamento. O aviso de recebimento é enviado pela fila em segundo plano; o checkout não espera SMTP. No cartão, a autenticação exigida pelo emissor continua no componente seguro já existente.

| Evento | Momento | O que recebe o cliente |
| --- | --- | --- |
| Recebimento | Checkout válido criado, antes da cobrança | Número reservado, resumo, total naquele momento e link de acompanhamento; confirmação de pagamento é separada |
| Aprovação | Confirmação validada pelo Mercado Pago e pedido pago registrado | Número definitivo (o mesmo), valor efetivamente pago e resumo |
| Envio | Postagem confirmada no fluxo atual | Aviso e rastreio, quando disponível |
| Entrega | Status confiável de entrega do transporte | Confirmação de entrega |

A seleção de Pix pode reduzir o valor depois do primeiro e-mail; o aviso explica isso, e a aprovação usa o valor efetivamente pago. Recebimento e aprovação são eventos separados. A compra do dono continua gerando o aviso próprio já existente.

## Acompanhamento e segurança

- `/acompanhar` é uma página privada por capacidade, sem login. Exibe apenas número, data, total, status e rastreio. Não exibe nome, e-mail, telefone, documento, endereço, ID do pagamento ou UUID interno.
- Link por e-mail: `/acompanhar#<capacidade>`. O fragmento não é enviado no GET. A página o remove antes de consultar o servidor por POST. A capacidade é trocada por cookie HttpOnly, Secure em produção, SameSite=Lax e restrito ao caminho de acompanhamento.
- O banco guarda apenas SHA-256 da capacidade. Ela é derivada por HMAC de uma chave exclusiva do servidor e do checkout, com finalidade diferente do cookie de pagamento. Acompanhamento não permite cobrar ou alterar pedidos.
- A capacidade vale 180 dias, pode ser revogada pela coluna privada `revoked` e não é renovada por consultas. O cookie dura 30 dias, subordinado à validade/revogação do banco. Quem perder o link deve usar o e-mail original ou falar com a loja; não há busca pública por e-mail/CPF/número do pedido.
- Google Ads e os componentes gerais de terceiros da loja não são carregados nessa rota. Respostas usam `private, no-store`, `noindex, nofollow` e `Referrer-Policy: no-referrer`.
- Tabela/RPCs novos não podem ser consultados pelo papel `anon` ou `authenticated`; somente o servidor usa a chave privada. Nenhuma permissão pública foi ampliada.
- Só o envio atual, com pedido/etiqueta/operação correspondentes e estado confirmado, libera rastreio. Etiqueta preparada ou vínculo substituído não mostra um rastreio antigo.
- Visitantes não são ligados automaticamente a contas por coincidência de e-mail. Clientes conectados preservam `account_user_id`; também podem usar o link privado do e-mail. Perfil e permissões de atacado não são criados pelo acompanhamento.
- Repetir o checkout ou um webhook não duplica número, recibo, pedido ou aviso. O worker mantém Message-ID estável e encaminha entrega SMTP ambígua para conferência, em vez de repetir cegamente. Isso não promete entrega de 100% dos e-mails nem leitura pelo destinatário.

## Configuração em homologação

1. Usar a aplicação desta branch e **Supabase de teste separado**. Não apontar uma validação de escrita para o banco da loja.
2. O banco precisa ter as migrações atuais da loja: pagamentos Pix/cartão v3/v4, regras comerciais, fila de e-mails 01–04 e rastreamento. Aplicar **somente na homologação**, inteiro, `database/guest-checkout/01-visitante-acompanhamento.sql`. O instalador é repetível e aborta se o contexto Pix/cartão ou os escopos de e-mail não estiverem compatíveis.
3. Configurar no ambiente de teste:
   - `SERENITY_GUEST_CHECKOUT_ENABLED=true` (ausente/false preserva a obrigatoriedade atual para novas compras).
   - `SERENITY_GUEST_TRACKING_SECRET`: chave aleatória exclusiva, de pelo menos 32 caracteres, preferencialmente 32 bytes representados em 64 hexadecimais. Não usar prefixo NEXT_PUBLIC, não reutilizar o CRON_SECRET e não publicar o valor. Guardar a chave de forma estável durante a validade dos links.
   - Credenciais **de teste** do Mercado Pago e a configuração existente para webhooks/URL/segredo do ambiente. Nunca simular aprovação enviando um status pelo navegador.
   - Conexão Supabase correspondente à homologação. SMTP e agendadores seguem a configuração já existente.
4. Verificar a migração por `select public.serenity_guest_checkout_ready_v1();` e confirmar que `serenity_checkout_card_ready_v3()` continua ready. A nova verificação ocorre antes de reservar um novo checkout quando o recurso está habilitado.
5. Preview mantém os bloqueios existentes contra venda real e disparo de e-mails de produção. Pagamentos de teste continuam como aprovação de teste, sem criar uma venda real. Os testes locais exercitam a criação do pedido com fatos de produção sintéticos em banco descartável; não confundir isso com uma compra real no sandbox. Não sobrescrever VERCEL_ENV para contornar essas proteções.

Para gerar a chave privadamente no PowerShell: `[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")`. Não enviar o resultado na conversa.

A fila de e-mails depende do worker/agendador já configurado (`/api/cron/emails`), e o envio depende de SMTP real. Nesta sessão, envio SMTP foi validado por transporte simulado, não por entrega em caixa postal. A configuração atual do worker só envia em produção; homologação externa deve respeitar essa proteção. Não se deve publicar só para testar e-mail sem uma etapa controlada de validação.

## Roteiro de validação externa ainda pendente

- Janela anônima: produto/variação → carrinho → contato válido → frete → pagamento sem tela de login.
- Campo de e-mail inválido e CPF inválido devem impedir continuação; nenhum pedido pago deve existir nesse momento.
- Pix de teste: gerar uma vez, manter a tela aberta e confirmar a atualização automática quando o provedor aprovar. Não abrir e-mail nem criar conta para continuar.
- Cartão: testar aprovação, recusa e, quando aplicável, autenticação 3DS. Recusa não cria compra paga; uma nova tentativa permanece vinculada ao mesmo checkout e número.
- Cliente conectado: repetir com varejo e condições de atacado; não perder o vínculo nem obter desconto de atacado sem autorização.
- Link de acompanhamento: testar em outro navegador, atualizar, revogar e vencer a capacidade. Um link inválido não mostra outro pedido. Não há acesso por número ou e-mail.
- Melhor Envio: conferir postagem/entrega por eventos reais ou fixtures autenticadas de homologação, com vínculo correto. Não comprar uma etiqueta só para testar sem autorização.
- E-mails: validar recebimento, aprovação, envio e entrega, destinatário, número, valor e link; confirmar que repetir o evento não repete os avisos. Entrega SMTP real continua pendente.

## Testes realizados

- Integração SQL/PGlite com as funções reais do repositório: checkout visitante e conectado, número estável, confirmação pendente/aprovada/recusada, nova tentativa após recusa, Pix/cartão, progressivo/cupom/Pix/esterilização, compra sem saldo físico, vínculo de cliente, idempotência e aprovação efetiva.
- Fila: recebimento sem pagamento aprovado, aprovação somente após confirmação, postagem/entrega confiáveis, nenhum dado pessoal extra na fila, mensagens únicas e worker SMTP existente com transporte simulado.
- Segurança: capacidade com segredo dedicado, somente hash salvo, expiração/revogação, papel anônimo sem acesso, saída com campos permitidos, envio substituído oculto, link removido da URL antes do POST, respostas privadas e nenhum login obrigatório no acompanhamento.
- Regressão: 61 arquivos de teste passaram (208 casos na execução completa, além das verificações adicionais posteriores de privacidade). Os testes Python existentes precisaram rodar fora da restrição de subprocessos do sandbox.
- TypeScript e lint passaram. O build Next passou com um catálogo HTTP fictício local, somente leitura. Sem conexão de catálogo configurada, o build anterior falhou na pré-renderização de Orelha/Nariz; o catálogo fictício permitiu validar o build sem consultar a produção. Há avisos de `<img>` em arquivos antigos, fora desta alteração.

**Limite:** não houve compra real/sandbox externa nem entrega real de novos e-mails nesta sessão. O código e SQL foram validados localmente, mas a homologação completa depende do ambiente separado informado pelo usuário. Não houve escrita no Supabase real, merge na main ou publicação Vercel.

## Reversão

Desativar `SERENITY_GUEST_CHECKOUT_ENABLED` impede novas compras como visitante e novos registros de recebimento. Manter a chave, a página privada, a tabela e as funções para visitantes que já compraram; não apagar o acompanhamento ou invalidar links de compradores existentes sem necessidade. Pedidos já criados e seus vínculos permanecem. Não reaplicar migrações antigas de contexto/e-mails por cima desta, pois isso pode substituir os novos metadados/tipos.

## Arquivos
- `database/guest-checkout/01-visitante-acompanhamento.sql`
- `docs/checkout-visitante.md`
- `src/app/acompanhar/GuestTrackingClient.tsx`
- `src/app/acompanhar/actions.ts`
- `src/app/acompanhar/page.tsx`
- `src/app/checkout/actions-v2.ts`
- `src/app/checkout/actions.ts`
- `src/app/checkout/page.tsx`
- `src/app/pagamento/[id]/PixCheckoutV2.tsx`
- `src/app/pagamento/[id]/actions-v2.ts`
- `src/app/pagamento/[id]/card-actions.ts`
- `src/components/analytics/GoogleAdsProvider.tsx`
- `src/components/layout/SiteChrome.tsx`
- `src/lib/checkout-session-server-v2.ts`
- `src/lib/email-template.ts`
- `src/lib/guest-checkout.ts`
- `src/lib/guest-tracking-server.ts`
- `src/lib/order-email-server.ts`
- `src/lib/wholesale-server.ts`
- `src/middleware.ts`
- `tests/checkout-account-required.test.cjs`
- `tests/checkout-payment.test.cjs`
- `tests/collection-ui.test.cjs`
- `tests/customer-checkout-login.test.cjs`
- `tests/email.test.cjs`
- `tests/google-ads-purchase.test.cjs`
- `tests/guest-checkout-database.test.mjs`
- `tests/guest-tracking-security.test.cjs`
- `tests/guest-tracking-ui.test.cjs`
- `tests/helpers/guest-db.mjs`
- `tests/payment-card.test.cjs`
