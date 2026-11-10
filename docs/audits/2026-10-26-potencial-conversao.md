# Avaliação comercial da Serenity — 26/10/2026

## Conclusão e nota

**6/10 de prontidão para conversão, provisório.** Avaliação qualitativa da estrutura de compra e do conteúdo disponíveis no projeto, não de desempenho observado do site publicado. Não significa taxa de conversão de 6%, nem existe garantia de que um redesenho produzirá vendas. Aparência atual, velocidade real, funcionamento em dispositivos e entrega de e-mails de pedidos permanecem sem validação nesta avaliação.

A loja tem bons caminhos de descoberta (região, cor, material e projetos prontos), personalização, benefícios progressivos e integração de pagamento. A maior oportunidade está em facilitar a decisão sobre a peça certa e reduzir o esforço antes do pagamento. Mais banners e descontos não resolvem dúvidas de compatibilidade ou uma jornada de acesso longa.

## Como a avaliação foi feita

- Leitura dos componentes e rotas de home, navegação, busca, categorias, produto, carrinho, cadastro, confirmação, checkout, materiais e projetos.
- Inspeção do CSV histórico de produtos e dos arquivos locais de imagem. Esse CSV não confirma a quantidade nem os textos atuais em produção.
- A tentativa de acesso a https://serenitypiercings.com.br foi bloqueada pelo proxy deste ambiente (CONNECT 403). Não foi possível navegar visualmente no domínio ou no checkout real; isso não demonstra indisponibilidade do site para clientes.
- Não há acesso às métricas de visitas, pedidos pagos, funil, erros de produção ou configuração atual de Vercel/Supabase. Não foram realizados pagamentos, testes de cliente real ou medições de Core Web Vitals.

## Achados e prioridades

| Prioridade | Achado | Evidência | Refinamento recomendado |
|---|---|---|---|
| Alta | Joia em estoque podia aparecer como “Indisponível” quando faltava somente escolher a haste. | `src/app/produto/[slug]/ProductPageClient.tsx`: disponibilidade depende da haste; texto genérico não distinguia essa condição. | **Corrigido nesta revisão:** “Escolha a haste incluída”. Mantida a validação da escolha. |
| Alta | Cadastro/autenticação são obrigatórios antes do checkout; novos clientes precisam confirmar e-mail. | `src/app/checkout/page.tsx` redireciona visitante sem conta; cadastro tem seis campos, incluindo senha e confirmação, mais tipo de compra. | Medir abandono nesse trecho. Testar posteriormente uma jornada de varejo mais curta, mantendo a validação da identidade e o vínculo dos pedidos. Não simplesmente remover confirmação de e-mail: ela protege o acesso ao histórico. Atacado segue com aprovação própria. |
| Alta | Compatibilidade de microdermal continua sem comprovação no cadastro. | CSV TN1072 e semelhantes: nome 1,6 mm/rosca 1,2 mm; base TN1390: nome “Para Topos 1.2mm”, descrição rosca 0,9 mm. | Confirmar especificações por SKU com o fornecedor antes de oferecer uma base grátis. Mostrar separadamente diâmetro externo, rosca, comprimento/altura e o que acompanha. Não inventar uma medida “padrão”. |
| Alta | Não há páginas oficiais implementadas de privacidade ou trocas/devoluções, nem identificação comercial completa no rodapé atual. | Rotas e rodapé revisados. Há WhatsApp, e-mail e acesso à conta; atendimento não substitui uma política acessível. | Publicar documentos aprovados pela loja, identificação real do vendedor e condições claras de entrega/troca. Não preencher com dados fictícios ou regras genéricas. |
| Alta | Falta instrumentação de funil identificável no código. | Não foram encontrados GA4/GTM/Meta Pixel ou eventos de comércio eletrônico nos arquivos revisados. Uma instalação externa não pode ser descartada sem acesso ao deploy. | Medir visualização de produto, adicionar ao carrinho, início de checkout, escolha de frete/pagamento e compra aprovada. Deduplicar compra por pedido e não considerar Pix gerado como venda. Aplicar preferências de privacidade antes de rastreamento não essencial. |
| Média-alta | Descrições importadas têm excesso de texto e alegações comerciais absolutas. | No CSV histórico: 1.738 pais publicados, mediana de 727 palavras na descrição; 1.701 acima de 500 palavras. Busca por padrões indicou 1.222 com possíveis alegações absolutas e 1.240 com expressões de escassez genérica. São sinais para revisão, não classificação jurídica ou auditoria manual de cada peça. | Reescrever em lotes começando pelos produtos mais visitados/vendidos: título curto, resumo de duas frases e ficha técnica. Revisar alegações de cicatrização, conforto garantido, escassez e laudo por peça. Preservar dados verdadeiros e medidas. |
| Média-alta | Escolher uma joia pode exigir conhecimento de piercing profissional. | Variações, comprimento de haste, acabamento e microdermal aparecem antes de adicionar; a categoria oferece principalmente material/ordenação. | Guia visual curto: “já tem perfuração?”, “qual região?”, “qual encaixe e medida da sua joia atual?”. Não indicar comprimento clínico universal nem diagnosticar anatomia. Oferecer ajuda real do atendimento. |
| Média | Frete e prazo aparecem na etapa de checkout; não há simulador de CEP no componente do produto. | Página do produto sem campo de CEP; cotação no checkout. | Avaliar estimativa de entrega no produto/carrinho, incluindo o prazo operacional já definido. Se exigir dados de carrinho, informar claramente que é uma estimativa e recalcular antes de pagar. |
| Média | Não há módulo próprio de avaliações verificadas nos arquivos revisados. | Home tem Instagram e projetos; isso mostra a marca, mas não organiza relatos de compradores por produto. | Acrescentar avaliações reais, fotos autorizadas e identificação de compra verificada quando houver evidência. Nunca inventar estrelas, avaliações ou números de vendas. |
| Média | Vitrine não antecipa disponibilidade no cartão de produto. | `ProductCard.tsx` mostra nome/preço, mas não uma indicação explícita de esgotado ou distinção de estoque das variações. | Distinguir produto completamente esgotado de produto com algumas variações disponíveis. Oferecer alternativa compatível e, se criado, aviso de reposição consentido. |
| Média | A dobra inicial pode deixar as joias muito abaixo no celular. | Hero tem mínimo de 70vh, além de cabeçalho e outras faixas. Há faixa de progressivo e seção de campanha com mensagens semelhantes. | Validar no celular. Testar uma única mensagem principal e hero mais compacto, preservando a identidade e os banners aprovados. Não redesenhar sem ver o resultado real. |
| Média | Há oportunidade de otimização de imagens; velocidade não foi medida. | Arquivos locais como orelha.webp ~1,5 MiB e materiais.png ~1,9 MiB; várias imagens usam Next Image, o que pode reduzir a transferência. O hero usa `picture/img` com prioridade alta. | Medir as imagens efetivamente transferidas no deploy e LCP/INP/CLS em celular. Redimensionar/comprimir somente com comparação visual. Peso em disco não equivale ao peso servido. |
| Média | SEO técnico pode ser ampliado. | Metadados e Open Graph de produto existem. Não foram encontradas rotas de sitemap/robots nem marcação Product/Offer no código revisado. | Conferir recursos externos e indexação antes de concluir ausência em produção. Depois adicionar sitemap, canonical e dados estruturados corretos, sem inventar avaliações ou disponibilidade. |

