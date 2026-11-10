# E-mails da Serenity — configuração de produção

Remetente escolhido: **contato@serenitypiercings.com.br**, caixa já existente na Hostinger.
Não colocar a senha no GitHub, no SQL, no navegador público ou no chat.

Há dois pontos de configuração: Supabase envia mensagens de acesso; Vercel envia mensagens dos pedidos. Ambos podem usar a mesma caixa SMTP. Configurar um não configura o outro.

## 1. Supabase: confirmação e recuperação de senha

Em Authentication → Email / SMTP Settings (o nome do menu pode variar), habilitar Custom SMTP:

| Campo | Valor |
|---|---|
| Sender email | contato@serenitypiercings.com.br |
| Sender name | Serenity Piercings |
| Host | smtp.hostinger.com |
| Port | 465 |
| Username | contato@serenitypiercings.com.br |
| Password | Senha dessa caixa de e-mail na Hostinger — não a senha do painel Hostinger |

SMTP usa TLS; não desabilitar validação de certificado. Se o painel tiver um campo de intervalo mínimo entre mensagens, manter pelo menos 60 segundos. Os limites de envio do Supabase e da Hostinger continuam aplicáveis.

Em Authentication → URL Configuration:

- Site URL: `https://serenitypiercings.com.br`
- Adicionar às Redirect URLs:
  - `https://serenitypiercings.com.br/minha-conta/confirmar`
  - `https://serenitypiercings.com.br/minha-conta/recuperar/confirmar`
- Manter confirmação de e-mail habilitada.

### Template: Confirm signup

Assunto: **Confirme seu cadastro · Serenity Piercings**

```html
<h2>Bem-vinda à Serenity Piercings</h2>
<p>Confirme seu e-mail para acessar sua conta e acompanhar suas compras.</p>
<p><a href="{{ .SiteURL }}/minha-conta/confirmar?token_hash={{ .TokenHash }}&amp;type=email">Confirmar meu e-mail</a></p>
<p>Se você não solicitou este cadastro, ignore esta mensagem.</p>
<p>Serenity Piercings · Sua beleza em cada detalhe.</p>
```

### Template: Reset password

Assunto: **Recupere seu acesso · Serenity Piercings**

```html
<h2>Vamos recuperar seu acesso?</h2>
<p>Recebemos uma solicitação para criar uma nova senha da sua conta Serenity.</p>
<p><a href="{{ .SiteURL }}/minha-conta/recuperar/confirmar?token_hash={{ .TokenHash }}&amp;type=recovery">Criar nova senha</a></p>
<p>Se você não solicitou esta alteração, ignore esta mensagem. Sua senha permanece a mesma.</p>
<p>Serenity Piercings</p>
```

Os templates usam token_hash para funcionar também quando o e-mail é aberto em outro navegador. Não trocar pelo link de confirmação antigo. Os tokens são verificados no servidor, não registrados em logs. A nova senha exige sessão de recuperação válida e cookie HttpOnly de 15 minutos; a ação verifica o usuário novamente. A troca encerra as sessões via Supabase. Solicitações para contas desconhecidas recebem mensagem genérica.

## 2. Fila de avisos dos pedidos

Executar no SQL Editor do Supabase **o conteúdo completo de `database/email/01-notificacoes.sql`**. Instalação transacional e repetível; não substitui as funções de pagamento e não faz backfill de pedidos antigos.

São registrados eventos de pedidos do site vinculados a checkout **production**:

- Pagamento aprovado/pedido pago: “Parabéns pela compra!” para o cliente, com itens, opções salvas e total efetivamente pago.
- Após instalar `database/email/02-aviso-nova-compra.sql`: “UHUL, MAIS UMA COMPRA!” para contato@serenitypiercings.com.br, com cliente, itens, opções e acesso ao pedido no painel administrativo.
- Postagem: somente após confirmação manual ou status posted/delivered da etiqueta atual. Comprar ou gerar etiqueta não conta como postagem.
- Entrega: somente quando o rastreamento atual registra delivered.

A fila só guarda dados necessários ao aviso: destinatário, nome, número, itens, total e rastreio. Não copia endereço, CPF, fornecedor ou custo. Não é enviada confirmação de compra para tentativas pendentes ou pagamentos de teste.

