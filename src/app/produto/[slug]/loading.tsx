export default function ProductLoading() {
  return (
    <div
      className="bg-store-canvas min-h-screen"
      role="status"
      aria-label="Carregando produto"
    >
      <span className="sr-only">Carregando produto…</span>

      <div
        className="max-w-7xl mx-auto px-4 py-8 md:py-12"
        aria-hidden="true"
      >
        <div className="h-3 w-48 bg-store-raised mb-8 animate-pulse" />

        <div className="grid md:grid-cols-2 gap-8 md:gap-16">
          <div className="aspect-[4/5] bg-store-raised animate-pulse" />

          <div className="space-y-6 md:pt-4">
            <div className="h-3 w-28 bg-store-raised animate-pulse" />

            <div className="space-y-3">
              <div className="h-8 w-full bg-store-raised animate-pulse" />
              <div className="h-8 w-3/4 bg-store-raised animate-pulse" />
            </div>

            <div className="h-7 w-36 bg-store-raised animate-pulse" />

            <div className="space-y-3">
              <div className="h-3 w-full bg-store-raised animate-pulse" />
              <div className="h-3 w-5/6 bg-store-raised animate-pulse" />
            </div>

            <div className="h-12 w-full border border-store-border animate-pulse" />
            <div className="h-12 w-full bg-black/10 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
