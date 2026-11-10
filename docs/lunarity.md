# Identidade da Lunarity

A pedido da proprietária, a home mantém o layout anterior: fundo preto,
banner de largura inteira, seção de recém-chegados, categorias e blocos de
materiais. A reformulação clara foi retirada. A marca Lunarity permanece no
cabeçalho/rodapé, com um pequeno símbolo lunar.

O refinamento seguinte mantém essa base escura e a abertura original. Depois
de recém-chegados, as categorias formam uma grade com um banner maior e dois
menores; as demais categorias ficam em cartões compactos. Orelha, Nariz e
Umbigo têm prioridade quando disponíveis, preservando links e fotos configurados.
Banners com o mesmo destino não são duplicados. O grid também aceita conjuntos
com um ou dois banners e fotos próprias para celular.

Os minibanners para orelha ficam em um bloco delimitado. Uma divisória com estrela
e um pequeno bloco de inspiração acrescentam detalhes discretos, sem trocar as
cores ou a tipografia do layout anterior. Os efeitos respeitam movimento reduzido.

O catálogo e os componentes existentes continuam sendo usados. Os banners
locais permanecem como fallback quando o banco novo ainda não tem banners.
Instagram, WhatsApp, e-mail e endereço da marca anterior ficam ocultos enquanto
a proprietária não informa os próprios contatos.

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

Testes da home verificam o banner e as categorias locais quando o banco não tem
banners, a renderização dos produtos recebidos e a ausência de contatos herdados. Verificação
em Chromium cobre desktop e celular, menu, teclado, navegação e ausência de
rolagem horizontal. Dados de catálogo foram simulados localmente para esse teste,
sem usar credenciais de produção. O build foi exercitado com a API local de teste
e as mesmas famílias tipográficas servidas de pacotes Fontsource, para não depender
do acesso ao Google Fonts nesta máquina. A validação do deploy real é separada.

## Ordem dos blocos da home

A ordem segue a numeração enviada pela proprietária:

1. Banner principal da Lunarity.
2. Recém-chegados.
3. Grid de categorias.
4. Grid de detalhes para orelha.
5. Apresentação dos materiais.
6. Texto de inspiração Lunarity e Essenciais, juntos.
7. Titânio grau implante, antes do rodapé.

As cores, quando disponíveis, e a faixa de benefícios continuam antes do bloco
final de titânio.

## Banner da marca

A composição ilustrativa criada para a Lunarity fica em
`public/banners/lunarity-hero.webp`, com uma versão menor para celular em
`public/banners/lunarity-hero-mobile.webp`. A arte não contém texto gravado,
marca de fabricante ou referência a Swarovski. Os textos e o botão são HTML:
“Cada fase, um novo brilho”, “Piercings de titânio para composições que são a sua
cara” e “Encontre sua joia”, levando para `/categoria/todos`.

O posicionamento inferior da foto e o espaço de texto foram ajustados para
manter as joias visíveis e a navegação sem sobreposição. Campanhas legadas
que mencionem Swarovski usam o novo banner; outras campanhas configuradas
continuam disponíveis no editor de banners. A ausência de um hero configurado,
mesmo com banners de categorias, usa a composição da Lunarity.

Os grids de categorias e detalhes para orelha usam largura máxima de 1600 px no
desktop. Os banners principais têm duas linhas de 300 px e títulos maiores,
mantendo o empilhamento adaptado para celular.

Após a revisão visual, o título principal foi reduzido para no máximo 58 px no
desktop e 38 px no celular. Texto e botão ficam mais altos, na área escura da
foto, deixando livres as joias da composição.

## Acesso administrativo

O painel fica em `/admin`, com login em `/admin/login`. O usuário deve existir
em Authentication → Users do Supabase novo e estar confirmado. Cadastrar seu
UID em `SERENITY_ADMIN_USER_IDS` na Vercel (Production) e fazer Redeploy.
O nome técnico dessa variável foi preservado para não alterar a autorização.
Usuários comuns da loja não ganham permissão administrativa automaticamente.
Senhas devem ser definidas no Supabase e nunca enviadas no chat ou no Git.
A liberação do login não instala as tabelas/RPCs que cada módulo administrativo
exige; o banco preparado inicialmente neste onboarding cobre a vitrine.

`SUPABASE_SECRET_KEY` também precisa estar na Vercel (Production), com a chave
administrativa do mesmo projeto novo usado em `SUPABASE_URL`. Secrets do GitHub
Actions não são enviados à Vercel. Se essa chave estiver ausente, usuários já
autorizados são encaminhados para `/admin/configuracao`, com instruções sem
expor valores. Essa rota também exige autenticação e UID autorizado.

A lista de produtos continua disponível se apenas a visão
`serenity_admin_inventory` não estiver instalada. Nesse caso, exibe um aviso e
não inventa valores de estoque. Falhas de permissão, conexão e consulta de
produtos continuam sendo tratadas como erros; o editor de produtos mantém sua
exigência da visão de estoque.

## Carregamento e envio de banners

A home usa Suspense para carregar produtos e cores separadamente. O banner,
títulos e demais blocos visuais não aguardam a classificação de todo o catálogo.
Os espaços reservados dos produtos mantêm o grid enquanto as consultas terminam.
Consultas públicas mantêm cache de 60 segundos e invalidação por tags; a leitura
da sessão continua por requisição, e preços de atacado continuam sem cache público.
A leitura de banners tem prazo de 2,5 segundos, com o banner local como fallback.
As definições e curadorias públicas de cores usam o mesmo cache de catálogo.

O envio administrativo tenta gravar normalmente. Se falhar e a consulta de
Storage confirmar que `serenity-banners` não existe, cria esse bucket público
somente para WebP (até 3 MB) e tenta novamente uma vez. Isso ocorre somente após
validar o administrador. Buckets existentes e políticas de escrita não são
alterados. Falhas de permissão continuam exigindo a chave administrativa correta
na Vercel; nenhum valor de chave é mostrado na resposta.

A validação de desempenho foi local, com dados simulados e atraso artificial
na API. O acesso ao endereço público da Vercel foi bloqueado pelo proxy deste
ambiente; os tempos locais não são uma medição do site em produção.

As consultas de produtos e cores também têm tratamento de falha por bloco:
se uma seção de produtos falhar, mantém a home e mostra um aviso com opção de
tentar novamente; não publica produtos nem preços fictícios. Se a consulta
opcional de cores falhar, omite apenas esse carrossel. Sinais de renderização
dinâmica, redirecionamento e página não encontrada do Next continuam sendo
propagados. Logs `HOME_PRODUCTS_UNAVAILABLE` e `HOME_COLORS_UNAVAILABLE`
identificam o bloco afetado sem imprimir credenciais. A causa remota depende
dos Runtime Logs da Vercel; Build Logs bem-sucedidos não confirmam a saúde das
consultas quando o site é acessado.

O refinamento seguinte remove a contagem exata do catálogo nas duas vitrines
de quatro produtos da home. `getStorePreview` segue a mesma seleção, preços,
galeria e controle de acesso de `getStorePage`; apenas a listagem completa
continua solicitando totais para paginação. A metadata pública é memorizada por
renderização com React cache, evitando consultas simultâneas repetidas dos
blocos de categorias. Esse cache não armazena a sessão nem preços particulares.
O menu público `/api/categorias` e suas configurações passam a revalidar a cada
60 segundos e continuam usando as tags `catalog`/`category-settings`, já
invalidadas pelo editor administrativo. Não é necessário executar SQL novamente.
