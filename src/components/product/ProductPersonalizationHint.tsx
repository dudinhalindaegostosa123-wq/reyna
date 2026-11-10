export default function ProductPersonalizationHint({
  tags = [],
}: {
  tags?: string[]
}) {
  const available = tags.some(value =>
    /^(anodizavel|anodizaveis|permite anodizacao|aceita anodizacao)$/.test(
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
    )
  )

  if (!available) return null

  return (
    <div className="rounded-2xl border border-store-border bg-store-raised px-4 py-3">
      <p className="text-xs font-medium text-store-accent">
        Anodização disponível
      </p>

      <p className="mt-1 text-xs leading-relaxed text-store-muted">
        Esta peça permite personalizar a cor do titânio.
        Consulte as opções com nossa equipe.
      </p>
    </div>
  )
}
