'use client'
import { useFormState, useFormStatus } from 'react-dom'
import { finishImportedProfile } from '../cadastrar/actions'
function Submit() {
  const { pending } = useFormStatus()
  return <button disabled={pending} className="min-h-[48px] w-full rounded-full bg-store-action px-5 py-3 text-sm text-white disabled:opacity-50">{pending ? 'Salvando…' : 'Concluir meu acesso'}</button>
}
export default function ImportedProfileForm({ name,phone,checkout }: { name:string;phone:string;checkout:boolean }) {
  const [state,action]=useFormState(finishImportedProfile,{error:''})
  const field='mt-2 min-h-[48px] w-full rounded-xl border border-store-border px-4 text-base'
  return <form action={action} className="mt-7 space-y-5">
    <input type="hidden" name="return_to" value={checkout?'/checkout':'/minha-conta'} />
    <label className="block text-sm">Nome completo<input name="name" autoComplete="name" required maxLength={180} defaultValue={name} className={field} /></label>
    <label className="block text-sm">Telefone com DDD<input name="phone" type="tel" autoComplete="tel" required maxLength={25} defaultValue={phone} className={field} /></label>
    <label className="block text-sm">CPF ou CNPJ<input name="document" inputMode="text" required maxLength={24} className={field} /></label>
    {state.error && <p role="alert" className="text-sm leading-6 text-store-error">{state.error} {state.fieldErrors && Object.values(state.fieldErrors).join(' ')}</p>}
    <Submit />
  </form>
}
