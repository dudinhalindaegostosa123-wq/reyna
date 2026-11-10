# Auditoria da Lunarity — 10/11/2026

## Resultado

A busca administrativa foi corrigida no commit `a326747`: a API rejeitava a
ordenacao por `products.created_at`, embora a consulta SQL equivalente funcionasse.
A listagem agora ordena por nome e ID, ambos presentes na selecao. Busca por
palavras, situacao e paginacao foram preservadas. Nao exige novo SQL.

Foram revisados o codigo, os testes e os fluxos locais. Isso nao equivale a uma
certificacao de que todos os modulos estejam instalados ou configurados no
Supabase/Vercel de producao.

## Correcoes desta varredura

| Problema | Comportamento resultante |
| --- | --- |
| Busca/lista dependia da ordenacao rejeitada pela API | Ordenacao por nome e ID, sem pedir `created_at` |
| Link Essenciais retornava 404 quando nao havia produtos dessa categoria | Categoria abre com estado vazio e preserva o link da home |
| Cabecalho do checkout anunciava Mercado Pago apesar da integracao Asaas ainda pendente | Texto neutro de finalizacao do pedido; nenhum provedor foi ativado |
| Dois testes de reposicao dependiam do remetente antigo removido | Fixture usa remetente ficticio explicito; notificacoes e tratamento de falhas SMTP voltaram a ser verificados |

Os testes de reposicao usam transporte simulado. A correcao da fixture nao
configura nem envia e-mails reais.

## Verificacao executada

| Verificacao | Resultado |
| --- | --- |
| Suite JavaScript/TypeScript/PostgreSQL local | 411 passaram, 0 falhas |
| Scripts Python de importacao e configuracao | 27 passaram, 0 falhas |
| Build de producao | Aprovado |
| Links internos literais comparados com 78 rotas/arquivos | Nenhum destino inexistente encontrado |
| Chromium, 25 paginas/fluxos publicos e login | Sem 4xx/5xx, erro generico, excecao de navegador ou rolagem horizontal apos as correcoes |
| Painel autenticado com API de teste | Busca sem acento, abertura e alteracao de campos do editor aprovadas |
| Regressao do erro 42703 | API de teste rejeita qualquer ordenacao por `created_at`; busca e editor continuam abrindo |
| Painel no celular | Menu abre, navega e fecha sem rolagem horizontal |
| Visitante sem sessao em `/admin/produtos` | Redirecionado ao login |

As paginas visitadas incluem home; catalogo completo; Conch; Essenciais; Orelha;
Nariz; Boca; Intimos; busca; produto; materiais e suas quatro paginas; simulador
auricular; projetos prontos; carrinho; checkout; ajuda; entrada, cadastro e
recuperacao da conta; acompanhamento; e login administrativo.

O acesso direto ao dominio publicado foi bloqueado pelo proxy do ambiente. Os
testes de navegador usaram build de producao com dados e autenticacao simulados
localmente. Fontes foram servidas localmente com as mesmas familias tipograficas.
As fotos de produto da fixture foram substituidas por arquivo local; a presenca
de todas as fotos copiadas no Supabase precisa ser conferida em producao.

## Pendencias encontradas

| Prioridade | Area | Evidencia e proxima acao |
| --- | --- | --- |
| Alta | Dependencias | `npm audit --omit=dev` apontou alertas nos quatro pacotes abaixo. Preparar atualizacao com verificacao de compatibilidade; nao aplicar uma troca grande de framework sem exercitar os fluxos |
| Alta | Pedidos e clientes administrativos | Logs enviados mostram `ADMIN_SALES_QUERY` e `ADMIN_CUSTOMERS_QUERY`. Esses modulos dependem de estruturas que a instalacao inicial da vitrine nao inclui. Instalar/validar suas dependencias e conferir os Runtime Logs |
| Alta para abertura das vendas | Pagamento | Logs mostram `MP_ENVIRONMENT_REQUIRED` e RPC de checkout ausente (`PGRST202`). Asaas ainda nao foi conectado ao checkout; a configuracao foi adiada. A pagina local apresenta “Pagamento em configuracao” |
| Alta para abertura das vendas | Frete | Melhor Envio e dados finais da embalagem continuam pendentes de verificacao/configuracao |
| Media | E-mails e contatos | Remetente, SMTP e contatos proprios ainda precisam ser configurados. Nao reutilizar o remetente da loja antiga |
| Validacao final | Ambiente publicado | Conferir busca, editor, filtros, fotos reais e fluxos administrativos apos os deploys e SQLs ja aplicados |

### Dependencias com alertas

| Pacote instalado | Severidade agregada informada pelo npm |
| --- | --- |
| Next.js 14.2.5 | Critica |
| Nodemailer 7.0.12 | Alta |
| PostCSS 8.4.20 e dependencias do framework | Alta |
| Sharp 0.34.5 | Alta |

Exemplos dos avisos registrados:

- [Next.js: bypass de autorizacao no middleware](https://github.com/advisories/GHSA-f82v-jwr5-mffw).
- [Sharp: vulnerabilidades em libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj).
- [PostCSS: leitura de arquivos em source maps](https://github.com/advisories/GHSA-6g55-p6wh-862q).

O relatorio de pacotes identifica versoes afetadas; nao prova exploracao no
site. Nenhuma atualizacao de dependencias foi aplicada nesta varredura. As
pendencias acima impedem tratar a loja como pronta para receber vendas, mesmo
com o catalogo e os testes locais funcionando.
