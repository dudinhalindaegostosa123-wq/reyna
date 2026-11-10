export default function AdminLoading() {
  return (
    <div role="status" className="flex min-h-screen items-center justify-center gap-3 text-[13px] text-[#81796C]">
      <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[#D9CDBB] border-t-[#62513A] motion-reduce:animate-none" />
      Carregando painel…
    </div>
  )
}
