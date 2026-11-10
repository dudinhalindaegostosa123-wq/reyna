'use client'
import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'
import { changeRecoveredPassword, requestPasswordReset } from '@/app/minha-conta/recuperar/actions'

function Submit({ reset }: { reset: boolean }) {
  const { pending } = useFormStatus()
  return <button disabled={pending} className="min-h-[48px] w-full rounded-full bg-store-action px-5 py-3 text-sm text-white disabled:opacity-50">{pending ? 'Aguarde…' : reset ? 'Salvar nova senha' : 'Receber link por e-mail'}</button>
}
export default function PasswordRecoveryForm({ reset = false, invalid = false }: { reset?: boolean; invalid?: boolean }) {
  const [state, action] = useFormState(reset ? changeRecoveredPassword : requestPasswordReset, { error: '' })
  const field = 'mt-2 min-h-[48px] w-full rounded-xl border border-store-border px-4 text-base'
  return <main className="mx-auto max-w-lg px-5 py-14">
    <Link href="/minha-conta/entrar" className="text-xs underline">← Voltar para entrar</Link>
    <h1 className="mb-4 mt-8 text-3xl">{reset ? 'Crie sua nova senha' : 'Esqueci minha senha'}</h1>
    <p className="mb-7 text-sm leading-6 text-store-muted">{reset ? 'Escolha uma senha com pelo menos 12 caracteres.' : 'Informe seu e-mail para receber um link de recuperação de acesso.'}</p>
    {invalid && <p role="alert" className="mb-5 text-sm text-store-error">O link está inválido ou expirou. Solicite um novo abaixo.</p>}
    {state.success ? <p role="status" className="rounded-xl bg-store-raised p-5 text-sm leading-6">Se houver uma conta com esse e-mail, você receberá as instruções. Confira também o spam.</p> : <form action={action} className="space-y-5">
      {reset ? <>
        <label className="block text-sm">Nova senha<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className={field} /></label>
        <label className="block text-sm">Repita a nova senha<input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className={field} /></label>
      </> : <>
        <label className="block text-sm">E-mail<input name="email" type="email" autoComplete="email" maxLength={254} required className={field} /></label>
        <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      </>}
      {state.error && <p role="alert" className="text-sm text-store-error">{state.error}</p>}
      <Submit reset={reset} />
    </form>}
  </main>
}
