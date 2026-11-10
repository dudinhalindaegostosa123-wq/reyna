# Identidade da Lunarity

A home tem composição própria em marfim, grafite e verde prateado, tipografia
editorial, símbolo lunar, abertura em duas colunas e navegação por regiões.
As fotos locais existentes podem ser reaproveitadas. Uma imagem de banner
configurada no banco pode substituir a foto de abertura, mas os títulos de
campanhas da marca anterior não são reaproveitados na home.

A seleção de produtos continua vindo do catálogo real. Quando não há novidades,
a home consulta o catálogo geral. Em caso de indisponibilidade mostra um estado
vazio com navegação; não inventa produtos, avaliações, estoque ou preços.

O cabeçalho deixou de sobrepor o primeiro bloco da home. Os contatos e o endereço
da loja anterior foram removidos da vitrine. Sem configuração própria, WhatsApp,
Instagram, e-mail e o botão de envio de projetos não são exibidos.

## Configurações opcionais na Vercel

Não é necessário preencher estes campos agora. A proprietária ainda não informou
contatos próprios. Não inserir valores fictícios.

- `NEXT_PUBLIC_SITE_URL`: origem pública da loja. Enquanto não há domínio próprio,
  o fallback é `https://reyna-three.vercel.app`, endereço informado na conversa.
- `NEXT_PUBLIC_WHATSAPP_URL`: link próprio `https://wa.me/...`.
- `NEXT_PUBLIC_INSTAGRAM_URL`: perfil próprio da Lunarity.
- `NEXT_PUBLIC_CONTACT_EMAIL`: e-mail público próprio.
- `NEXT_PUBLIC_GOOGLE_MAPS_URL`: localização própria, se houver. A home/rodapé não
  anunciam uma loja física herdada.
- `NEXT_PUBLIC_GOOGLE_ADS_ID`, `NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL` e
  `NEXT_PUBLIC_GA4_MEASUREMENT_ID`: identificadores próprios, se for ativar mensuração.
  Os identificadores embutidos da marca anterior foram removidos.
- `SMTP_FROM_EMAIL`: remetente próprio para os serviços de e-mail existentes;
  sem ele o envio permanece não configurado. Usuário, senha e habilitação de
  e-mail continuam sendo configurados separadamente.

Nomes técnicos de tabelas, funções, cookies e variáveis legadas não foram
renomeados para evitar quebrar vínculos de catálogo, sessões e integrações.
Pagamento Asaas e Melhor Envio continuam pendentes de verificação/configuração.
Esta mudança não executa SQL nem altera os workflows de transferência de fotos.

## Validação local

Testes da home verificam marca, navegação, uso de produtos reais, fallback quando
o catálogo está vazio/indisponível e ausência de contatos herdados. Verificação
em Chromium cobre desktop e celular, menu, teclado, navegação e ausência de
rolagem horizontal. Dados de catálogo foram simulados localmente para esse teste,
sem usar credenciais de produção. O build foi exercitado com a API local de teste
e as mesmas famílias tipográficas servidas de pacotes Fontsource, para não depender
do acesso ao Google Fonts nesta máquina. A validação do deploy real é separada.
