'use client'
import { useFormState, useFormStatus } from 'react-dom'
import { importLegacyContacts } from './contact-actions'
function Submit() { const {pending}=useFormStatus(); return <button disabled={pending} className="min-h-[44px] rounded-full bg-[#292621] px-5 text-xs text-white disabled:opacity-40">{pending?'Conferindo contatos…':'Importar contatos e endereços'}</button> }
export default function ImportContacts() {
 const [state,action]=useFormState(importLegacyContacts,{error:''})
 return <details className="rounded-xl border bg-white p-5"><summary className="min-h-[44px] cursor-pointer text-sm font-medium">Recuperar telefones, números e bairros dos pedidos antigos</summary><p className="my-3 text-xs leading-6 text-[#756B5D]">Instale o SQL de contatos e envie o CSV completo de cobrança e entrega. Os dados complementam campos vazios do mesmo destinatário e endereço. Campos corrigidos manualmente e etiquetas já emitidas são preservados.</p><form action={action} className="space-y-4"><input type="file" name="contacts" accept=".csv,text/csv" required aria-label="CSV de contatos e endereços" className="block w-full text-xs"/><Submit/>{state.error&&<p role="alert" className="text-xs text-red-700">{state.error}</p>}{state.summary&&<p role="status" className="text-sm">{state.summary.imported} pedido(s) com contatos disponíveis · {state.summary.ignored} fora do histórico elegível. Reabra o envio, confira os campos, salve o rascunho e consulte o frete novamente. Informações ausentes ou divergentes continuam para conferência.</p>}</form></details>
}
