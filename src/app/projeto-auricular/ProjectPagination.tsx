'use client'

export default function ProjectPagination({ page, totalPages, total, onChange }: {
  page: number; totalPages: number; total: number; onChange: (page: number) => void
}) {
  if (totalPages <= 1) return null
  const pages = Array.from(new Set([1, page - 1, page, page + 1, totalPages]))
    .filter(value => value >= 1 && value <= totalPages).sort((a, b) => a - b)
  const button = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-3 text-xs text-store-muted transition-colors hover:bg-store-raised disabled:opacity-30'
  return <nav aria-label="Páginas de joias para esta região" className="mt-6">
    <p role="status" aria-live="polite" className="mb-3 text-center text-xs text-store-muted">Página {page} de {totalPages} · {total} joias</p>
    <div className="flex flex-wrap items-center justify-center gap-1">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className={button}>← Anterior</button>
      {pages.map((value, index) => <span key={value} className="inline-flex items-center">
        {index > 0 && value - pages[index - 1] > 1 && <span aria-hidden="true" className="px-1 text-xs text-store-muted">…</span>}
        <button type="button" aria-label={`Página ${value}`} aria-current={page === value ? 'page' : undefined}
          onClick={() => { if (value !== page) onChange(value) }}
          className={`${button} ${page === value ? '!bg-store-action !text-white' : ''}`}>{value}</button>
      </span>)}
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} className={button}>Próxima →</button>
    </div>
  </nav>
}