Na Vercel → Settings → Environment Variables, cadastrar **somente Production**:

| Variável | Valor |
|---|---|
| `SMTP_USER` | `contato@serenitypiercings.com.br` |
| `SMTP_PASSWORD` | Senha da caixa de e-mail, marcar como Sensitive |
| `SERENITY_EMAIL_ENABLED` | `true` |
| `SERENITY_SITE_URL` | `https://serenitypiercings.com.br` |

Manter `SUPABASE_URL`, `SUPABASE_SECRET_KEY` e `CRON_SECRET` já usados pelo projeto. CRON_SECRET deve ter pelo menos 32 caracteres. Não trocar secrets existentes de outras integrações. Fazer **redeploy Production** após cadastrar variáveis.

SMTP dos pedidos está fixo em smtp.hostinger.com:465 com TLS. Não usa senha de conta pessoal, não permite mudar o destinatário do teste para um e-mail arbitrário. Preview nunca envia avisos.

## 3. Teste e acompanhamento

1. Após Ready, abrir `/admin/emails` (também está no menu E-mails).
2. Conferir Fila instalada, Credenciais preenchidas e Envio ativado.
3. Clicar **Testar envio para o e-mail da loja**. A mensagem vai somente para contato@serenitypiercings.com.br. Conferir inbox e spam.
4. Em Minha conta → Esqueci minha senha, usar uma conta de teste própria existente, receber o link, alterar a senha e entrar novamente. Reabrir o link usado deve falhar.
5. Cadastrar outra conta própria para conferir confirmação de e-mail e retorno correto.
6. Na próxima compra real acompanhada, conferir um único aviso com o total pago; eventos repetidos não devem gerar outro recibo.
7. Postar um pedido real e conferir o aviso; só gerar etiqueta não deve enviar esse aviso.

Não existe envio retroativo automático. A instalação começa a registrar eventos novos, mesmo se a Vercel ainda estiver com envio desativado. A entrega real e a reputação do remetente dependem das configurações da Hostinger/DNS; preservar MX, SPF, DKIM e DMARC existentes. Conferir autenticação na mensagem recebida e caixa de spam.

## Comportamento em falhas

- A fila é gravada na mesma transação do evento. SMTP nunca roda dentro do banco nem altera pagamento/estoque.
- Worker chamado após pagamento aprovado, postagem manual e sincronização de rastreio quando há tempo disponível. Sua falha não desfaz o evento confirmado.
- Identificação única por pedido/tipo evita fila duplicada. Claim com lease evita dois workers concorrentes no mesmo aviso.
- Erros SMTP com rejeição conhecida ou falha anterior à conexão retornam à fila com intervalo de 15 minutos, até 5 tentativas.
- Desconexão ambígua após envio ou queda do worker deixa **Conferir envio**; não repetimos automaticamente uma mensagem que pode ter sido aceita. Message-ID estável ajuda a conferência, mas SMTP não oferece garantia de exatamente uma entrega.
- O cron de pagamentos existente roda às **12:15 UTC (09:15 de Brasília)** diariamente e aproveita o tempo disponível para processar até 3 avisos pendentes. Não adicionamos um terceiro agendamento ao plano Hobby. Os avisos dos eventos são tentados no próprio fluxo. O endpoint protegido `/api/cron/emails` também pode ser chamado por um agendador externo autorizado. A tela oferece processamento manual de pendentes sem reenviar os enviados ou incertos. Para volume maior ou retries em minutos, será preciso um agendador mais frequente/serviço de fila.
- “Aceito pelo servidor” não significa confirmação de chegada ou leitura. Não há tracking pixel em e-mails.
- Para pausar envios: `SERENITY_EMAIL_ENABLED=false` em Production e redeploy; a fila é preservada. Não apagar notificações em conferência sem auditoria.

## Verificação local executável

```sh
node --test tests/email.test.cjs tests/email-database.test.mjs
```

## Aviso de nova compra para o dono — atualização de 26/10/2026