## Página de produto que eu priorizaria

1. Foto nítida da joia e uma referência real de escala/uso.
2. Nome comercial curto; código SKU em linha própria, preservando o nome completo nos registros internos.
3. Material e acabamento exatos, sem confundir ouro maciço, revestimento e anodização.
4. Preço da opção selecionada e explicação concisa dos benefícios aplicáveis.
5. Ficha técnica: tamanho do topo/pedra, diâmetro da haste, comprimento e tipo/medida da conexão, cada um em campo separado.
6. “O que você recebe” explícito, com a haste incluída apenas onde a compatibilidade estiver confirmada.
7. Variações e extras gratuitos fáceis de escolher; CTA indicando o que falta selecionar.
8. Entrega, troca e contato acessíveis perto da decisão de compra.
9. Descrição detalhada e cuidados em áreas secundárias, sem esconder informação essencial dentro de centenas de palavras.

Não reescrever preços ou especificações por inferência do título. Não prometer compatibilidade clínica universal ou tratamento de cicatrização.

## Margem: desconto não é conversão lucrativa

O progressivo por quantidade combina com projetos auriculares. Porém, é necessário acompanhar margem após cupom, Pix, frete subsidiado, taxas e preparação gratuita.

Exemplo **hipotético**, supondo uma joia com preço cheio antigo de R$100 e um cupom de 10% válido: redução de base de 18% → R$82; cupom de 10% → R$73,80; progressivo de 20% → R$59,04; Pix de 5% → aproximadamente R$56,09. São 43,91% abaixo daquela base antiga, antes de custos. Os percentuais são sequenciais, não somados. O exemplo não afirma que esse cupom exista ou que a joia tenha esse preço.

Não recomendo ampliar descontos antes de medir margem por pedido e por material. Separar relatórios de varejo e atacado.

## Validação comercial antes de ampliar anúncios

- Confirmar deploy e migrações efetivamente ativos; código instalado não comprova ativação no banco.
- Fazer uma jornada acompanhada de visitante novo em celular, da página inicial ao pagamento, e outra com cliente que retorna. Usar ambiente de testes ou uma compra real explicitamente autorizada; não gerar cobranças automaticamente.
- Verificar manutenção do carrinho após cadastro/confirmação, clareza da escolha de haste, total, descontos, frete, pagamento, confirmação, pedido na conta e e-mails.
- Testar Pix e cartão, inclusive erro recuperável de pagamento, sem duplicar pedidos/estoque.
- Medir sessões → produto → carrinho → checkout → pedido pago. Segmentar dispositivo, origem de tráfego, varejo/atacado e novo/recorrente.
- Priorizar pelo maior abandono e pela frequência dos chamados. Aumentar ticket não basta se a margem ou a taxa de compra caírem.

## O que foi alterado agora

Somente o texto do botão quando falta selecionar haste incluída, evitando falso sinal de esgotamento. Os demais pontos são recomendações para revisão comercial; não houve alteração automática de cadastro obrigatório, preços, políticas, fotos ou banco de produção.
