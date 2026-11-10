# Consultas da vitrine com erro 57014

Os Runtime Logs mostraram erros 500 com SQLSTATE 57014 e timeouts ao ler
`store_catalog`. Uma consulta de apenas um produto funcionou. Isso indica
cancelamento das consultas maiores; nao confirma que a transferencia de fotos
seja a causa.

Executar `02-performance-vitrine.sql` no SQL Editor do Supabase novo. O arquivo
adiciona indices para localizar variacoes ativas, a foto de capa e promocoes de
cada produto. Atualiza estatisticas do planejador e pode ser repetido. Nao muda
linhas, precos, estoque, regras de acesso ou arquivos. A criacao dos indices pode
aguardar gravacoes em andamento e segurar novas gravacoes brevemente.

A instalacao inicial da vitrine preservava as chaves primarias e unicas, mas
nao incluia esses indices de consulta. Em PostgreSQL local via PGlite, com dados
sinteticos de 1.750 produtos, a consulta ordenada de quatro produtos caiu de
1.229 ms para 83 ms. Os tempos sao locais, nao uma medicao de producao.

Depois de executar, aguardar cerca de um minuto e recarregar a loja para renovar
o cache. Se o erro persistir, conferir o novo Runtime Log e o tempo da consulta
ordenada no banco. Nao aumentar o timeout nem desativar seguranca como substituto
para investigar consultas ainda lentas. Os erros ADMIN_SALES_QUERY e
ADMIN_CUSTOMERS_QUERY sao modulos separados: o banco inicial cobre a vitrine.
