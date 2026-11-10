# Cores das pedras e loja física

A busca aceita a cor da pedra e consultas simples como “verde”, “safira” e “azul claro”, incluindo cores existentes apenas nas variações e inclusões manuais. A paginação preserva a cor. A seleção não substitui a escolha da variação ao comprar.

Executar `database/stone-colors/01-curadoria.sql`. A instalação cria somente a tabela privada de escolhas e a leitura pública filtrada. Não modifica produtos, preços ou estoques. Antes da instalação, o catálogo continua com a classificação automática e o editor informa a pendência.

Em `/admin/cores`, selecionar a página de cor e usar nome, referência ou código para buscar produtos publicados. “Adicionar” força sua presença nessa cor; “Retirar desta cor” impede que a classificação automática o recoloque e não apaga o produto da loja. “Voltar ao automático” remove a exceção. As exceções são por produto/cor; as demais cores não são alteradas. Páginas válidas sem produtos exibem seleção vazia em vez de 404. Visibilidade e publicação do catálogo continuam obrigatórias.

As alterações exigem administrador verificado e invalidam o cache do catálogo. O público não pode escrever exceções nem ler a identidade do administrador; a leitura pública contém somente o vínculo produto/cor de itens publicados e visíveis no catálogo.

Menções à palavra “varejo” foram retiradas dos textos da interface e do feed. Valores internos `retail`, permissões, preços, mínimos, cadastro e informações de atacado permanecem. Contextos de comparação agora usam “condições padrão da loja”.

O rodapé aponta para o perfil exato fornecido: `https://share.google/SNLlABDgXqa4M748E`. As avaliações são consultadas diretamente no Google, sem notas ou depoimentos inventados. Não há lista de avaliações ou nota ao vivo renderizada no site nesta versão. Para incorporar o mapa é necessário o endereço público de Google Maps → Compartilhar → Incorporar um mapa; o redirecionamento do link curto não pôde ser consultado na rede desta sessão. Para renderizar avaliações/nota dentro do site, é necessária uma integração autorizada com Google Places ou widget adequado, com atribuição e atualização conforme o provedor. Não apresentar o link simples como se essa integração já existisse.
