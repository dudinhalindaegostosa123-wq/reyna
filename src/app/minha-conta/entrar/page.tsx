'use client'

import Link from 'next/link'
import {
  useFormState,
  useFormStatus,
} from 'react-dom'

import { loginCustomer } from './actions'

interface Props {
  searchParams?: {
    aviso?: string | string[]
    retorno?: string | string[]
  }
}

const notices: Record<string, string> = {
  'senha-alterada': 'Senha alterada. Entre com sua nova senha.',
  'confirmacao-invalida':
    'O link de confirmação está inválido ou expirou. Se você já confirmou seu e-mail, tente entrar com sua senha.',

  'cadastro-pendente':
    'Seu e-mail foi confirmado, mas o cadastro não foi concluído. Entre com sua senha para tentar novamente.',

  'confirme-email':
    'Confirme seu e-mail antes de entrar. Confira também a caixa de spam.',
}

function LoginFields() {
  const { pending } = useFormStatus()

  const field =
    'mt-2 min-h-[48px] w-full rounded-xl border border-store-border bg-store-surface px-4 text-base focus:outline-[#947B57] sm:text-sm'

  return (
    <fieldset
      disabled={pending}
      className="space-y-5 disabled:opacity-60"
    >
      <div>
        <label
          htmlFor="customer-email"
          className="text-xs"
        >
          E-mail
        </label>

        <input
          id="customer-email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className={field}
        />
      </div>

      <div>
        <label
          htmlFor="customer-password"
          className="text-xs"
        >
          Senha
        </label>

        <input
          id="customer-password"
          name="password"
          type="password"
          required
          maxLength={128}
          autoComplete="current-password"
          className={field}
        />
      </div>

      <div hidden aria-hidden="true">
        <label>
          Website
          <input
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-[48px] w-full rounded-full bg-store-action px-6 py-3 text-sm text-white disabled:opacity-50"
      >
        {pending
          ? 'Entrando…'
          : 'Entrar na minha conta'}
      </button>
    </fieldset>
  )
}

export default function CustomerLoginPage({
  searchParams = {},
}: Props) {
  const [state, action] = useFormState(
    loginCustomer,
    { error: '' }
  )

  const notice =
    typeof searchParams.aviso === 'string' &&
    Object.prototype.hasOwnProperty.call(
      notices,
      searchParams.aviso
    )
      ? notices[searchParams.aviso]
      : ''

  return (
    <main className="mx-auto w-full max-w-lg px-5 py-10 sm:py-16">
      <Link
        href="/"
        className="inline-flex min-h-[44px] items-center text-xs text-store-muted underline"
      >
        ← Voltar à loja
      </Link>

      <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-store-accent">
        Serenity Piercings
      </p>

      <h1 className="mt-3 text-3xl font-medium tracking-tight text-store-text">
        Minha conta
      </h1>

      <p className="mb-7 mt-3 text-sm leading-relaxed text-store-muted">
        {searchParams.retorno === 'checkout'
          ? 'Entre ou crie sua conta para finalizar a compra e acompanhar seus pedidos. Seu carrinho está salvo.'
          : 'Entre com seu e-mail e senha para acessar sua conta.'}
      </p>

      <section className="rounded-3xl border border-store-border bg-store-surface p-6 sm:p-8">
        {notice && (
          <p
            role="status"
            className="mb-5 text-sm leading-relaxed text-store-muted"
          >
            {notice}
          </p>
        )}

        <form action={action}>
          <input type="hidden" name="return_to" value={searchParams.retorno === 'checkout' ? '/checkout' : '/minha-conta'} />
          <LoginFields />

          {state.error && (
            <p
              role="alert"
              className="mt-4 text-sm leading-relaxed text-store-error"
            >
              {state.error}
            </p>
          )}
        </form>

        <div className="mt-5 text-center"><Link href="/minha-conta/recuperar" className="inline-flex min-h-[44px] items-center text-sm underline">Esqueci minha senha</Link></div>

        <div className="mt-6 border-t border-store-border pt-5 text-center">
          <p className="text-xs text-store-muted">
            Ainda não tem conta?
          </p>

          <Link
            href={searchParams.retorno === 'checkout' ? '/minha-conta/cadastrar?retorno=checkout' : '/minha-conta/cadastrar'}
            className="mt-2 inline-flex min-h-[44px] items-center text-sm underline"
          >
            Criar minha conta
          </Link>
        </div>
      </section>
    </main>
  )
}
