# Restaurar filtros da loja migrada

Executar `03-restaurar-filtros.sql` no SQL Editor do Supabase novo. A vitrine
inicial usa `serenity_jewelry_filter_cache_v1` para os tipos de joia; a instalacao
inicial criava a tabela, mas nao instalava seu preenchimento e manutencao. Sem
linhas nessa tabela, a view com INNER JOIN deixa as opcoes dos filtros vazias,
enquanto a listagem sem filtros ainda encontra produtos em store_catalog.

O script instala o classificador original recuperado do schema fornecido,
preenche os dados derivados de todos os produtos e instala gatilhos para
atualizar a classificacao em alteracoes de produto/variacao. Nao modifica nomes,
precos, quantidades, categorias cadastradas ou imagens. Pode ser repetido.

A nova view publica `lunarity_catalog_facets_v1` le somente regioes, materiais
e tipos de joia de produtos publicados e visiveis. Evita calcular precos e
galerias para cada opcao de filtro. Rascunhos, custos e dados privados nao sao
expostos. O cache de filtros revalida em 60 segundos e usa a tag catalog,
invalidada pelas alteracoes administrativas. A aplicacao ainda le a view
anterior quando a nova view nao estiver instalada.

As opcoes continuam limitadas as que possuem produtos na categoria e respeitam
os demais filtros selecionados. Nao sao adicionados materiais ou tipos ficticios.
O teste de banco cobre cache inicialmente vazio, reexecucao, edicao de nomes,
alteracoes de atributos e habilitacao de variacoes, e visibilidade publica.
