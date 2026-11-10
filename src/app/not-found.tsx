import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="bg-store-canvas min-h-[60vh] flex flex-col items-center justify-center gap-6 text-center px-4">
      <span className="font-display text-9xl font-light text-[#E5E5E5]">404</span>
      <h1 className="font-display text-3xl font-light text-store-text">Página não encontrada</h1>
      <p className="text-[13px] text-store-muted max-w-sm">
        A página que você procura não existe ou foi movida.
      </p>
      <Link
        href="/"
        className="border border-store-selected text-[12px] uppercase tracking-[0.15em] px-8 py-4 hover:bg-store-action-hover hover:text-white transition-all duration-200"
      >
        Voltar ao início
      </Link>
    </div>
  )
}
