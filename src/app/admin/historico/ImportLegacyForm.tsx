'use client'
import { useFormState,useFormStatus } from 'react-dom'
import { importLegacyCsv } from './actions'
function Submit() {
  const {pending}=useFormStatus()
  return <button disabled={pending} className="min-h-[46px] rounded-full bg-[#292621] px-6 py-3 text-sm text-white disabled:opacity-50">{pending?'Conferindo e importando…':'Importar clientes e histórico'}</button>
}
export default function ImportLegacyForm() {
  const [state,action]=useFormState(importLegacyCsv,{error:''})
  return <section className="rounded-xl border bg-white p-5"><h2 className="text-lg">Importar os arquivos do site antigo</h2><p className="mb-5 mt-2 text-xs leading-6 text-[#756B5D]">Depois de instalar a estrutura no Supabase, selecione os três CSVs exportados. Os valores, vínculos e arquivos são conferidos antes da gravação. Limite total: 3 MB.</p><form action={action} className="space-y-4">
    <label className="block text-sm">1. Cadastros — wp_users.csv<input type="file" name="customers" accept=".csv,text/csv" required className="mt-2 block w-full text-xs" /></label>
    <label className="block text-sm">2. Pedidos — wp_users (1).csv<input type="file" name="orders" accept=".csv,text/csv" required className="mt-2 block w-full text-xs" /></label>
    <label className="block text-sm">3. Itens — wp_woocommerce_order_items.csv<input type="file" name="items" accept=".csv,text/csv" required className="mt-2 block w-full text-xs" /></label>
    {state.error && <p role="alert" className="text-sm leading-6 text-red-700">{state.error}</p>}
    {state.summary && <p role="status" className="rounded-lg bg-[#F6F3ED] p-4 text-sm leading-7">{state.summary.already_imported?'Esses arquivos já tinham sido importados. Nenhum registro foi duplicado.':'Importação concluída.'} {state.summary.customers} clientes · {state.summary.orders} pedidos · {state.summary.refunds} estornos · {state.summary.needs_review} vínculo(s) para conferir.</p>}
    <Submit />
  </form></section>
}
