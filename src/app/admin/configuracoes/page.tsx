import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const user = await requireAdmin()

  const settings = [
    {
      label: 'Endereço do Supabase',
      present: Boolean(process.env.SUPABASE_URL?.trim()),
    },
    {
      label: 'Chave pública do Supabase',
      present: Boolean(
        process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
      ),
    },
    {
      label: 'Chave de servidor do Supabase',
      present: Boolean(
        process.env.SUPABASE_SECRET_KEY?.trim()
      ),
    },
    {
      label: 'Token do Melhor Envio',
      present: Boolean(
        process.env.MELHOR_ENVIO_TOKEN?.trim()
      ),
    },
  ]

  const adminIds = (
    process.env.SERENITY_ADMIN_USER_IDS || ''
  )
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  const adminCount = Array.from(new Set(adminIds)).length

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <h1 className="text-3xl font-medium">
        Configurações e acesso
      </h1>

      <p className="mt-3 text-sm leading-relaxed text-[#81796C]">
        Confira sua sessão e a presença das configurações
        utilizadas pelo painel.
      </p>

      <section className="mt-7 rounded-3xl border border-[#E5DED3] bg-white p-5 sm:p-7">
        <h2 className="text-lg font-medium">
          Sua sessão
        </h2>

        <dl className="mt-5 space-y-5">
          <div>
            <dt className="text-xs text-[#81796C]">
              E-mail
            </dt>

            <dd className="mt-1 break-words text-sm">
              {user.email || 'Não informado'}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-[#81796C]">
              E-mail confirmado
            </dt>

            <dd className="mt-1 text-sm">
              {user.email_confirmed_at ? 'Sim' : 'Não'}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-[#81796C]">
              Contas autorizadas na configuração de acesso
            </dt>

            <dd className="mt-1 text-sm">
              {adminCount}
            </dd>
          </div>
        </dl>

        <p className="mt-6 border-t border-[#EEE8DE] pt-4 text-xs leading-relaxed text-[#81796C]">
          As contas autorizadas possuem acesso administrativo
          completo. O painel ainda não possui permissões
          diferentes por função.
        </p>
      </section>

      <section className="mt-6 rounded-3xl border border-[#E5DED3] bg-white p-5 sm:p-7">
        <h2 className="text-lg font-medium">
          Configurações do ambiente
        </h2>

        <p className="mt-2 text-xs leading-relaxed text-[#81796C]">
          “Preenchida” indica apenas que a configuração existe
          neste ambiente. Esta tela não verifica a validade
          das credenciais nem testa as integrações.
        </p>

        <ul className="mt-5 divide-y divide-[#EEE8DE]">
          {settings.map(setting => (
            <li
              key={setting.label}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <span className="text-sm">
                {setting.label}
              </span>

              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  setting.present
                    ? 'bg-green-50 text-green-800'
                    : 'bg-amber-50 text-amber-800'
                }`}
              >
                {setting.present
                  ? 'Preenchida'
                  : 'Não preenchida'}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs leading-relaxed text-[#81796C]">
          Chaves, tokens e identificadores de acesso não são
          exibidos. As alterações dessas configurações
          continuam sendo feitas nas variáveis de ambiente
          da Vercel.
        </p>
      </section>
    </main>
  )
}
