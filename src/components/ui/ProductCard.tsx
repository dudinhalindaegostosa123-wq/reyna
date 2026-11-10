'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { MouseEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { commercialProductName, productReference } from '@/lib/product-copy'
import { formatPrice } from '@/lib/data'
import type { Product } from '@/lib/data'
import clsx from 'clsx'
import { promotionPercent } from '@/lib/promotion'

interface Props {
  product: Product
  className?: string
}

export default function ProductCard({ product, className }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const prefetchedHref = useRef<string | null>(null)

  const cardRef = useRef<HTMLAnchorElement>(null)
  const [imageIndex, setImageIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const gallery = Array.from(new Set(product.images.filter(Boolean))).slice(0, 6)
  const galleryKey = JSON.stringify(gallery)

  useEffect(() => { setImageIndex(0) }, [product.slug, galleryKey])

  useEffect(() => {
    if (gallery.length < 2) return
    const element = cardRef.current
    if (!element) return
    const touch = window.matchMedia('(hover: none), (pointer: coarse)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false
    let timer: ReturnType<typeof setInterval> | undefined
    const sync = () => {
      if (timer) clearInterval(timer)
      timer = undefined
      if (visible && !document.hidden && !reduced.matches && (touch.matches || hovered)) {
        timer = setInterval(() => setImageIndex(index => (index + 1) % gallery.length), 3000)
      }
    }
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting)
      sync()
    })
    observer.observe(element)
    document.addEventListener('visibilitychange', sync)
    touch.addEventListener('change', sync)
    reduced.addEventListener('change', sync)
    return () => {
      if (timer) clearInterval(timer)
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      touch.removeEventListener('change', sync)
      reduced.removeEventListener('change', sync)
    }
  }, [product.slug, galleryKey, gallery.length, hovered])

  const discount=promotionPercent(product.price,product.originalPrice,product.priceAvailable !== false && product.inStock !== false)
  const href = `/produto/${product.slug}`

  function prepareNavigation() {
    if (prefetchedHref.current === href) return

    prefetchedHref.current = href
    router.prefetch(href)
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }

    event.preventDefault()

    if (isPending) return

    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <Link
      ref={cardRef}
      href={href}
      prefetch={false}
      onMouseEnter={() => { prepareNavigation(); setHovered(true); if (gallery.length > 1) setImageIndex(1) }}
      onMouseLeave={() => { setHovered(false); setImageIndex(0) }}
      onFocus={prepareNavigation}
      onClick={handleClick}
      aria-busy={isPending}
      className={clsx(
        'group block focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-offset-4 focus-visible:outline-[#B8986A]',
        isPending && 'cursor-progress',
        className
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-[color:var(--home-surface,#F4F4F2)] product-img-wrap">
        {gallery.length > 0 ? (
          <Image
            src={gallery[imageIndex % gallery.length] || product.images[0]}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={clsx(
              'object-contain transition-opacity duration-150',
              product.inStock === false && 'opacity-50 grayscale',
              isPending && 'opacity-60'
            )}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-neutral-500">
            Imagem indisponível
          </div>
        )}

        {gallery.length > 1 && <Image
          src={gallery[1]}
          alt=""
          aria-hidden="true"
          fill
          loading="lazy"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="pointer-events-none object-contain opacity-0"
        />}

        {gallery.length > 1 && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1 group-hover:bottom-12">{gallery.map((_,index)=><span key={index} className={clsx('h-1 w-1 rounded-full shadow-sm',index===imageIndex?'bg-store-action':'bg-white/80')}/>)}</div>}

        {discount !== null && <span aria-label={`${discount.toLocaleString('pt-BR')}% de desconto`} className="absolute left-3 top-3 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black sm:text-sm">{discount.toLocaleString('pt-BR')}% OFF</span>}

        {product.inStock === false && <span className="absolute left-3 top-3 rounded-lg bg-white px-3 py-1.5 text-[10px] font-semibold uppercase text-black sm:text-xs">Indisponível</span>}
        {product.isFeatured && product.inStock !== false && discount === null && (
          <span className="absolute left-3 top-3 bg-white text-black px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            Destaque
          </span>
        )}

        {isPending ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/30">
            <div
              role="status"
              className="flex items-center gap-2 bg-store-surface px-3 py-2.5 shadow-sm"
            >
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-store-border border-t-[#0A0A0A] motion-reduce:animate-none"
              />

              <span className="text-[10px] uppercase tracking-[0.1em] text-store-text">
                Abrindo…
              </span>
            </div>
          </div>
        ) : (
          <div className="absolute inset-x-0 bottom-0 translate-y-full bg-white text-black py-3 text-center text-[11px] uppercase tracking-widest transition-transform duration-300 group-hover:translate-y-0 group-focus-visible:translate-y-0">
            {product.inStock === false ? 'Avise-me quando voltar' : 'Ver produto'}
          </div>
        )}
      </div>

      <div className="space-y-1 pt-2.5">
        <p className="line-clamp-1 text-[9px] uppercase tracking-[0.04em] text-[color:var(--home-muted,#817B72)] sm:text-[10px]">
          {product.category}
        </p>

        <p className="line-clamp-2 min-h-[40px] text-[12px] font-medium leading-5 sm:text-[13px]">
          {commercialProductName(product.name,product.sku)}
        </p>

        {productReference(product.name,product.sku) && <p className="text-[10px] text-[color:var(--home-muted,#817B72)]">Ref. {productReference(product.name,product.sku)}</p>}
        {product.inStock === false ? <p className="pt-1 text-xs font-medium underline underline-offset-4">Avise-me quando voltar ao estoque</p> : product.priceAvailable !== false ? (
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            {product.originalPrice !== undefined && product.originalPrice > product.price && (
              <del aria-label="Preço anterior" className="text-[12px] text-[color:var(--home-muted,#817B72)] sm:text-[13px]">
                {formatPrice(product.originalPrice)}
              </del>
            )}
            <span aria-label="Preço atual" className="text-[14px] font-semibold sm:text-[16px]">
              {product.variations ? (
                <span className="mr-1 text-[9px] font-normal sm:text-[10px]">A partir de</span>
              ) : null}
              {formatPrice(product.price)}
            </span>
          </div>
        ) : (
          <p className="text-xs text-[color:var(--home-muted,#6B6B6B)]">
            Consulte os detalhes
          </p>
        )}
      </div>
    </Link>
  )
}
