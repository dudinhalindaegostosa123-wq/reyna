# Migração do WooCommerce: cadastros e histórico

Origem confirmada: WooCommerce HPOS (`woocommerce_custom_orders_table_enabled=yes`).

Foram recebidos CSVs de usuários, pedidos/endereço e itens. Dados pessoais e o SQL com os registros reais ficam no pacote privado da entrega, **fora do GitHub**. Não importar os hashes de senha do WordPress nem executar INSERT direto em auth.users.

## Conteúdo conferido

- 764 clientes, sem e-mails vazios ou duplicados. Os 4 administradores antigos não são migrados como clientes.
- 603 registros de pedidos: 586 são históricos visíveis; 16 na lixeira e 1 rascunho ficam fora da listagem.
- 25 registros de estorno, todos com pedido original presente.
- 2.032 linhas: 1.055 peças, 599 fretes, 175 cupons e 203 taxas.
- Todos os pedidos visíveis têm peças e total compatível com itens/taxas/frete, tolerando no máximo um centavo dos arredondamentos do WooCommerce. Precisão original das linhas preservada.
- Um vínculo divergente entre e-mail do pedido e e-mail do cadastro original fica em conferência. Não é publicado automaticamente para nenhuma conta.

## Instalação

1. Aguardar Ready do commit que adiciona Histórico do site antigo.
2. No SQL Editor do **Supabase**, executar `01-base.sql` do pacote (mesmo conteúdo de `database/legacy/01-base.sql`).
3. Abrir `/admin/historico` e enviar os três CSVs pelo formulário: Cadastros = `wp_users.csv`; Pedidos = `wp_users (1).csv`; Itens = `wp_woocommerce_order_items.csv`. Clicar em **Importar clientes e histórico**. Apenas administrador autorizado em Production pode executar a carga. Limite total dos arquivos: 3 MB. O formulário confere duplicidades, vínculos, datas e valores antes de chamar uma única função transacional.

Alternativa offline: executar o conteúdo completo de `02-importar-dados.sql` do pacote privado. Esse arquivo contém dados pessoais; não colocar no GitHub nem em pasta pública do site. Usar o mesmo conjunto original de arquivos em qualquer método. A versão TypeScript do formulário e o gerador Python foram comparados com o conjunto completo e produzem os mesmos dados.
4. O resultado esperado é: customers=764, orders=586, refunds=25, items=2032, needs_review=1, already_imported=false.
5. Abrir `/admin/historico` pelo menu **Histórico do site antigo** e conferir listagem, clientes e detalhes de pedidos.

A instalação e a carga são transacionais. O mesmo pacote pode ser executado de novo: retorna already_imported=true, sem duplicar. Um pacote diferente com a mesma origem é rejeitado, preservando os dados já carregados. Não usar DELETE/TRUNCATE para contornar uma divergência.

## Acesso dos clientes e ligação com contas existentes

**Os registros importados são cadastros históricos; não são 764 novas sessões ou contas já confirmadas.** As identidades de acesso são criadas apenas quando a pessoa solicita recuperação de senha, com senha aleatória e e-mail não confirmado. Nenhum e-mail é enviado em massa pela importação.

Primeiro terminar a configuração SMTP e dos templates de confirmação/recuperação descrita em `docs/emails.md`. Depois adicionar na Vercel **somente Production**:

```text
SERENITY_LEGACY_ACTIVATION_ENABLED=true
```

Fazer redeploy para aplicar a variável. A criação de acesso antigo é bloqueada em Preview e fica desligada por padrão.

Fluxo para uma pessoa que tinha cadastro no WordPress:

1. Minha conta → Esqueci minha senha.
2. Informar o mesmo e-mail cadastrado no site antigo.
3. Receber o link, validá-lo e definir uma nova senha. A senha antiga não é transferida.
4. Entrar com a nova senha. Se ainda não há perfil no site novo, conferir nome/telefone e informar CPF/CNPJ válido, que não estava no CSV recebido.
5. O perfil inicial é varejo. Não são importadas permissões administrativas nem aprovação de atacado. Uma aprovação atual de atacado permanece preservada.
6. Em Minha conta, a seção **Pedidos do site antigo** apresenta os pedidos, itens, valores, situação original e reembolsos.

Quem já tem conta atual confirmada mantém a senha, o perfil, os pedidos atuais e o acesso de atacado existentes. A migração não altera esses dados. O histórico é vinculado ao visitar Minha conta, somente depois de confirmação de titularidade pelo Supabase.

Compras antigas como visitante cujo e-mail não aparece nos 764 cadastros não criam identidade automaticamente: a pessoa pode criar uma conta normal com o mesmo e-mail, confirmar o endereço e visualizar o histórico correspondente. Casos de e-mail divergente precisam de conferência da equipe.

A associação inicial usa e-mail verificado no banco de autenticação, não e-mail informado em formulário nem metadata editável. Após o vínculo, o histórico pertence ao UUID da conta: trocar ou reutilizar um e-mail não transfere pedidos para outra pessoa. O cliente não tem acesso às tabelas privadas de cadastros e vínculos; RLS restringe pedidos e itens à conta proprietária. Nenhum evento de pagamento/estoque/etiqueta é disparado.

## Operação e limites

- Clientes e pedidos antigos aparecem em `/admin/historico`, separados dos clientes e das vendas operacionais atuais.
- Não somar ao faturamento novo, baixar estoque, reservar produtos, consumir cupons, comprar etiquetas ou enviar recibos retroativos.
- Pedidos antigos pendentes, falhos, reembolsados e em processamento preservam a situação original. “Em processamento no site antigo” não cria uma tarefa nova de fornecedor ou envio; a equipe deve conferir o atendimento que ainda estiver pendente.
- As datas exportadas como GMT são armazenadas em UTC e mostradas no fuso de Brasília.
- A migração não inventa CPF/CNPJ, custo, prazo de entrega, tracking ou confirmação de pagamento faltantes.
- Há paginação de histórico no painel e na conta do cliente, e consulta pelo número antigo no painel.
- Acesso por recuperação depende de SMTP em funcionamento. Sem essa configuração, manter a variável de ativação desligada; os dados históricos podem ser importados e conferidos no painel normalmente.

## Verificação

Foi testada a carga integral em banco isolado com os arquivos reais, incluindo repetição da carga e ausência de gravação em pedidos operacionais. Testes automatizados cobrem RLS, e-mail não confirmado, contas de terceiros, e-mail reutilizado, pedido divergente, importação repetida e ativação sem substituir senha existente.

Para preparar outro pacote privado de forma reproduzível:

```sh
python3 scripts/prepare-legacy-import.py \
  --users /caminho/usuarios.csv \
  --orders /caminho/pedidos.csv \
  --items /caminho/itens.csv \
  --out /caminho/privado/entrega
```

O script só prepara e confere os arquivos. Não contém credenciais e não executa nada no Supabase. Ele rejeita arquivo com user_pass, IDs/e-mails duplicados, itens órfãos e divergências nos valores.
