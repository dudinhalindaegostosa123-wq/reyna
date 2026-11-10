import Link from 'next/link'
import { adminErrorCode, adminErrorField } from '@/lib/admin-diagnostics'

export default function AdminDatabaseNotice({ error, stage }: { error: unknown; stage: string }) {
  const code = adminErrorCode(error)
  const field = adminErrorField(error)
  console.error('ADMIN_DATABASE_FAILURE', { stage, code, field })
  const permission = ['42501', 'PGRST301', 'PGRST302', 'PGRST303', 'API_KEY_INVALID'].includes(code)
  return <main className="mx-auto max-w-2xl px-6 py-12">
    <h1 className="text-2xl font-medium">Não foi possível consultar os produtos</h1>
    <p className="mt-5 text-sm leading-7">{permission
      ? 'O Supabase recusou o acesso administrativo. Confira a Secret key do projeto novo na Vercel. Uma chave Publishable ou anon não permite editar produtos.'
      : code === '57014'
        ? 'O banco cancelou a consulta por demora. Aguarde alguns instantes e tente novamente.'
        : 'O banco retornou um erro ao carregar os dados. Use o código abaixo para identificar a configuração pendente.'}</p>
    <p className="mt-4 text-sm">Código: <strong>{code}</strong> · Etapa: {stage}</p>
    {field && <p className="mt-3 text-sm">Coluna indicada pelo banco: <strong>{field}</strong></p>}
    <div className="mt-6 flex flex-wrap gap-5 text-sm">
      <a href="" className="inline-flex min-h-[44px] items-center underline">Tentar novamente</a>
      {permission && <Link href="/admin/configuracao" className="inline-flex min-h-[44px] items-center underline">Conferir configuração</Link>}
      <Link href="/admin/produtos" className="inline-flex min-h-[44px] items-center underline">Voltar aos produtos</Link>
    </div>
  </main>
}
