# Links antigos do WooCommerce

Redirecionamento HTTP 301 em `/product/[slug]` para a URL atual consultada por `woo_id` no catálogo público. Não depende de sessão, checkout ou banco privado. O domínio de destino é fixo.

Primeiro mapeamento confirmado: `topo-estrela-titanio` → produto Woo 3429 (TN856). `attribute_tamanho=M` é resolvido nos atributos atuais e leva à variante 3431. Opções desconhecidas, combinações ambíguas, variantes desabilitadas ou produtos removidos não redirecionam para outra joia: retornam 404. Indisponibilidade do banco retorna 503 para não criar um falso redirecionamento permanente. Sem atributos, abre a página pai. Não copia parâmetros antigos arbitrários ao destino.

A tabela de slugs confirmados é `src/lib/legacy-product-links.ts`. O CSV original `produtos.csv` tem IDs, pais e atributos, mas **não tem post_name/URL de origem**. Só o exemplo comprovado foi ativado; isso não corrige automaticamente todos os produtos reprovados.

Para ampliar, no **phpMyAdmin da Hostinger, banco WordPress antigo** (não Supabase), executar:

```sql
SELECT ID AS produto_antigo,
       post_name AS slug_antigo,
       post_status AS situacao
FROM wp_posts
WHERE post_type = 'product'
  AND post_name <> ''
ORDER BY ID;
```

Exportar o resultado inteiro em CSV, com cabeçalhos. Nenhum dado de clientes ou senha é necessário. Conferir IDs contra o CSV e o catálogo atual; rejeitar slugs duplicados/ambíguos e registros excluídos antes de ampliar a tabela. Não gerar slugs a partir de nomes comerciais.

Depois de deploy Ready, verificar a URL antiga com `curl -I` (trailing slash pode adicionar a normalização do Next antes do 301) e seguir o destino. No exemplo M, esperar `/produto/importado-3429?variacao=3431` se o slug atual permanecer o mesmo. Os testes locais cobrem atributos, resolução atual, 301, 404 e 503. A resposta HTTP em produção ainda precisa ser validada; o ambiente não tem acesso público liberado ao domínio.

Os redirects ajudam o Google e visitantes de links antigos, mas não garantem aprovação imediata no Merchant. Manter o feed novo como origem canônica e a revisão atual em andamento.

## Ampliação com exportação recebida em 30/10/2026

O arquivo `wp_posts.csv` enviado contém 1.758 registros: 1.741 publicados, 9 rascunhos e 8 na lixeira. Todos os publicados correspondem a produtos pais publicados no CSV original; não há slugs publicados duplicados. Foram adicionadas 1.741 correspondências de slug para ID Woo (inclui a já conhecida TN856). Os 17 não publicados foram excluídos. O arquivo não inclui dados pessoais e não foi necessário consultar clientes ou pedidos.

SHA256 da exportação: `f6c8b1c5ab65f9cf85f6421537482e2126119d05ed0316260eb5c30f1fe3de8f`.

Geração reproduzível: `python3 scripts/build-legacy-product-links.py /caminho/wp_posts.csv`. O gerador aborta diante de slugs ambíguos, IDs desconhecidos ou correspondência não publicada. O runtime continua conferindo a existência do produto e a variante no catálogo atual; o arquivo histórico não garante que todos os itens ainda estejam ativos hoje. Variantes não reconhecidas não são direcionadas a uma medida arbitrária. Sem correspondência segura, o 404 permanece. Isso não altera preços, estoque, checkout nem a fonte Merchant.

Após o deploy Ready, testar amostras das URLs antigas e o parâmetro de tamanho. A aprovação depende da nova visita do Google; não é instantânea. Nenhum SQL precisa ser executado no Supabase.
