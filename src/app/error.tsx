'use client'

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-[60vh] bg-black px-4 pb-20 pt-52 text-center text-[#F2F1ED] md:pt-64">
      <h1 className="font-display text-3xl font-light">
        Não foi possível carregar esta página.
      </h1>
      <p className="mt-4 text-sm text-[#C5C1B9]">
        Tente novamente em alguns instantes.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 min-h-[44px] border border-[#A59A89] bg-[#292621] px-6 py-3 text-xs uppercase tracking-wide text-white"
      >
        Tentar novamente
      </button>
    </div>
  )
}
