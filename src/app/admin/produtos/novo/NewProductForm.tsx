'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createProduct } from '../catalog-actions'

function Submit() {
  const { pending } = useFormStatus()
  return <button disabled={pending} className="mt-6 min-h-[44px] rounded-full bg-[#292621] px-7 text-sm text-white disabled:opacity-50">{pending ? 'Criando…' : 'Criar rascunho'}</button>
}

export default function NewProductForm({ requestId }: { requestId: string }) {
  const [state, action] = useFormState(createProduct, { error: '' })
  const field = 'mt-2 min-h-[44px] w-full rounded-xl border border-[#DFD7CB] bg-white px-3 text-base'

  return <form action={action} className="rounded-3xl border border-[#E5DED3] bg-white p-6">
    <input type="hidden" name="request_id" value={requestId} />

    <label className="block text-xs">Nome da peça
      <input name="name" required maxLength={300} className={field} />
    </label>

    <label className="mt-5 block text-xs">Tipo
      <select name="product_type" defaultValue="simple" className={field}>
        <option value="simple">Produto simples</option>
        <option value="variable">Produto com variações</option>
      </select>
    </label>

    {state.error && <p role="alert" className="mt-4 text-sm text-red-800">{state.error}</p>}

    <Submit />
  </form>
}
