export function LunarMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={className}>
      <path d="M28.5 5.5A16 16 0 1 0 34.5 29a16 16 0 0 1-6-23.5Z" stroke="currentColor" strokeWidth="1.3" />
      <path d="m30 12 1.5 3.5L35 17l-3.5 1.5L30 22l-1.5-3.5L25 17l3.5-1.5L30 12Z" fill="currentColor" />
    </svg>
  )
}

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="lunarity-brand">
      <LunarMark className="lunarity-brand-mark" />
      <span className="lunarity-brand-name">LUNARITY{!compact && <span className="lunarity-brand-caption">PIERCINGS & JOIAS</span>}</span>
    </span>
  )
}
