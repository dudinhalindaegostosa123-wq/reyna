# Seletores de espessura e comprimento

Produtos variáveis com atributos estruturados de espessura/calibre e/ou comprimento da haste exibem menus compactos separados. Espessura/calibre é identificado como grossura; comprimento é a medida da haste sem contar as pontas. Rosca e tamanho da pedra não são reinterpretados como essas medidas.

A escolha completa continua gerando o mesmo ID real da variação usado pelo carrinho, cotação e checkout. Não se geram combinações, não se alteram preços e não se somam taxas por escolher medidas. Preço, disponibilidade e imagem continuam vindos do SKU existente. Escolhas incompatíveis são limpas, as opções sem combinação disponível ficam desabilitadas, e uma seleção incompleta não pode ser adicionada ao carrinho.

Demais atributos, como cor, permanecem necessários quando identificam outra variação. Dados incompletos, duplicados ou ambíguos usam o seletor original para não adivinhar o produto. Links com variação explícita continuam preenchendo as medidas. A alteração não exige SQL e aproveita os atributos já retornados pela consulta existente.

Testes cobrem espessuras 1,2/1,6 mm e comprimentos 6/8/12 mm, SKU/preço/imagem preservados, combinação inexistente, falta de estoque, seleção incompleta, atributos adicionais e fallback seguro. Não inclui a integração de avaliações do Google, adiada pelo usuário.
