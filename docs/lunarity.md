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

Após o banner principal, a apresentação “Cada detalhe começa na escolha do
material” aparece mais acima. O bloco de inspiração Lunarity e o grid de
Essenciais permanecem juntos no meio da página, após as categorias. A seção
“Titânio grau implante” fecha o conteúdo da home, imediatamente antes do rodapé.

Os grids de categorias e detalhes para orelha usam largura máxima de 1600 px no
desktop. Os banners principais têm duas linhas de 300 px e títulos maiores,
mantendo o empilhamento adaptado para celular.
