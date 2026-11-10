# Complemento de contatos para etiquetas antigas

1. Aguarde o deploy da Vercel ficar Ready.
2. Execute `04-contatos-enderecos.sql` no SQL Editor do Supabase.
3. Em Administração → Histórico do site antigo → Recuperar telefones, números e bairros, envie o CSV completo gerado por `../legacy-labels/wordpress/04-exportar-contatos-enderecos.sql`.
4. Reabra o envio, confira os dados, salve o rascunho e consulte o frete novamente.

O arquivo mantém cobrança e entrega separados. Telefones são normalizados sem o prefixo brasileiro +55; números locais com DDD 55 são preservados. Campos adicionais conflitantes ficam vazios. O telefone de cobrança pode completar o de entrega apenas para o mesmo nome de destinatário. Número e bairro nunca são copiados da cobrança para outro endereço.

O complemento fica em uma tabela privada, com RLS e acesso somente de serviço. Não modifica vendas, valores, itens, etiquetas ou rascunhos existentes. Na leitura do formulário, somente campos vazios de um destinatário e endereço correspondentes são completados. Complementos removidos manualmente não são restaurados. Cotações antigas com dados diferentes precisam ser refeitas. Reimportar o mesmo arquivo é idempotente; dados diferentes de uma importação anterior abortam a transação.

Informação ausente ou divergente exige conferência; o sistema não inventa telefone, número ou bairro. Dados pessoais dos CSVs não devem entrar no Git ou nos logs.
