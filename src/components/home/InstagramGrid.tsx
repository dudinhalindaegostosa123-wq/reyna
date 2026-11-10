'use client'

import { STORE_INFORMATION } from '@/lib/store-information'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { ArrowLeft, ArrowRight } from 'lucide-react'

const POSTS = [
  'DeXexdbvTmj',
  'DeSJvJnz9YG',
  'DeQ9sUvT_CB',
  'DeH_H_Hvszb',
  'DeC8VY8PFY_',
  'Dd-KpXPjZg9',
]

type InstagramWindow = Window & {
  instgrm?: {
    Embeds?: {
      process: () => void
    }
  }
}

function processPosts() {
  const instagramWindow = window as InstagramWindow
  instagramWindow.instgrm?.Embeds?.process()
}

export default function InstagramGrid() {
  const sectionRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const [visible, setVisible] = useState(false)
  const [scriptError, setScriptError] = useState(false)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    if (!('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting)
        ) {
          setVisible(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: '350px 0px',
      }
    )

    observer.observe(section)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (visible) processPosts()
  }, [visible])

  function scrollPosts(direction: number) {
    const track = trackRef.current
    if (!track) return

    const firstCard =
      track.querySelector<HTMLElement>(
        '[data-instagram-card]'
      )

    const distance = firstCard
      ? firstCard.offsetWidth + 16
      : 342

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    track.scrollBy({
      left: direction * distance,
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }

  return (
    <section
      ref={sectionRef}
      aria-labelledby="instagram-title"
      className="bg-[color:var(--home-surface,#FAFAF8)]"
    >
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 md:px-10 md:py-9">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2
              id="instagram-title"
              className="font-display text-2xl font-medium tracking-[-0.025em] md:text-3xl"
            >
              Acompanhe a Serenity
            </h2>

            <a
              href={STORE_INFORMATION.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-[12px] text-[color:var(--home-muted,#817B72)] transition-colors hover:text-[color:var(--home-text,#25231F)]"
            >
              @serenitypiercing ↗
            </a>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollPosts(-1)}
              aria-label="Ver publicações anteriores"
              aria-controls="instagram-posts"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--home-border,#DED7CC)] text-[color:var(--home-muted,#625B51)] transition-colors hover:border-[#947B57] hover:bg-[color:var(--home-surface,#F0EBE3)]"
            >
              <ArrowLeft size={16} strokeWidth={1.5} />
            </button>

            <button
              type="button"
              onClick={() => scrollPosts(1)}
              aria-label="Ver próximas publicações"
              aria-controls="instagram-posts"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--home-border,#DED7CC)] text-[color:var(--home-muted,#625B51)] transition-colors hover:border-[#947B57] hover:bg-[color:var(--home-surface,#F0EBE3)]"
            >
              <ArrowRight size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {scriptError && (
          <p
            role="status"
            className="mb-4 text-[12px] text-[color:var(--home-muted,#746D63)]"
          >
            Não foi possível carregar as publicações aqui.
            Você pode abri-las pelos links abaixo.
          </p>
        )}

        <div
          ref={trackRef}
          id="instagram-posts"
          role="region"
          aria-label="Publicações do Instagram da Serenity"
          tabIndex={0}
          className="serenity-instagram-track serenity-instagram-grid flex snap-x snap-mandatory items-start gap-4 overflow-x-auto pb-3"
        >
          {POSTS.map((code, index) => {
            const url =
              `https://www.instagram.com/p/${code}/`

            return (
              <article
                key={code}
                data-instagram-card
                aria-label={`Publicação ${index + 1} de ${POSTS.length}`}
                className="w-[326px] shrink-0 snap-start"
              >
                <div className="overflow-hidden rounded-[18px] border border-[color:var(--home-border,#E8E4DD)] bg-white">
                  {visible && !scriptError ? (
                    <blockquote
                      className="instagram-media"
                      data-instgrm-permalink={url}
                      data-instgrm-version="14"
                      style={{
                        background: '#fff',
                        border: 0,
                        margin: 0,
                        minWidth: 0,
                        maxWidth: '100%',
                        width: '100%',
                      }}
                    >
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-[420px] items-center justify-center px-6 text-center text-[12px] text-[color:var(--home-muted,#746D63)]"
                      >
                        Ver publicação da Serenity no
                        Instagram
                      </a>
                    </blockquote>
                  ) : (
                    <div
                      aria-hidden="true"
                      className="min-h-[420px] bg-[color:var(--home-surface,#F0EBE3)] p-4"
                    >
                      <div className="mb-4 flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-[#E2DACE]" />
                        <div className="h-2 w-24 rounded-full bg-[#E2DACE]" />
                      </div>

                      <div className="aspect-square rounded-xl bg-[#E7E0D5]" />
                    </div>
                  )}
                </div>

                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Abrir publicação ${index + 1} da Serenity no Instagram`}
                  className="mt-2 inline-block text-[10px] text-[color:var(--home-muted,#817B72)] underline underline-offset-4"
                >
                  Ver no Instagram ↗
                </a>
              </article>
            )
          })}
        </div>
      </div>

      {visible && (
        <Script
          id="serenity-instagram-embed"
          src="https://www.instagram.com/embed.js"
          strategy="afterInteractive"
          onLoad={processPosts}
          onReady={processPosts}
          onError={() => setScriptError(true)}
        />
      )}

      <style jsx global>{`
        .serenity-instagram-grid .instagram-media {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          margin: 0 !important;
          border: 0 !important;
          box-shadow: none !important;
        }

        .serenity-instagram-track {
          scrollbar-width: thin;
          scrollbar-color: #d5cbbc transparent;
        }

        .serenity-instagram-track::-webkit-scrollbar {
          height: 3px;
        }

        .serenity-instagram-track::-webkit-scrollbar-track {
          background: transparent;
        }

        .serenity-instagram-track::-webkit-scrollbar-thumb {
          background: #d5cbbc;
          border-radius: 999px;
        }
      `}</style>
    </section>
  )
}
