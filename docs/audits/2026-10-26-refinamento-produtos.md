# Refinamento da apresentação comercial — 26/10/2026

## Implementado

- Descrições antigas com marcadores de texto importado recebem resumo objetivo e ficha técnica na exibição pública, quando é possível extrair os dados com confiança.
- A ficha preserva material, acabamento, dimensões, conexão, gemas, conteúdo e cuidados explicitamente identificados. As medidas não são convertidas em recomendações anatômicas universais.
- Trechos comerciais repetitivos, afirmações absolutas e apelos de escassez não entram na versão simplificada. Uma extração com alegações arriscadas, medidas fora da ficha, valores conflitantes ou condições específicas de garantia/esterilização fica para revisão, mantendo a descrição original.
- A regra de haste incluída continua dependendo da política ativa do produto. A descrição simplificada não transforma uma base microdermal em haste comum nem inventa um acessório compatível.
- Textos sem marcadores antigos permanecem como escritos pela loja.
- Até três medidas/conexões extraídas com segurança aparecem perto das opções de compra, além da ficha detalhada.
- O título público deixa o código em uma linha de referência própria, preservando o nome, SKU, slug e identificação nos dados de compra. Material, acabamento e medidas do nome não são apagados.
- Produtos totalmente indisponíveis ganham indicação “Esgotado” no cartão da vitrine.
- A página do produto oferece acesso direto ao atendimento para dúvidas de medidas/encaixe e à nova página `/ajuda`.
- A página de ajuda explica medidas, conteúdo, entrega, pagamento, conta e acompanhamento; benefícios de frete e preparação acompanham a configuração ativa. Não substitui uma política jurídica de troca/devolução ou privacidade.
- Busca sem resultado oferece caminhos úteis para o catálogo, orelha, projetos e ajuda.
- Descrição de SEO acompanha o resumo simplificado; URLs canônicas de produto foram adicionadas.

## Conferência no CSV histórico

O arquivo `produtos.csv` tem 1.738 produtos pais publicados no recorte analisado. A transformação aceitou 942 para exibição simplificada. Nos aceitos, a mediana da descrição detalhada passou de 705 para aproximadamente 83 palavras. Outros 796 permaneceram preservados para conferência; isso inclui os textos que já não exigiam transformação.

O relatório `catalogo/revisao-descricoes-2026-10-26.csv` lista cada produto, o resultado e os motivos de revisão. O identificador é o ID do CSV antigo, não um UUID do Supabase. Não deve ser usado diretamente em um UPDATE de produção.

Essas quantidades descrevem o CSV local, não comprovam o catálogo atual publicado. Em produção, a mesma regra usa o conteúdo atual de cada produto. Não houve leitura ou escrita direta no Supabase, nem reimportação desse CSV para sobrescrever edições recentes.

## Conservação e limites

Os textos originais continuam no banco e no editor administrativo; a simplificação atua na página pública. Não exige novo SQL. Preços, estoque, variantes e pedidos não foram alterados. Os registros separados para revisão não são preenchidos por inferência. Fotos que contenham textos antigos não foram alteradas.

Não foram criadas políticas jurídicas ou dados de empresa fictícios. Cadastro sem conta, integrações de análise e simulação de frete no produto exigem trabalho próprio e validação de produção; não foram incluídos nesta alteração.

O acesso ao domínio publicado continua bloqueado pelo proxy deste ambiente. TypeScript, lint e testes locais validam a implementação; não substituem uma conferência visual em celular após o deploy.
