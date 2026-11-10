'use client'
import { useState } from 'react'
import { useCartStore } from '@/lib/cart'
import { projectCart } from '@/lib/ready-project'
import type { ProjectPiece } from '@/lib/ready-project'

export default function ProjectPurchase({ pieces, complete }: { pieces: ProjectPiece[]; complete: boolean }) {
  const [message, setMessage] = useState('')
  const items = useCartStore(state => state.items)
  const addProject = useCartStore(state => state.addProject)
  const available = complete && Boolean(projectCart(items, pieces))
  return <div className="mt-6">
    <button type="button" disabled={!available} onClick={() => {
      setMessage(addProject(pieces) ? 'As joias do projeto foram adicionadas ao carrinho.' : 'Não foi possível adicionar o conjunto completo. Confira a disponibilidade das peças.')
    }} className="min-h-[48px] rounded-full bg-store-action px-6 py-3 text-sm text-white disabled:opacity-40">Comprar projeto completo</button>
    {!available && <p className="mt-3 text-sm text-store-muted">O conjunto completo está indisponível para adicionar. Você pode continuar se inspirando nas peças abaixo.</p>}
    <p role="status" className="mt-3 text-sm">{message}</p>
  </div>
}