1. Aguardar o deploy que contém os templates `owner_paid` ficar Ready em Production.
2. Se a fila ainda não foi instalada, executar primeiro `database/email/01-notificacoes.sql` no Supabase.
3. Executar `database/email/02-aviso-nova-compra.sql` inteiro no SQL Editor. Pode repetir a atualização 02; não reaplicar a 01 depois da 02, pois a função de enfileiramento da 01 é anterior ao aviso à loja.
4. Conferir as variáveis SMTP de Production descritas acima, redeploy se necessário e testar por `/admin/emails`.

A atualização não envia mensagens retroativas. Cada compra nova aprovada tem dois registros independentes: cliente e loja. A falha de um destinatário não causa reenvio do que já foi aceito. Ambos são tentados no fluxo do pagamento, respeitando o limite de tempo do worker; pendentes seguem para a rotina existente ou processamento pelo painel.

O aviso à loja vai para **contato@serenitypiercings.com.br**. A cópia do cliente vai apenas para o e-mail registrado na compra. O link administrativo exige login de administrador. As especificações vêm do retrato do pedido; não inferimos medidas ou esterilização ausentes usando o catálogo atual. “Esterilização solicitada” registra a escolha, sem afirmar que o serviço já foi executado.

E-mails de postagem e entrega continuam vinculados aos eventos reais da etiqueta atual. O sistema não notifica cada alteração manual de status, cancelamento ou estorno nesta versão. Pedidos históricos importados permanecem fora desses disparos.

## Solicitações e aprovações de atacado — atualização de 26/10/2026

Após o deploy com os templates de atacado ficar Ready, executar **`database/email/03-avisos-atacado.sql` inteiro** no Supabase. Requer as instalações 01 e 02. Pode repetir a 03; não reaplicar as anteriores depois dela. Usa o SMTP já validado, sem novas variáveis ou senha.

- Nova solicitação: entrada real em `pending` na conta gera aviso para **contato@serenitypiercings.com.br**, com nome, e-mail confirmado e link para `/admin/atacado`.
- O cadastro de atacado só se conclui após a confirmação do e-mail. O aviso à loja acompanha essa conclusão, não a tentativa de cadastro sem confirmação.
- Aprovação: transição real para `approved` gera “Seu cadastro de atacado foi aprovado!” para o e-mail confirmado da conta, com link para Minha conta. Não fixa percentuais nem mínimos que possam mudar depois.
- Salvar novamente o mesmo estado não cria outro aviso. Suspender não gera e-mail nesta versão; uma aprovação pendente de envio é bloqueada se a conta estiver suspensa, sem e-mail confirmado ou com destinatário alterado. Uma nova aprovação posterior tem evento próprio, identificado pela versão da conta.
- A fila é gravada na transação do cadastro/aprovação, com tentativas de SMTP depois do sucesso da operação. Falhas de e-mail não exigem cadastrar ou aprovar novamente. O worker compartilha a fila existente, com processamento de pendentes pelo painel/cron e as mesmas regras de conferência para entrega incerta.
- Os avisos aparecem em Administração → E-mails pelo nome do cadastro e tipo, sem número de pedido. Não existe envio retroativo para solicitações ou aprovações anteriores à instalação.
- O conteúdo não copia documento, endereço, senha ou tokens. Os links exigem o login correspondente. As permissões da fila continuam restritas a service_role; não expor a fila ao navegador.

Validação: `node --test tests/email.test.cjs tests/email-database.test.mjs tests/wholesale-email-database.test.mjs`.

## Envios do histórico e consulta automática frequente — 26/10/2026

Causa corrigida: o cron anterior consultava somente `serenity_label_*` dos pedidos atuais e a fila exigia um pedido novo de produção. Etiquetas dos pedidos antigos, mesmo compradas no site novo, estavam em `serenity_legacy_label_*_v1`, fora da consulta e da fila.

### Ativação

