# Serenity Piercings — E-commerce

Loja de piercings de titânio e ouro 18k. Construído com **Next.js 14**, **TypeScript** e **Tailwind CSS**.

## Pré-requisitos

- Node.js 18+ ([download](https://nodejs.org/))
- npm 9+

## Instalação e execução

```bash
# Na pasta do projeto
npm install
npm run dev
```

Acesse: **http://localhost:3000**

## Estrutura do projeto

```
src/
├── app/
│   ├── page.tsx                        # Home
│   ├── layout.tsx                      # Layout raiz (Header, Footer, CartDrawer)
│   ├── globals.css                     # Estilos globais + Google Fonts
│   ├── not-found.tsx                   # Página 404
│   ├── busca/page.tsx                  # Busca de produtos
│   ├── carrinho/page.tsx               # Página de carrinho
│   ├── categoria/[slug]/               # Página de categoria
│   │   ├── page.tsx                    # Server component
│   │   └── CategoryPageClient.tsx      # Client: filtros, sort, paginação
│   └── produto/[slug]/                 # Página de produto
│       ├── page.tsx                    # Server component
│       └── ProductPageClient.tsx       # Client: galeria, variações, carrinho
├── components/
│   ├── layout/
│   │   ├── Header.tsx                  # Cabeçalho + menu mobile
│   │   └── Footer.tsx                  # Rodapé
│   ├── cart/
│   │   └── CartDrawer.tsx              # Carrinho slide-out
│   └── ui/
│       ├── ProductCard.tsx             # Card de produto
│       └── VideoBlock.tsx              # Bloco de vídeo editorial
└── lib/
    ├── data.ts                         # Catálogo (dados + helpers)
    └── cart.ts                         # Store do carrinho (Zustand)
```

## Páginas disponíveis

| URL | Descrição |
|-----|-----------|
| `/` | Home com hero, categorias, novidades, mais vendidos |
| `/categoria/[slug]` | Grade de produtos com filtro, ordenação e paginação |
| `/produto/[slug]` | Produto com galeria, variações, YouTube Short, carrinho |
| `/carrinho` | Carrinho completo com resumo do pedido |
| `/busca` | Busca por nome, tags e material |

### Slugs de categoria

- `piercings-de-titanio`
- `piercings-de-ouro-18k`
- `argolas`
- `labrets-studs`
- `piercings-de-umbigo`
- `brincos`
- `novidades`

## Carrinho

- Persistido no `localStorage` via Zustand
- Drawer slide-out acessível via ícone no header
- Deduplicação por produto + variações selecionadas

## Adicionar vídeos editoriais

No arquivo `src/app/page.tsx`, localize os blocos `<VideoBlock>` e adicione a prop `src`:

```tsx
<VideoBlock
  src="/videos/editorial-titanio.mp4"   // ← adicionar aqui
  poster="https://..."
  title="Feito para durar"
/>
```

## Adicionar produtos reais

Edite `src/lib/data.ts` — o array `PRODUCTS`. Para uma loja com 10k produtos, implemente uma API route Next.js que consulte banco de dados, e substitua as funções de dados em `src/lib/data.ts` por chamadas fetch.

## Deploy (Vercel)

```bash
npm run build   # Verificar se compila sem erros
```

Depois: conecte o repositório no [Vercel](https://vercel.com) e faça deploy automático.

## Integrações pendentes (próximas etapas)

- [ ] Pagamento (Stripe / MercadoPago)
- [ ] Cálculo de frete (Correios / Melhor Envio)
- [ ] Autenticação de usuário
- [ ] Banco de dados (produtos reais)
- [ ] Painel administrativo
- [ ] Migração WooCommerce
