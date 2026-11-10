# Merchant Center: auditoria e migração

## Diagnóstico (29/10/2026)

O relato apresenta 3.391 itens da fonte WooCommerce, 2.210 URLs indisponíveis, 24 imagens promocionais e 19 preços ausentes. Esses números foram fornecidos pelo usuário, não consultados diretamente nesta sessão.

A aplicação Next usa `/produto/[slug]`; nenhuma rota `/product/[slug]` ou feed WooCommerce existe no código atual. O XML antigo em `/wp-content/...` depende da instalação retirada de produção. Corrigir a autenticação desse arquivo não corrige as URLs antigas.

`catalog-server.ts` consulta `store_catalog` (publicação, preço e estoque de varejo), `serenity_store_variants` (variações ativas, preço normal/promocional e vigência), `products` (estoque compartilhado e venda individual) e `product_media` (imagem e vínculo à variação). As relações são `product_id = products.id`, `variant_id = variante.id`. Os modelos mantêm `woo_id` e o identificador público `id`. A página usa o `slug` atual, não um slug antigo reconstruído. A elegibilidade da vitrine é controlada pelas views existentes; o feed restringe ainda a `visibility=visible`, excluindo produtos somente de busca/catálogo oculto.

O repositório não contém o DDL inicial dessas views. Não houve acesso ao esquema ou aos dados vivos do Supabase. O contrato foi conferido nas consultas já utilizadas pelo site. Não havia integração Merchant ou Product/Offer nas páginas de produto (há integração Google Ads separada, preservada).

## Implementação

- `/google-merchant.xml`: RSS 2.0 com namespace Google, público, apenas leitura com chave publicável, sem sessão ou preço de atacado.
- Paginação de 500 registros; estoque de variação limitado pelo estoque do pai; preço promocional segue as mesmas datas da página.
- Uma linha por variante habilitada; produto variável não gera linha duplicada do pai. Sem preço positivo ou imagem HTTPS, o item é omitido. Indisponíveis permanecem com `out_of_stock` para evitar anúncios com disponibilidade falsa.
- IDs de variantes usam `woo_id` quando presente, UUID caso contrário, exatamente como a seleção atual. Produtos simples usam o ID público do catálogo. Antes de migrar a fonte, comparar esses IDs com exportação real do Merchant: preservar o número não prova que a integração antiga usava o mesmo identificador.
- Links `?variacao=ID` abrem a opção correspondente, inclusive indisponível, para não mostrar outro preço ao Google. Canonical continua a página do produto.
- Material, tamanho e cor vêm dos atributos existentes. Não inferimos tamanhos/cor pela imagem. Opções gratuitas/adicionais de preparação não viram variantes artificiais.
- Product/Offer JSON-LD acompanha preços, moeda e estoque da página, incluindo acesso de atacado quando autenticado; o Google anônimo vê varejo. Não há avaliações inventadas.
- Não anunciamos desconto condicionado a quantidade, cupom ou Pix como preço base; esterilização opcional não está no preço da joia.
- Cache de leitura e CDN até 60 segundos cada (a propagação pode se somar), sem estoque reservado. A coleta agendada do Merchant adiciona seu próprio intervalo. Não é sincronização instantânea.
- Falha de catálogo retorna 503 sem dados privados, nunca um XML vazio com 200. A fonte antiga não foi alterada; não houve SQL ou alterações em pagamentos, estoque ou autenticação.

## Pendências antes de ativar campanhas

1. **Marca/identificadores:** o modelo público não informa fabricante/GTIN/MPN. O feed não inventa que todas as joias são fabricadas pela Serenity, não usa SKU como MPN e não declara `identifier_exists=no` sem confirmação. Confirmar com fornecedor. Se forem de marca própria, cadastrar a marca real; se houver GTIN, incluí-lo. A ausência pode gerar limitações/reprovações; não está resolvida apenas pelo XML.
2. **Imagens:** usa imagem original do cadastro/variante, sem alterações. As 24 imagens com texto promocional precisam ser identificadas no diagnóstico do Merchant e substituídas por fotos limpas no painel. Não foi possível inspecioná-las neste ambiente.
3. **Correspondência antiga:** o exemplo Merchant 3431 só pode ser preservado após conferir o XML novo e os dados reais. Não criamos redirects genéricos para `/product/` nem redirecionamos produtos removidos à home. Para recuperar links antigos, fornecer o mapeamento verificado slug/variante antigo → atual.
4. Dados que faltam no catálogo, divergências cadastrais e requisitos específicos do Google não são criados automaticamente.

