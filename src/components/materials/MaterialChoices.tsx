import Link from 'next/link'

const materials = [
  { id: 'titanio', name: 'Titânio grau implante', finish: 'linear-gradient(120deg,#f4f4f3,#a6a6a3 38%,#dededb 65%,#898985)' },
  { id: 'titanio-revestido', name: 'Titânio revestido de ouro 24K', finish: 'linear-gradient(120deg,#fff1c9,#c89f50 40%,#e4c481 68%,#9f7639)' },
  { id: 'ouro-18k', name: 'Ouro 18K maciço', finish: 'linear-gradient(110deg,#b58b43,#fff0bd 32%,#d7b16a 54%,#99712e)' },
  { id: 'bioflex', name: 'Bioflex', finish: 'radial-gradient(circle at 35% 28%,#fff,#f4f3ef 35%,#c9cbc7 67%,#fff 76%,#dcded9)' },
]

export default function MaterialChoices() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {materials.map(material => (
        <Link key={material.id} id={material.id} href={`/materiais/${material.id}`} className="flex min-h-[130px] flex-col items-center justify-center gap-3 rounded-lg border border-[color:var(--home-border,#E5E0D8)] px-3 py-4 text-center text-[12px] leading-5 transition-colors hover:bg-[color:var(--home-hover,#F7F4EF)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#947B57] sm:text-[13px]">
          <span aria-hidden="true" className="h-11 w-11 rounded-full border border-black/10 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]" style={{ background: material.finish }} />
          <span className="max-w-[160px]">{material.name}</span>
        </Link>
      ))}
    </div>
  )
}