1. Aguardar Ready do deploy desta correção. Executar `database/email/04-rastreio-emails-historico.sql` **completo** no Supabase. Requer 01, 02 e 03 já instalados; não reaplicar os anteriores depois. Instalação transacional e repetível, sem compras, sem alterar vendas, sem gerar recibos retroativos.
2. Em Administração → E-mails, clicar **Atualizar rastreio e avisos** para consultar um lote de etiquetas existentes. Cada execução consulta até seis envios atuais e dois antigos, dentro do limite de tempo. A resposta do Melhor Envio é verificada antes de atualizar o painel. O provedor precisa ter registrado `posted` ou `delivered`; geração ou compra de etiqueta não é postagem.
3. Para automatizar a cada cinco minutos, abrir o Vault do Supabase (Database → Vault, ou pesquisar Vault no painel). Criar um segredo chamado **`serenity_cron_secret`**, copiando o valor **já existente** de `CRON_SECRET` de Production na Vercel. Não enviar esse valor no chat, em prints ou no repositório.
4. Executar `database/email/05-agendamento-logistica.sql` completo no Supabase. Instala pg_cron e pg_net e cria dois jobs de nomes fixos; repetir atualiza o agendamento, sem multiplicá-lo. O script recusa configurar se o segredo no Vault estiver ausente ou curto. A senha SMTP não muda.
5. Conferir em Supabase → Cron que `serenity-logistica-5-minutos` e `serenity-emails-5-minutos` estão ativos. Conferir os resultados HTTP em `net._http_response`/histórico do Cron sem copiar headers/segredos. HTTP 401 significa que o segredo do Vault diverge do CRON_SECRET da Vercel; 503 indica configuração, banco ou provedor indisponível. HTTP 200 não comprova que a transportadora registrou uma mudança nem que o e-mail chegou à caixa de entrada.

O Vercel Hobby mantém o agendamento diário existente; o agendamento frequente roda no Supabase. Sem executar 05, **não existe atualização a cada cinco minutos**: permanece a rotina diária e o botão manual. Não mudar o vercel.json para um cron de cinco minutos no Hobby, pois isso impede o deploy. O projeto Supabase precisa estar ativo e com as extensões disponíveis.

### Comportamento e limites

- Consulta somente etiquetas existentes com preparação/UUID/operação correspondentes à compra. Usa info, nunca buy/generate. Vínculos importados têm destinatário/CEP/serviço conferidos; preparações novas têm identificação/operação/serviço conferidos.
- O resultado atualiza carrier_status da compra da etiqueta e a tabela privada de rastreio do histórico. A central de etiquetas passa a reconhecer postagem/entrega; a ficha antiga e Minha conta exibem o envio atual separadamente da situação da venda antiga.
- Postagem, entrega, entrega não concluída, pausa e suspensão geram avisos distintos. Cada tipo é enviado uma vez por pedido/envio logístico; consultar novamente o mesmo status não repete o e-mail. Mudanças de localização intermediárias que não alteram esses estados não geram aviso. As ocorrências de problema também passam a ser notificadas nos pedidos atuais após instalar 04.
- Cada postagem/entrega é um evento único por envio logístico. A primeira consulta pode avisar uma postagem que já ocorreu na transportadora, atendendo aos envios existentes; não reenvia confirmação de compra antiga. Sem e-mail válido no retrato do destinatário não há envio; é necessário conferir o cadastro real.
- Cancelamentos, estornos, cadastros em conferência ou vínculos substituídos não notificam uma aprovação de envio indevida. Respostas antigas não regridem uma postagem já conhecida. Falhas preservam o status confirmado anterior e voltam à consulta depois.
- As leases e os locks permitem rodar cron diário, cron frequente e botão manual sem duplicar avisos. Falhas de entrega SMTP incerta continuam em conferência, sem reenvio automático.
- Em lotes grandes, a atualização pode levar mais de um ciclo. O envio de e-mails processa até dez por execução e respeita o orçamento de tempo. A frequência de consulta não garante entrega em cinco minutos: depende do registro da transportadora, disponibilidade dos serviços, fila e SMTP.
- Leitura do rastreio pelo cliente usa RPC filtrado pelo usuário autenticado, e-mail confirmado e titularidade do pedido. As tabelas privadas e as funções de escrita não são acessíveis a anon/authenticated.

Validação local: `node --test tests/legacy-tracking-email-database.test.mjs tests/legacy-tracking-worker.test.cjs tests/email.test.cjs`. pg_cron/pg_net/Vault são serviços hospedados: a sintaxe do comando de agendamento é conferida com mocks locais, mas a chamada real e a entrega SMTP dependem da instalação no Supabase/Production.