## Validação após deploy

O ambiente desta sessão bloqueou HTTP externo com `CONNECT tunnel failed, response 403`, inclusive o site e a documentação Google. Portanto não foram comprovados HTTP 200 em produção, acesso do Google, preços/estoque vivos, imagens ou aprovação. Os testes locais não substituem essas verificações.

Após Vercel marcar Ready:

1. Abrir `https://serenitypiercings.com.br/google-merchant.xml` em janela anônima. Deve retornar XML, HTTP 200, sem login.
2. Executar `python3 scripts/validate-merchant.py --limit 20`. Para todos os links/imagens, usar `--limit 0` (muitas requisições, executar fora de pico). O relatório não grava dados privados.
3. Conferir visualmente variantes com preços diferentes, esgotadas, ouro e titânio, comparação de preço/estoque com painel. Testar link 3431 se existir.
4. Usar Teste de resultados avançados do Google nas páginas e a inspeção do Merchant para verificar acesso real do robô; verificar diagnóstico de marca/imagens e preço.

Referências oficiais a conferir: especificação https://support.google.com/merchants/answer/7052112 ; variantes https://support.google.com/merchants/answer/6324507 ; imagens https://support.google.com/merchants/answer/6324350 ; dados estruturados https://developers.google.com/search/docs/appearance/structured-data/product . Não alegamos ter consultado o conteúdo vivo dessas páginas nesta sessão.

## Configurar e migrar a fonte

1. Exportar/guardar os itens e a configuração da fonte antiga para comparação/reversão. Não excluir agora.
2. Validar a nova URL primeiro, incluindo IDs de uma amostra e contagem/itens omitidos. Uma variante com preço ausente não vai aparecer até corrigir seu cadastro.
3. No Merchant → Configurações → Fontes de dados, preparar fonte de produtos por arquivo com coleta agendada da URL nova, Brasil/português/BRL. Preferir editar a URL da fonte antiga se essa opção estiver disponível e IDs/idioma/país estiverem conferidos: evita duas fontes primárias concorrentes.
4. Se não for possível editar a fonte WooCommerce, preparar a nova fonte em modo de teste/sem destino de anúncios, se a interface permitir. Não manter duas fontes de anúncios ativas com os mesmos itens. Fazer a troca em janela acompanhada: interromper a atualização/destino antigo e ativar a nova fonte; preservar a configuração antiga para reversão. Se não houver modo de teste, concluir validação externa antes dessa troca.
5. Agendar coleta diária (ou frequência disponível). Solicitar atualização manual inicial; aguardar processamento e diagnóstico, revisar itens aprovados, preços, imagens e IDs. Evitar exclusão em massa ou reenvio com IDs novos para contornar reprovação.
6. Só remover definitivamente a fonte antiga depois de validar a nova no Merchant. Não há garantia de transição sem reanálise ou interrupção de anúncios pelo Google.

Nenhuma configuração da conta Merchant foi modificada por este código. A entrega está implementada e testada localmente, mas a ativação e homologação de produção continuam pendentes.

## Arquivos e verificação local

- `src/lib/catalog-server.ts`: leitura em lote de varejo para o feed.
- `src/lib/google-merchant.ts`: serialização XML e Product/Offer.
- `src/app/google-merchant.xml/route.ts`: endpoint público.
- `src/app/produto/[slug]/page.tsx`: JSON-LD e parâmetro da variante.
- `src/app/produto/[slug]/ProductPageClient.tsx`: seleção inicial pelo link.
- `tests/google-merchant.test.cjs`: XML analisado por parser, agrupamento, preços/estoque, privacidade e falha 503.
- `scripts/validate-merchant.py`: verificador pós-deploy de páginas, ofertas e imagens.

TypeScript e lint passaram. Os quatro novos testes passaram; os outros 181 testes da loja também passaram na execução da suíte. Não houve acesso ou escrita no banco de produção.
