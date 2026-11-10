import Brand from '@/components/brand/Brand'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { adminAuth, allowedAdmin } from '@/lib/admin-auth'
import { login } from '../actions'

interface Props {
  searchParams?: { erro?: string }
}

export default async function AdminLogin({ searchParams }: Props) {
  const auth = adminAuth()
  const { data: { user } } = await auth.auth.getUser()

  if (user?.email_confirmed_at && allowedAdmin(user.id)) {
    redirect('/admin/produtos')
  }

  const message = searchParams?.erro === 'permissao'
    ? 'Esta conta não tem acesso ao painel.'
    : searchParams?.erro
      ? 'Não foi possível entrar. Confira seu e-mail e sua senha.'
      : ''

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-10 flex justify-center text-[#293335]"><Brand /></div>

        <div className="rounded-[28px] border border-[#E5DED3] bg-white p-6 shadow-[0_12px_55px_rgba(60,45,22,0.04)] sm:p-8">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#947B57]">
            Área administrativa
          </p>
          <h1 className="mt-2 text-[26px] font-medium tracking-[-0.035em]">
            Bem-vindo à Lunarity
          </h1>
          <p className="mt-3 text-[13px] leading-6 text-[#81796C]">
            Entre com sua conta autorizada para acessar o catálogo.
          </p>

          {message && (
            <p role="alert" className="mt-5 rounded-2xl bg-[#F6EEE9] px-4 py-3 text-[12px] text-[#815940]">
              {message}
            </p>
          )}

          <form action={login} className="mt-6 space-y-4">
            <label className="block text-[12px] text-[#625B51]">
              E-mail
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="username"
                autoCapitalize="none"
                className="mt-2 min-h-[48px] w-full rounded-2xl border border-[#E5DED3] bg-[#FCFBF8] px-4 text-[16px] outline-none focus:border-[#947B57]"
              />
            </label>

            <label className="block text-[12px] text-[#625B51]">
              Senha
              <input
                name="password"
                type="password"
                required
                maxLength={1024}
                autoComplete="current-password"
                className="mt-2 min-h-[48px] w-full rounded-2xl border border-[#E5DED3] bg-[#FCFBF8] px-4 text-[16px] outline-none focus:border-[#947B57]"
              />
            </label>

            <button
              type="submit"
              className="min-h-[48px] w-full rounded-full bg-[#292621] px-5 py-3 text-[13px] text-white transition-colors hover:bg-[#504638]"
            >
              Entrar no painel
            </button>
          </form>
        </div>

        <Link href="/" className="mt-6 block py-3 text-center text-[12px] text-[#81796C]">
          ← Voltar para a loja
        </Link>
      </div>
    </main>
  )
}
