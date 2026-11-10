'use client'

import Brand, { LunarMark } from '@/components/brand/Brand'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Search,
  ShoppingBag,
  UserRound,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react'
import { useCartStore } from '@/lib/cart'
import clsx from 'clsx'

const ANNOUNCEMENTS = ['Lunarity · Piercings e joias', 'Cada fase, um novo brilho', 'Explore os materiais e encontre a sua composição']

interface NavLink {
  label: string
  href: string
  external?: boolean
}

interface CategoryLink {
  name: string
  href: string
}

const NAV_LINKS: NavLink[] = [
  {
    label: 'Novidades',
    href: '/categoria/novidades',
  },
  {
    label: 'Ajuda',
    href: '/ajuda',
  },
  {
    label: 'Conheça os materiais',
    href: '/materiais',
  },
  {
    label: 'Projetos auriculares',
    href: '/projeto-auricular',
  },
]

export default function Header() {
  const pathname = usePathname()
  const isHome = pathname === '/'
  const headerRef = useRef<HTMLElement>(null)
  const [headerHeight, setHeaderHeight] = useState(136)

  const categoryButtonRef = useRef<HTMLButtonElement>(null)
  const mobileButtonRef = useRef<HTMLButtonElement>(null)
  const mobilePanelRef = useRef<HTMLDivElement>(null)

  const [isMobile, setIsMobile] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [mobileWhite, setMobileWhite] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)

  const [categories, setCategories] = useState<CategoryLink[]>([])
  const [categoryState, setCategoryState] = useState<
    'loading' | 'ready' | 'error'
  >('loading')
  const [categoryAttempt, setCategoryAttempt] = useState(0)

  useEffect(() => {
    const element = headerRef.current
    if (!element) return
    const measure = () => setHeaderHeight(element.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const { itemCount } = useCartStore()
  const count = itemCount()

  useEffect(() => {
    const controller = new AbortController()

    async function loadCategories() {
      setCategoryState('loading')

      try {
        const response = await fetch('/api/categorias', {
          signal: controller.signal,
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error('CATEGORY_QUERY')
        }

        const result = await response.json()

        if (!Array.isArray(result.categories)) {
          throw new Error('CATEGORY_RESPONSE')
        }

        const items: CategoryLink[] = []

        for (const item of result.categories) {
          if (
            item &&
            typeof item.name === 'string' &&
            typeof item.href === 'string' &&
            /^\/categoria\/[a-zA-Z0-9%_-]+$/.test(item.href)
          ) {
            items.push({
              name: item.name,
              href: item.href,
            })
          }
        }

        if (!controller.signal.aborted) {
          setCategories(items)
          setCategoryState('ready')
        }
      } catch {
        if (!controller.signal.aborted) {
          setCategoryState('error')
        }
      }
    }

    void loadCategories()

    return () => controller.abort()
  }, [categoryAttempt])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)')

    const update = () => {
      setIsMobile(query.matches)
      setHovered(false)
      setCategoriesOpen(false)

      if (!query.matches) {
        setMobileOpen(false)
      }
    }

    update()
    query.addEventListener('change', update)

    return () => query.removeEventListener('change', update)
  }, [])


  useEffect(() => {
    if (!isHome || !isMobile) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let wasAtTop = window.scrollY <= 2

    const clearTimer = () => {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
    }

    const showAtTop = () => {
      clearTimer()
      setMobileWhite(true)

      if (!mobileOpen && !focused) {
        timer = setTimeout(() => {
          setMobileWhite(false)
        }, 3000)
      }
    }

    const onScroll = () => {
      const atTop = window.scrollY <= 2

      if (atTop) {
        if (!wasAtTop) showAtTop()
      } else {
        clearTimer()
        setMobileWhite(false)
      }

      wasAtTop = atTop
    }

    const onInteraction = () => {
      if (window.scrollY <= 2) showAtTop()
    }

    if (wasAtTop) {
      showAtTop()
    } else {
      setMobileWhite(false)
    }

    window.addEventListener('scroll', onScroll, {
      passive: true,
    })
    window.addEventListener('pointerdown', onInteraction, {
      passive: true,
    })
    window.addEventListener('keydown', onInteraction)

    return () => {
      clearTimer()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointerdown', onInteraction)
      window.removeEventListener('keydown', onInteraction)
    }
  }, [isHome, isMobile, mobileOpen, focused])

  useEffect(() => {
    setMobileOpen(false)
    setCategoriesOpen(false)
    setHovered(false)
    setFocused(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const panel = mobilePanelRef.current

    const selector =
      'a[href], button:not([disabled]), summary, ' +
      'input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), [tabindex="0"]'

    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(selector) || []
      ).filter(element => element.getClientRects().length > 0)

    focusable()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMobileOpen(false)
        mobileButtonRef.current?.focus()
        return
      }

      if (event.key !== 'Tab') return

      const elements = focusable()
      const first = elements[0]
      const last = elements[elements.length - 1]

      if (!first || !last) return

      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !panel?.contains(document.activeElement))
      ) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panel?.contains(document.activeElement))
      ) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileOpen])

  const closeMobile = () => {
    setMobileOpen(false)
    mobileButtonRef.current?.focus()
  }

  const closeMenus = () => {
    setMobileOpen(false)
    setCategoriesOpen(false)
  }

  const solidBackground =
    !isHome ||
    mobileOpen ||
    categoriesOpen ||
    focused ||
    (isMobile ? mobileWhite : hovered)

  const categoryLinks = () => (
    <>
      <Link
        href="/categoria/todos"
        onClick={closeMenus}
        className="block rounded-lg px-4 py-3 text-sm font-medium hover:bg-[#292929]"
      >
        Todas as joias
      </Link>

      {categoryState === 'loading' && (
        <p role="status" className="px-4 py-3 text-xs text-[#B9B7B1]">
          Carregando categorias…
        </p>
      )}

      {categoryState === 'error' && (
        <div className="px-4 py-3">
          <p role="status" className="text-xs text-[#B9B7B1]">
            Não foi possível carregar as categorias.
          </p>

          <button
            type="button"
            onClick={() => setCategoryAttempt(value => value + 1)}
            className="mt-2 min-h-[44px] text-xs underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {categoryState === 'ready' &&
        categories.map(category => (
          <Link
            key={category.href}
            href={category.href}
            onClick={closeMenus}
            aria-current={
              pathname === category.href ? 'page' : undefined
            }
            className={clsx(
              'block break-words rounded-lg px-4 py-3 text-sm',
              'transition-colors hover:bg-[#292929]',
              pathname === category.href && 'bg-[#292929]'
            )}
          >
            {category.name}
          </Link>
        ))}
    </>
  )

  return (
    <>
      <div className="serenity-announcement">
        <div className="serenity-announcement-track">
          {[0, 1].map(copy => (
            <div
              key={copy}
              className="serenity-announcement-group"
              aria-hidden={copy === 1 ? true : undefined}
            >
              {ANNOUNCEMENTS.map(text => (
                <span
                  key={text}
                  className="serenity-announcement-item"
                >
                  <span className="serenity-announcement-text">
                    {text}
                  </span>

                  <span
                    className="serenity-announcement-separator"
                    aria-hidden="true"
                  >
                    <LunarMark className="h-5 w-5" />
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <header
        ref={headerRef}
        style={{ marginBottom: isHome ? -headerHeight : undefined }}
        onMouseEnter={() => {
          if (!isMobile) setHovered(true)
        }}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={event => {
          const nextTarget = event.relatedTarget

          if (
            !nextTarget ||
            !event.currentTarget.contains(nextTarget as Node)
          ) {
            setFocused(false)
          }
        }}
        className={clsx(
          'relative z-30 border-b',
          'transition-[background-color,color,border-color] duration-200',
          'motion-reduce:transition-none',
          solidBackground
            ? 'border-[#34332F] bg-[#000000] text-[#F2F1ED]'
            : 'border-transparent bg-transparent text-white'
        )}
      >
        <div className="relative mx-auto flex h-[88px] max-w-7xl items-center justify-between px-3 sm:px-4 lg:h-[92px] lg:px-8">
          <div className="flex min-w-10 items-center">
            <button
              ref={mobileButtonRef}
              type="button"
              className="rounded-sm p-2 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
              aria-expanded={mobileOpen}
              aria-controls="serenity-mobile-menu"
            >
              <Menu size={22} strokeWidth={1.5} />
            </button>
            <Link href="/busca" aria-label="Buscar produtos" className="inline-flex h-11 w-10 items-center justify-center transition-colors hover:text-[#B8986A] lg:hidden">
              <Search size={20} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </div>

          <Link
            href="/"
            aria-label="Lunarity — página inicial"
            className="absolute left-1/2 -translate-x-1/2"
          >
            <Brand />
          </Link>

          <div className="flex items-center gap-0 sm:gap-2 lg:gap-4">
            <Link
              href="/busca"
              aria-label="Buscar produtos"
              className="hidden p-2 transition-colors hover:text-[#B8986A] lg:inline-flex"
            >
              <Search size={20} strokeWidth={1.5} />
            </Link>

            <Link href="/minha-conta" aria-label="Minha conta" title="Minha conta" className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors hover:text-[#B8986A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-current">
              <UserRound size={20} strokeWidth={1.5} aria-hidden="true" />
            </Link>

            <Link
              href="/carrinho"
              aria-label={`Abrir carrinho, ${count} itens`}
              className="relative p-2 transition-colors hover:text-[#B8986A]"
            >
              <ShoppingBag size={20} strokeWidth={1.5} />

              {count > 0 && (
                <span
                  className={clsx(
                    'absolute -right-0.5 -top-0.5 flex h-4 w-4',
                    'items-center justify-center rounded-full',
                    'text-[10px] font-medium',
                    'bg-white text-[#0A0A0A]'
                  )}
                >
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </Link>
          </div>
        </div>

        <nav
          aria-label="Menu principal"
          className="hidden min-h-11 items-center justify-center gap-8 px-6 pb-3 lg:flex xl:gap-10"
        >
          <div
            className="relative"
            onMouseEnter={() => setCategoriesOpen(true)}
            onMouseLeave={() => setCategoriesOpen(false)}
            onBlurCapture={event => {
              const nextTarget = event.relatedTarget

              if (
                !nextTarget ||
                !event.currentTarget.contains(nextTarget as Node)
              ) {
                setCategoriesOpen(false)
              }
            }}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setCategoriesOpen(false)
                categoryButtonRef.current?.focus()
              }
            }}
          >
            <button
              ref={categoryButtonRef}
              type="button"
              aria-expanded={categoriesOpen}
              aria-controls="serenity-desktop-categories"
              onClick={() => setCategoriesOpen(value => !value)}
              className="flex min-h-[44px] items-center gap-2 text-[12px] uppercase tracking-wide hover:text-[#B8986A]"
            >
              Categorias

              <ChevronDown
                size={14}
                aria-hidden="true"
                className={clsx(
                  'transition-transform',
                  categoriesOpen && 'rotate-180'
                )}
              />
            </button>

            {categoriesOpen && (
              <div
                id="serenity-desktop-categories"
                className="absolute left-0 top-full z-50 w-80 rounded-2xl border border-[#34332F] bg-[#000000] p-2 text-[#F2F1ED] shadow-xl"
              >
                <div className="max-h-[60vh] overflow-y-auto">
                  {categoryLinks()}
                </div>
              </div>
            )}
          </div>

          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noopener noreferrer' : undefined}
              aria-current={
                !link.external && pathname === link.href
                  ? 'page'
                  : undefined
              }
              className={clsx(
                'whitespace-nowrap text-[12px] uppercase tracking-wide',
                'transition-colors hover:text-[#B8986A]',
                !solidBackground &&
                  'drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]'
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            tabIndex={-1}
            className="absolute inset-0 bg-black/40"
            onClick={closeMobile}
            aria-label="Fechar menu"
          />

          <div
            ref={mobilePanelRef}
            id="serenity-mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            className="relative flex h-full w-80 max-w-[90vw] flex-col overflow-y-auto bg-[#000000] text-[#F2F1ED]"
          >
            <div className="flex items-center justify-between border-b border-[#34332F] px-5 py-5">
              <Brand compact />

              <button
                type="button"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center"
                onClick={closeMobile}
                aria-label="Fechar menu"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>

            <nav
              aria-label="Menu principal no celular"
              className="flex flex-col py-4"
            >
              <details className="group border-b border-[#34332F]">
                <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between px-6 py-4 text-[13px] uppercase tracking-wide [&::-webkit-details-marker]:hidden">
                  Categorias

                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className="transition-transform group-open:rotate-180"
                  />
                </summary>

                <div className="bg-[#202020] px-3 py-2">
                  {categoryLinks()}
                </div>
              </details>

              {NAV_LINKS.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  target={link.external ? '_blank' : undefined}
                  rel={
                    link.external
                      ? 'noopener noreferrer'
                      : undefined
                  }
                  aria-current={
                    !link.external && pathname === link.href
                      ? 'page'
                      : undefined
                  }
                  onClick={closeMenus}
                  className="border-b border-[#34332F] px-6 py-4 text-[13px] uppercase tracking-wide hover:bg-[#202020]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}

      <style jsx>{`
        .serenity-announcement {
          position: relative;
          z-index: 40;
          overflow: hidden;
          background: #000000;
          color: #fff;
        }

        .serenity-announcement-track {
          display: flex;
          width: max-content;
          animation: serenity-marquee 40s linear infinite;
        }

        .serenity-announcement-group {
          display: flex;
          flex-shrink: 0;
          align-items: center;
          min-width: 100vw;
        }

        .serenity-announcement-item {
          display: inline-flex;
          flex-shrink: 0;
          flex-grow: 1;
          align-items: center;
          padding: 10px 0;
          white-space: nowrap;
          font-size: 11px;
          line-height: 18px;
          letter-spacing: 0.04em;
        }

        .serenity-announcement-text {
          flex-shrink: 0;
        }

        .serenity-announcement-separator {
          display: flex;
          flex-shrink: 0;
          flex-grow: 1;
          align-items: center;
          justify-content: center;
          min-width: 84px;
          padding: 0 28px;
        }

        .serenity-announcement-monogram {
          display: block;
          width: 28px;
          height: 28px;
          flex-shrink: 0;
          object-fit: contain;
          object-position: center;
          filter: brightness(0) invert(1);
        }

        .serenity-announcement:hover .serenity-announcement-track {
          animation-play-state: paused;
        }

        @keyframes serenity-marquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .serenity-announcement {
            overflow-x: auto;
          }

          .serenity-announcement-track {
            animation: none;
          }

          .serenity-announcement-group[aria-hidden='true'] {
            display: none;
          }
        }
      `}</style>
    </>
  )
}
