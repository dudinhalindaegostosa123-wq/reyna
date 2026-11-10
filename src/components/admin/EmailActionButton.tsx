'use client'
import { useFormStatus } from 'react-dom'
export default function EmailActionButton({ children, pendingLabel = 'Processando…', primary = false }: { children: React.ReactNode; pendingLabel?: string; primary?: boolean }) {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending} aria-busy={pending} className={`inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-full border px-5 py-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#947B57] disabled:cursor-wait disabled:opacity-60 sm:w-auto ${primary ? 'border-[#292621] bg-[#292621] text-white hover:bg-[#443E36]' : 'border-[#D8CEBF] bg-white text-[#292621] hover:bg-[#F5F1EB]'}`}><span role="status">{pending ? pendingLabel : children}</span></button>
}
