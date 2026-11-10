'use client'

import Link from 'next/link'

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <h1 className="text-2xl font-medium">Não foi possível abrir o painel</h1>
      <p className="mt-4 text-[13px] leading-6 text-[#81796C]">
        Tente novamente. Se continuar, confira a configuração de acesso do painel.
      </p>
      <button onClick={reset} className="mt-6 min-h-[44px] rounded-full bg-[#292621] px-6 py-3 text-sm text-white">
        Tentar novamente
      </button>
      <Link href="/" className="ml-4 text-[12px] text-[#81796C]">
        Voltar para a loja
      </Link>
    </main>
  )
}
