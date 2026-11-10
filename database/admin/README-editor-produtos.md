# Editor e busca de produtos

Executar `07-editor-produtos.sql` no SQL Editor do Supabase novo. O script instala
somente as dependencias do editor de produtos que nao estavam na instalacao da
vitrine. Nao migra novamente o catalogo nem altera os produtos ao ser executado.
Pode ser repetido. Nao e necessario reinstalar os indices de desempenho.

Sao adicionadas as tabelas privadas de fornecedor/custo e comprovantes de upload,
as quatro funcoes do editor existente e uma busca privada por palavras. As funcoes
foram recuperadas da definicao do projeto fornecida durante a migracao. Sua
execucao fica restrita ao service_role; login confirmado e UID autorizado
continuam sendo exigidos pelo servidor da loja. Nao adicionar politicas de
gravacao publica nem enviar chaves pelo chat.

O salvamento verifica a versao do produto dentro da transacao e valida o dono
das variacoes e das novas fotos. O teste em PostgreSQL cobre leitura, alteracao,
preservacao das fotos, tentativa de versao antiga, rollback de upload invalido,
criacao de rascunho e bloqueio dos papeis anon/authenticated.

A busca passa a aceitar palavras em qualquer ordem e acentos opcionais:
`titanio flor` encontra `Argola Flor Titânio`. Nome, SKU e identificador da
importacao participam da busca. Situacao, totais e paginacao continuam aplicados.
Os parametros sao enviados separadamente; texto digitado nao vira codigo SQL.

O resumo de reservas e opcional no editor quando sua visao nao estiver instalada;
o painel avisa sua ausencia e conserva os campos de quantidade cadastrada. Nao
inventa valores reservados. Este instalador nao ativa pagamentos nem os demais
modulos administrativos de pedidos e clientes.

O menu foi organizado em Dia a dia, Catalogo, Loja e promocoes, Configuracoes e
Historico. Visao geral, pedidos, produtos e clientes aparecem primeiro; o
historico da loja antiga fica por ultimo. Os destinos existentes foram mantidos,
assim como o destaque da pagina ativa e o menu adaptado para celular.

O servidor rejeita uma chave Publishable/anon em SUPABASE_SECRET_KEY antes de
consultar dados privados. Chaves JWT antigas devem declarar service_role e, se
trouxerem a referencia do projeto, corresponder a SUPABASE_URL. Essa verificacao
de formato nao substitui a validacao da chave pelo Supabase. A tela de configuracao
continua restrita a usuarios confirmados e autorizados. Nenhum valor de chave e
exibido. As falhas de lista, busca, editor e estoque mostram apenas codigos
SQLSTATE/PostgREST e a etapa afetada; mensagens e detalhes do banco nao vao para
o navegador. Logs ADMIN_DATABASE_FAILURE seguem a mesma regra.
