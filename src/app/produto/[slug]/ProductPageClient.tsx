'use client'

import ProductDescription from '@/components/product/ProductDescription'

import { useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ShoppingBag,
  Plus,
  Minus,
  Play,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'
import { promotionPercent } from '@/lib/promotion'

import { commercialProductName, productReference } from '@/lib/product-copy'
import { STORE_INFORMATION } from '@/lib/store-information'
import { isMicrodermalTop, supportsSterilization } from '@/lib/commerce'
import StemChoice, { StemLengthChoice } from '@/components/product/StemChoice'
import SterilizationOptions from '@/components/product/SterilizationOptions'
import { isStem } from '@/lib/commerce'
import DimensionalVariationSelector from '@/components/product/DimensionalVariationSelector'
import { buildVariationDimensions } from '@/lib/variation-dimensions'
import AnodizationOptions from '@/components/product/AnodizationOptions'
import ProductCard from '@/components/ui/ProductCard'
import RestockForm from '@/components/product/RestockForm'

import {
  ANODIZATION_FEE,
  anodizedPrice,
  canAnodize,
} from '@/lib/anodization'

import {
  formatPrice,
  plainText,
  resolveProductSelection,
} from '@/lib/data'

import type { Product } from '@/lib/data'
import { useCartStore } from '@/lib/cart'
import { quoteProductForCart } from '../anodization-actions'

interface Props {
  initialVariation?: string
  product: Product
  related: Product[]
}

export default function ProductPageClient({
  product,
  related,
  initialVariation,
}: Props) {
  const [activeImage, setActiveImage] = useState(0)

  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >(() => {
    const defaults: Record<string, string> = {}

    product.variants.forEach(variant => {
      const option = variant.options.find(item => item.value === initialVariation)

      if (option) {
        defaults[variant.label] = option.value
      }
    })

    if(product.individualSale && product.variations?.length===1 && !defaults['Variação']) defaults['Variação']=product.variations[0].id
    return defaults
  })

  const [quantity, setQuantity] = useState(1)
  const [anodizationRequested, setAnodizationRequested] =
    useState(false)
  const [anodizationColor, setAnodizationColor] = useState('')
  const [stem,setStem]=useState('')
  const [sterilized,setSterilized]=useState(false)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [message, setMessage] = useState('')
  const [youtubeLoaded, setYoutubeLoaded] = useState(false)

  const addingRef = useRef(false)

  const { addItem, openCart, commercePolicy } = useCartStore()
  const stemFee = 5
  const preparationFee = product.sterilizationFee ?? commercePolicy.sterilization_fee ?? 0
  const supportsPreparation = [5,10].includes(preparationFee) && Boolean(product.preparationOptions || commercePolicy.preparation_options) && supportsSterilization(product,product.preparationAllProducts || commercePolicy.sterilization_all_products)

  const selection = resolveProductSelection(
    product,
    selectedVariants
  )

  const dimensions = useMemo(() => buildVariationDimensions(product.variations || []), [product.variations])
  const supportsAnodization = canAnodize(product.tags)

  const needsColor =
    supportsAnodization &&
    anodizationRequested &&
    !anodizationColor

  const effectiveStem=selection?.stemLength || stem
  const canBuy = Boolean(
    selection?.inStock &&
    selection.priceAvailable &&
    !adding &&
    !needsColor &&
    (!effectiveStem || isStem(effectiveStem))
  )

  const photos = Array.from(
    new Set([
      ...(selection?.image ? [selection.image] : []),
      ...product.images,
    ])
  ).filter(Boolean)

  const imageIndex =
    activeImage >= 0 && activeImage < photos.length
      ? activeImage
      : 0

  const currentImage = photos[imageIndex]

  const anodizationFee =
    supportsAnodization && anodizationRequested
      ? product.anodizationFee ?? ANODIZATION_FEE
      : 0

  const currentPrice = anodizedPrice(
    selection?.price ?? product.price,
    anodizationFee
  ) + (supportsPreparation && sterilized ? preparationFee : 0) + (effectiveStem ? stemFee : 0)

  const originalPrice =
    selection?.originalPrice === undefined
      ? undefined
      : anodizedPrice(
          selection.originalPrice,
          anodizationFee
        ) + (supportsPreparation && sterilized ? preparationFee : 0) + (effectiveStem ? stemFee : 0)

  const soldOut=product.inStock===false || selection?.inStock===false
  const unavailableVariations=(product.variations || []).filter(item=>!item.inStock)
  const discount=promotionPercent(currentPrice,originalPrice,selection?.priceAvailable === true)

  const hasDescription = Boolean(
    plainText(product.description || '')
  )

  const hasLongDescription = Boolean(
    plainText(product.longDescription || '')
  )

  const categoryHref =
    product.categorySlug === 'hastes-e-conectores'
      ? '/categoria/hastes-e-topos'
      : `/categoria/${product.categorySlug}`

  const categoryName =
    product.categorySlug === 'hastes-e-conectores'
      ? 'Hastes e conectores'
      : product.category

  const stockLimit = selection?.stock

  const quantityUnavailable =
    !selection?.inStock ||
    !selection.priceAvailable ||
    adding

  const increaseDisabled =
    quantityUnavailable ||
    (
      stockLimit !== null &&
      stockLimit !== undefined &&
      quantity >= stockLimit
    )

  function moveImage(direction: number) {
    if (photos.length < 2) return

    setActiveImage(current => {
      const index =
        current >= 0 && current < photos.length
          ? current
          : 0

      return (
        index + direction + photos.length
      ) % photos.length
    })
  }

  function handleVariant(label: string, value: string) {
    setSelectedVariants(current => ({
      ...current,
      [label]: value,
    }))

    setActiveImage(0)
    setQuantity(1)
    setAdded(false)
    setMessage('')
  }

  async function handleAddToCart() {
    if (!canBuy || addingRef.current) return

    addingRef.current = true
    setAdding(true)
    setMessage('')

    try {
      const color =
        supportsAnodization && anodizationRequested
          ? anodizationColor
          : undefined

      const quote = await quoteProductForCart(
        product.slug,
        selectedVariants,
        color,
        effectiveStem || undefined,
        supportsPreparation ? sterilized : undefined
      )

      if (quote.error || !quote.product) {
        setMessage(
          quote.error ||
          'Não foi possível conferir a peça.'
        )
        return
      }

      const success = addItem(
        quote.product,
        quantity,
        selectedVariants,
        color,
        effectiveStem || undefined,
        supportsPreparation ? sterilized : undefined
      )

      if (!success) {
        setMessage(
          'Não foi possível adicionar. Confira a variação e o limite de estoque, incluindo outras cores no carrinho.'
        )
        return
      }

      setAdded(true)
      openCart()
    } catch {
      setMessage(
        'Não foi possível conferir a peça. Tente novamente.'
      )
    } finally {
      addingRef.current = false
      setAdding(false)
    }
  }

  const buttonLabel = adding
    ? 'Conferindo…'
    : added
      ? 'Adicionar novamente'
      : needsColor
        ? 'Escolha a cor'
        : product.includesStem && selection?.inStock && selection.priceAvailable && Boolean(effectiveStem) && !isStem(effectiveStem)
          ? 'Confira a haste selecionada'
          : canBuy
            ? 'Adicionar ao carrinho'
            : !selection && product.inStock
              ? 'Selecione uma variação'
              : 'Indisponível'

  return (
    <div className="bg-store-canvas text-store-text">
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8 lg:pb-16">
        <nav
          aria-label="Caminho do produto"
          className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-relaxed text-store-muted lg:mb-8"
        >
          <Link href="/" className="hover:text-store-text">
            Início
          </Link>

          <span aria-hidden="true">/</span>

          <Link
            href={categoryHref}
            className="hover:text-store-text"
          >
            {categoryName}
          </Link>

          <span aria-hidden="true">/</span>

          <span className="text-store-muted">
            {product.name}
          </span>
        </nav>

        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12 xl:gap-16">
          <div className="contents lg:block">
            <section aria-label="Fotos do produto" className="order-1 min-w-0">
              <div className="relative aspect-square overflow-hidden rounded-2xl bg-store-raised">
                {currentImage ? (
                  <Image
                    src={currentImage}
                    alt={`${product.name} — foto ${imageIndex + 1}`}
                    fill
                    priority
                    sizes="(max-width: 1023px) 100vw, 55vw"
                    className="object-contain p-5 sm:p-8"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-store-muted">
                    Imagem indisponível
                  </div>
                )}

                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => moveImage(-1)}
                      aria-label="Ver foto anterior"
                      className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-store-border bg-store-surface text-store-text shadow-sm transition-colors hover:bg-store-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9F8968]"
                    >
                      <ChevronLeft
                        size={20}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => moveImage(1)}
                      aria-label="Ver próxima foto"
                      className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-store-border bg-store-surface text-store-text shadow-sm transition-colors hover:bg-store-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9F8968]"
                    >
                      <ChevronRight
                        size={20}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </button>

                    <p
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                      className="absolute bottom-3 right-3 rounded-full bg-store-surface px-3 py-1.5 text-[11px] text-store-muted"
                    >
                      <span className="sr-only">Foto </span>
                      {imageIndex + 1} / {photos.length}
                    </p>
                  </>
                )}
              </div>

              {photos.length > 1 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                  {photos.map((image, index) => (
                    <button
                      key={image}
                      type="button"
                      onClick={() => setActiveImage(index)}
                      aria-label={`Ver foto ${index + 1}`}
                      aria-pressed={index === imageIndex}
                      className={clsx(
                        'relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg border bg-store-raised transition-colors',
                        index === imageIndex
                          ? 'border-[#756B5D]'
                          : 'border-transparent hover:border-store-border'
                      )}
                    >
                      <Image
                        src={image}
                        alt={`${product.name} — miniatura ${index + 1}`}
                        fill
                        sizes="72px"
                        className="object-contain p-1"
                      />
                    </button>
                  ))}
                </div>
              )}
            </section>

            {hasLongDescription && (
              <section
                aria-labelledby="product-description-title"
                className="order-3 min-w-0 border-t border-store-border pt-7 lg:mt-8"
              >
                <div className="space-y-5">
                  <h2
                    id="product-description-title"
                    className="text-sm font-medium"
                  >
                    Sobre a peça
                  </h2>

                  <div className="min-w-0">
                    <ProductDescription
                      value={product.longDescription}
                      includesStem={product.includesStem}
                    />
                  </div>
                </div>
              </section>
            )}
          </div>

          <div className="order-2 min-w-0 lg:pt-2">
            {product.material && (
              <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-store-muted">
                {product.material}
              </p>
            )}

            <h1 className="max-w-xl break-words font-display text-[28px] font-medium leading-[1.15] tracking-[-0.02em] sm:text-[32px] xl:text-[36px]">
              {commercialProductName(product.name,product.sku)}
            </h1>
            {productReference(product.name,product.sku) && <p className="mt-2 text-[11px] text-store-muted">Referência: {productReference(product.name,product.sku)}</p>}

            <div className="mt-5" aria-live="polite">
              {selection?.priceAvailable && !soldOut ? (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  {originalPrice !== undefined && originalPrice > currentPrice && (
                    <del aria-label="Preço anterior" className="text-sm text-store-muted">{formatPrice(originalPrice)}</del>
                  )}
                  <span aria-label="Preço atual" className="text-[23px] font-semibold tracking-tight">{formatPrice(currentPrice)}</span>
                  {discount !== null && <span aria-label={`${discount.toLocaleString('pt-BR')}% de desconto`} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black">{discount.toLocaleString('pt-BR')}% OFF</span>}
                </div>
              ) : (
                <p className="text-sm text-store-muted">
                  {!soldOut
                    ? 'Selecione uma variação para conferir o preço.'
                    : 'Produto indisponível.'}
                </p>
              )}
            </div>

            {(soldOut || unavailableVariations.length>0) && <RestockForm key={product.slug+':'+(selection?.id || '')} slug={product.slug} variants={unavailableVariations} initialVariant={product.variations?selection?.id:undefined}/>}
            {hasDescription && (
              <div className="mt-4">
                <ProductDescription
                  value={product.description}
                  includesStem={product.includesStem}
                />
              </div>
            )}

            {Boolean(product.technicalPreview?.length) && <div className="mt-5 rounded-xl border border-store-border bg-store-surface p-4"><h2 className="mb-3 text-xs font-medium">Medidas e encaixe</h2><dl className="space-y-2 text-xs leading-6 text-store-muted">{product.technicalPreview?.map(fact=><div key={fact.label+'-'+fact.value}><dt className="font-medium">{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl><p className="mt-3 text-[10px] leading-5 text-store-muted">Confira abaixo a opção que deseja comprar. Para dúvidas de compatibilidade, fale com o atendimento.</p></div>}
            <div className="mt-6 rounded-2xl border border-store-border bg-transparent p-4 sm:p-5">
              <div className="mb-4 border-b border-store-border pb-3">
                <h2 className="font-display text-xl font-light tracking-tight text-store-text sm:text-2xl">Personalize sua joia</h2>
              </div>
              {dimensions ? <DimensionalVariationSelector model={dimensions} selectedId={selectedVariants['Variação'] || ''} disabled={adding} onChange={value => handleVariant('Variação', value)} /> : product.variants.length > 0 && !(product.individualSale && product.variations?.length===1) && (
                <div className="mb-5 grid gap-4 sm:grid-cols-2">
                  {product.variants.map((variant, index) => {
                    const inputId =
                      `variant-${product.id}-${index}`

                    return (
                      <div key={`${variant.label}-${index}`}>
                        <label
                          htmlFor={inputId}
                          className="mb-2 block text-xs text-store-muted"
                        >
                          {variant.label}
                        </label>

                        <select
                          id={inputId}
                          value={
                            selectedVariants[variant.label] || ''
                          }
                          disabled={adding}
                          onChange={event =>
                            handleVariant(
                              variant.label,
                              event.target.value
                            )
                          }
                          className="min-h-[46px] w-full rounded-lg border border-store-border bg-store-surface px-3 text-base outline-none focus:border-[#9F8968] disabled:opacity-50 sm:text-sm"
                        >
                          <option value="" disabled>
                            { /cor/i.test(variant.label) || variant.options.some(option => /(?:^|\s)cor(?:\s|:)/i.test(option.name)) ? 'Selecionar variação de cor' : 'Selecionar variação' }
                          </option>

                          {variant.options.map(option => (
                            <option
                              key={option.id}
                              value={option.value}
                              disabled={!option.inStock}
                            >
                              {option.name}
                              {!option.inStock
                                ? ' — Esgotado'
                                : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
              )}

              {product.preparationOptions && isMicrodermalTop(product) && <p className="mb-5 text-xs leading-6 text-store-muted">Esta peça é para microdermal e não acompanha haste de labret. Para incluir uma base compatível, confirme o modelo com o atendimento.</p>}
              {product.individualSale && <p className="mb-4 rounded-lg bg-store-raised px-3 py-2 text-[11px] leading-5 text-store-muted">Venda por unidade. Para duas peças, selecione quantidade 2.</p>}
              <div className="mb-4 space-y-3">
                {product.includesStem && (selection?.stemLength ? <p className="rounded-xl border border-store-border bg-store-raised p-3 text-xs leading-6 text-store-muted">Haste de {selection.stemLength} mm vinculada à variação selecionada. + R$ 5,00 por peça.</p> : <StemChoice value={stem} onChange={value => { setStem(value); setAdded(false) }} disabled={adding} showLength={false} />)}
                {supportsPreparation && <div className={product.includesStem ? 'border-t border-store-border pt-3' : ''}><SterilizationOptions value={sterilized} fee={preparationFee} onChange={value => { setSterilized(value); setAdded(false) }} disabled={adding} /></div>}
                {product.includesStem && !selection?.stemLength && <StemLengthChoice value={stem} onChange={value => { setStem(value); setAdded(false) }} disabled={adding} />}
              </div>
              {supportsAnodization && (
                <details className="group mb-5 border-b border-store-border pb-4">
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-xs text-store-muted [&::-webkit-details-marker]:hidden">
                    <span>
                      {anodizationRequested
                        ? 'Personalização da cor selecionada'
                        : 'Personalizar a cor do titânio'}
                    </span>

                    <ChevronDown
                      size={15}
                      aria-hidden="true"
                      className="shrink-0 transition-transform group-open:rotate-180"
                    />
                  </summary>

                  <div className="pt-2 [&_section]:rounded-none [&_section]:border-0 [&_section]:bg-transparent [&_section]:p-0">
                    <AnodizationOptions
                      tags={product.tags}
                      fee={product.anodizationFee}
                      enabled={anodizationRequested}
                      color={anodizationColor}
                      disabled={adding}
                      onChange={(enabled, color) => {
                        setAnodizationRequested(enabled)
                        setAnodizationColor(color)
                        setAdded(false)
                        setMessage('')
                      }}
                    />
                  </div>
                </details>
              )}

              <div className="grid grid-cols-[104px_minmax(0,1fr)] items-end gap-2.5 border-t border-store-border pt-4 sm:grid-cols-[116px_minmax(0,1fr)] sm:gap-3">
                <div>
                  <p className="mb-2 text-xs text-store-muted">
                    {product.individualSale ? 'Quantidade (peças)' : 'Quantidade'}
                  </p>

                  <div className="flex h-[52px] items-center rounded-xl border border-store-border bg-store-surface">
                    <button
                      type="button"
                      onClick={() => {
                        setQuantity(value => Math.max(1, value - 1))
                        setAdded(false)
                      }}
                      disabled={
                        quantityUnavailable || quantity <= 1
                      }
                      aria-label="Diminuir quantidade"
                      className="flex h-full w-10 shrink-0 items-center justify-center disabled:opacity-30"
                    >
                      <Minus size={14} aria-hidden="true" />
                    </button>

                    <span
                      aria-live="polite"
                      className="min-w-0 flex-1 text-center text-sm"
                    >
                      {quantity}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setQuantity(value => value + 1)
                        setAdded(false)
                      }}
                      disabled={increaseDisabled}
                      aria-label="Aumentar quantidade"
                      className="flex h-full w-10 shrink-0 items-center justify-center disabled:opacity-30"
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!canBuy}
                  className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-store-action px-3 py-3 text-[11px] font-medium text-[#FFFDFA] shadow-[0_4px_14px_rgba(41,38,33,0.12)] transition-colors hover:bg-[#514432] disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
                >
                  <ShoppingBag size={17} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
                  {buttonLabel}
                </button>
              </div>

              {added && !message && (
                <p
                  role="status"
                  className="mt-3 text-xs text-store-success"
                >
                  Peça adicionada ao carrinho.
                </p>
              )}

              {message && (
                <p
                  role="alert"
                  className="mt-3 text-xs leading-relaxed text-store-error"
                >
                  {message}
                </p>
              )}
            </div>

            <aside className="mt-5 border-t border-store-border pt-4 text-xs leading-6 text-store-muted" aria-label="Entrega e ajuda para escolher"><p>Frete e prazo de entrega calculados no checkout.</p>{STORE_INFORMATION.whatsapp && <a href={`${STORE_INFORMATION.whatsapp}?text=${encodeURIComponent('Olá! Preciso de ajuda com as medidas e o encaixe da peça: '+product.name)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center underline underline-offset-4">Dúvidas sobre medidas ou encaixe? Fale com a Lunarity ↗</a>}<Link href="/ajuda" className="block w-fit py-2 underline underline-offset-4">Entrega, pagamento e dúvidas frequentes</Link></aside>
            {product.youtubeShortId && (
              <details className="group mt-6 border-y border-store-border">
                <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 py-3 text-xs font-medium [&::-webkit-details-marker]:hidden">
                  Vídeo do produto

                  <ChevronDown
                    size={15}
                    aria-hidden="true"
                    className="transition-transform group-open:rotate-180"
                  />
                </summary>

                <div className="pb-5">
                  {!youtubeLoaded ? (
                    <button
                      type="button"
                      onClick={() => setYoutubeLoaded(true)}
                      className="flex min-h-[48px] items-center gap-2 rounded-lg border border-store-border px-4 text-xs"
                    >
                      <Play size={16} aria-hidden="true" />
                      Assistir vídeo
                    </button>
                  ) : (
                    <iframe
                      src={`https://www.youtube.com/embed/${product.youtubeShortId}?autoplay=1&rel=0`}
                      className="aspect-[9/16] w-full max-w-[240px] rounded-lg"
                      allow="autoplay; encrypted-media; fullscreen"
                      allowFullScreen
                      title={`${product.name} — vídeo`}
                    />
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="border-t border-store-border py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="mb-6 font-display text-3xl font-medium">
              Você também pode gostar
            </h2>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
              {related.map(item => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
