'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function StoneColorCarousel({ colors, selected }: {
  colors: { id: string; name: string; color: string; image?:string }[]; selected?: string
}) {
  const track = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })
  useEffect(() => {
    const node = track.current
    if (!node) return
    const update = () => setEdges({ start: node.scrollLeft < 2, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 2 })
    update()
    node.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => { node.removeEventListener('scroll', update); observer.disconnect() }
  }, [colors.length])
  if (!colors.length) return null
  const move = (direction: number) => {
    const node = track.current
    if (node) node.scrollBy({ left: direction * Math.max(200, node.clientWidth * 0.7), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  return <section aria-label="Buscar joias pela cor das pedras" className="border-b border-[color:var(--home-border,#EBE5DC)] bg-[color:var(--home-surface,#FAFAF8)] px-4 py-8 sm:px-8 sm:py-10">
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div><h2 className="font-display text-2xl sm:text-3xl">Encontre sua cor</h2><p className="mt-1 text-xs text-[color:var(--home-muted,#81796C)]">Explore as cores das pedras.</p></div>
      </div>
      <div className="grid grid-cols-1 items-center md:grid-cols-[44px_minmax(0,1fr)_44px] md:gap-4">
        <button type="button" aria-label="Ver cores anteriores" disabled={edges.start} onClick={() => move(-1)} className="hidden h-11 w-11 md:inline-flex items-center justify-center rounded-full border border-[color:var(--home-border,#CFC3B1)] bg-white text-[#292621] shadow-sm transition-colors hover:bg-[#F2EFE9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#947B57] disabled:cursor-default disabled:opacity-40"><ChevronLeft size={24} strokeWidth={2} aria-hidden="true" /></button>
      <div ref={track} tabIndex={0} aria-label="Cores disponíveis; deslize para explorar" className="stone-color-track flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 pt-1 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#947B57] sm:gap-5">
        {colors.map(color => <Link key={color.id} href={`/cores/${color.id}`} aria-current={selected === color.id ? 'page' : undefined} className="group flex w-[88px] shrink-0 snap-start flex-col items-center rounded-xl px-1 py-1 text-center focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#947B57] sm:w-[96px] md:w-[112px]">
          <span aria-hidden="true" style={{ backgroundColor: color.color, backgroundImage: color.image ? undefined : 'radial-gradient(circle at 35% 25%, #ffffff99, transparent 55%)', borderColor: selected === color.id ? color.color : '#E5DED3' }} className="relative block h-16 w-16 overflow-hidden rounded-full border transition-transform group-hover:scale-105 sm:h-[72px] sm:w-[72px] md:h-[88px] md:w-[88px]">{color.image && <Image src={color.image} alt="" fill sizes="(min-width: 768px) 88px, (min-width: 640px) 72px, 64px" className="object-cover" />}</span>
          <span className="mt-3 text-[11px] leading-4 md:text-xs text-[color:var(--home-muted,#625B51)]">{color.name}</span>
        </Link>)}
      </div>
        <button type="button" aria-label="Ver próximas cores" disabled={edges.end} onClick={() => move(1)} className="hidden h-11 w-11 md:inline-flex items-center justify-center rounded-full border border-[color:var(--home-border,#CFC3B1)] bg-white text-[#292621] shadow-sm transition-colors hover:bg-[#F2EFE9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#947B57] disabled:cursor-default disabled:opacity-40"><ChevronRight size={24} strokeWidth={2} aria-hidden="true" /></button>
      </div>
    </div>
  </section>
}
