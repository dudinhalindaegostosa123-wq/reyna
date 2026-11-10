'use client'
import { labretCopy } from '@/lib/stem-description'
import Image from 'next/image'
import { STORE_INFORMATION } from '@/lib/store-information'
import Link from 'next/link'
import { Plus, Minus, Trash2 } from 'lucide-react'
import { useCartStore } from '@/lib/cart'
import { isStem } from '@/lib/commerce'
import CartStemChoice from '@/components/cart/CartStemChoice'
import CartSterilizationChoice from '@/components/cart/CartSterilizationChoice'
import CollectionProgress from '@/components/cart/CollectionProgress'
import { useCollectionQuote } from '@/components/cart/useCollectionQuote'
import { formatPrice } from '@/lib/data'

export default function CartPage() {
  const { items, removeItem, updateQuantity, total } = useCartStore()
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
  const needsStem = items.some(item=>item.requiresStem && Boolean(item.stem) && !isStem(item.stem))
  const quote = useCollectionQuote(items)
  const subtotal = quote ? (quote.subtotal_cents ?? quote.total_cents + (quote.discount_cents || 0)) / 100 : total()
  const estimated = quote ? quote.total_cents / 100 : subtotal

  if (items.length === 0) {
    return (
      <div className="bg-store-canvas min-h-screen flex flex-col items-center justify-center gap-6 text-store-muted px-4">
        <p className="font-display text-3xl font-light text-store-text">Seu carrinho está vazio</p>
        <p className="text-[13px]">Adicione peças ao carrinho para continuar</p>
        <Link
          href="/categoria/todos"
          className="border border-store-selected text-[12px] uppercase tracking-[0.15em] px-8 py-4 hover:bg-store-action-hover hover:text-white transition-all duration-200"
        >
          Voltar às compras
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-store-canvas min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h1 id="escolher-hastes" className="font-display text-5xl font-light mb-10">Carrinho</h1>

        <div className="mb-6"><CollectionProgress quote={quote} compact /></div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-10 items-start">
          {/* Items list */}
          <div className="border-t border-store-border divide-y divide-store-border">
            {items.map((item) => (
              <div key={item.variantKey} className="flex gap-5 py-6">
                {/* Image */}
                <Link href={`/produto/${item.slug}`} className="flex-shrink-0">
                  <div className="w-24 h-28 bg-store-raised overflow-hidden">
                    <Image
                      src={item.image}
                      alt={labretCopy(item.name)}
                      width={96}
                      height={112}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </Link>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-4">
                    <div className="min-w-0">
                      <Link href={`/produto/${item.slug}`} className="text-[14px] font-medium leading-snug hover:text-store-accent transition-colors line-clamp-2">
                        {labretCopy(item.name)}
                      </Link>
                      {Object.entries(item.variants).map(([k, v]) => (
                        <p key={k} className="text-[12px] text-store-muted mt-0.5">{k}: {v}</p>
                      ))}
                    </div>
                    <p className="text-[14px] font-medium whitespace-nowrap">
                      {formatPrice(item.price * item.quantity)}
                    </p>
                  </div>

                  <CartStemChoice item={item} />
                  <CartSterilizationChoice item={item} />
                  <div className="flex items-center gap-4 mt-4">
                    {/* Qty */}
                    <div className="flex items-center border border-store-border">
                      <button
                        onClick={() => updateQuantity(item.variantKey, item.quantity - 1)}
                        className="w-9 h-9 flex items-center justify-center hover:bg-store-raised transition-colors"
                        aria-label="Diminuir"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-10 text-center text-[13px]">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.variantKey, item.quantity + 1)}
                        className="w-9 h-9 flex items-center justify-center hover:bg-store-raised transition-colors"
                        aria-label="Aumentar"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => removeItem(item.variantKey)}
                      className="text-store-muted hover:text-store-text transition-colors flex items-center gap-1.5 text-[11px] uppercase tracking-wide"
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                      Remover
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Order summary */}
          <div className="bg-store-surface border border-store-border p-6 space-y-4 sticky top-24">
            <h2 className="font-display text-2xl font-light">Resumo do pedido</h2>

            <div className="space-y-3 text-[13px]">
              <div className="flex justify-between py-3 border-b border-store-border">
                <span className="text-store-muted">Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'itens'})</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {(quote?.discount_cents || 0) > 0 && <div className="flex justify-between text-store-accent"><span>Desconto progressivo</span><span>− {formatPrice((quote?.discount_cents || 0) / 100)}</span></div>}
              <div className="flex justify-between py-1">
                <span className="text-store-muted">Frete</span>
                <span className="text-store-muted text-[12px]">Calculado no checkout</span>
              </div>
            </div>

            <div className="border-t border-store-border pt-4 flex justify-between items-baseline">
              <span className="text-[13px] font-medium">Total estimado</span>
              <span className="text-[18px] font-medium">{formatPrice(estimated)}</span>
            </div>

            {needsStem && <p className="text-xs leading-6 text-store-muted">Escolha a haste de 4, 6, 8 ou 10 mm em cada labret para continuar.</p>}
            <Link href={needsStem ? '/carrinho#escolher-hastes' : '/checkout'} className="flex min-h-[48px] w-full items-center justify-center rounded-full bg-store-action px-5 py-4 text-[12px] uppercase tracking-[0.12em] text-white">{needsStem?'Escolher hastes incluídas':'Continuar pedido'}</Link>
            <Link href="/categoria/todos" className="flex min-h-[48px] w-full items-center justify-center rounded-full border border-store-border px-5 py-4 text-[12px] uppercase tracking-[0.12em] text-store-text transition-colors hover:bg-store-raised">Voltar às compras</Link>
            <p className="text-[10px] text-store-muted text-center">
              Escolha o frete no checkout e pague com Pix ou cartão na próxima etapa.
            </p>

            <div className="pt-2 space-y-1">
              {[STORE_INFORMATION.installments, STORE_INFORMATION.retailShipping].map((tip) => (
                <p key={tip} className="text-[11px] text-store-muted flex items-center gap-1.5">
                  <span className="w-1 h-1 bg-[#B8986A] rounded-full inline-block flex-shrink-0" />
                  {tip}
                </p>
              ))}
            </div>
            <p className="text-[10px] leading-5 text-store-muted">{STORE_INFORMATION.retailShippingConditions}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Lunarity: pedidos do site v1
