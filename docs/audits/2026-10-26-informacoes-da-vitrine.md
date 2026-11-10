# Revisão das informações da vitrine — 26/10/2026

## Escopo e limites

Revisão do código da home, cabeçalho, rodapé, carrinho, checkout, materiais, navegação e textos de campanhas/cupons. Não há acesso à configuração de produção ou ao catálogo privado do Supabase. A tentativa de acesso HTTPS ao domínio foi bloqueada pelo proxy deste ambiente (CONNECT 403); isso não demonstra falha no site. Não foi realizada validação visual do deploy.

## Correções

- Home e carrinho anunciavam frete grátis de R$ 299, enquanto o cabeçalho informava R$ 450. Agora usam a informação centralizada do varejo. O carrinho explica a base após progressivo/cupom e antes do Pix. A cotação continua validando a elegibilidade.
- Carrinho dizia que pagamento/frete seriam confirmados pela equipe, apesar do fluxo de cotação e pagamento online. Texto alinhado ao checkout.
- Carrinho contava linhas de produtos como quantidade total de itens. Agora soma as unidades.
- Checkout e editor de cupons afirmavam que não havia acúmulo com campanhas. A comunicação distingue o desconto progressivo e o benefício no Pix das promoções de preço.
- Editor de campanhas esclarece que o menor preço vale entre campanhas de preço, sem excluir os benefícios progressivo/Pix.
- Carrinho prometia 6x sem juros e cabeçalho 3x sem juros. Como o código aceita até 12 parcelas e não comprova as condições de juros da conta Mercado Pago, ambos orientam conferir as condições no pagamento.
- Rodapé tinha WhatsApp fictício e Instagram diferente da seção da home. Usa os contatos existentes no cabeçalho e na seção Instagram.
- Rodapé apontava para páginas sem rota: contato, rastreio, trocas, FAQ, história, sustentabilidade e privacidade. Agora oferece destinos existentes e atendimento real. Rastreamento direciona à conta, onde estão os pedidos.
- Cabeçalho apontava ao domínio antigo para guia de medidas e política de devolução, caminhos sem rota no projeto atual. Navegação aponta para materiais e projetos existentes.
- Removidos TikTok e horário de atendimento sem confirmação disponível no projeto. Atendimento por WhatsApp/e-mail permanece acessível.
- Home, cabeçalho, rodapé e metadados não prometem mais laudo em todas as peças ou ausência universal de reações, afirmações que divergiam da própria página de materiais e não eram verificáveis para todo o catálogo. Orientam consultar a composição de cada joia.
- Contatos e textos comerciais recorrentes ficam em `src/lib/store-information.ts`, para reduzir divergências em futuras edições. Valores financeiros continuam sendo calculados pelas regras existentes no banco/checkout.

## Pendências que precisam de conteúdo ou acesso

- Publicar as políticas oficiais de privacidade, trocas/devoluções e eventual guia de medidas, com conteúdo aprovado pela loja. Esta revisão não inventa prazos, dados da empresa ou regras de devolução. Os links inexistentes foram retirados; a solicitação de troca segue disponível pelo e-mail da loja.
- Conferir os textos e imagens de banners gerenciados, preços e descrições diretamente no catálogo de produção. Não houve alteração de preços, estoque, pedidos ou banco nesta revisão.
- Confirmar com a loja os laudos por produto, eventual TikTok e horários antes de voltar a anunciá-los.
- Validar visualmente desktop/celular e as condições oferecidas pela conta Mercado Pago no deploy publicado.

A tradução dos e-mails de autenticação continua nos templates do Supabase; os avisos de pedidos dependem da ativação SMTP/fila em produção, ainda em acompanhamento na conversa.
