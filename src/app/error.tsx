'use client'

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-[50vh] bg-store-canvas px-4 py-20 text-center">
      <h1 className="font-display text-3xl font-light">
        Não foi possível carregar esta página.
      </h1>
      <p className="mt-4 text-sm text-store-muted">
        Tente novamente em alguns instantes.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 bg-store-action px-6 py-3 text-xs uppercase tracking-wide text-white"
      >
        Tentar novamente
      </button>
    </div>
  )
}
