import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'

export default async function AdminConfiguration() {
  await requireAdmin()

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-medium">Configuração do painel pendente</h1>
      <p className="mt-5 text-sm leading-7">
        Seu login foi autorizado, mas o painel precisa da chave administrativa do Supabase novo
        para consultar e atualizar os produtos.
      </p>
      <p className="mt-4 text-sm leading-7">
        Na Vercel, abra Settings → Environment Variables e cadastre SUPABASE_SECRET_KEY em
        Production. Use a Secret key ou a chave service_role do mesmo projeto de SUPABASE_URL.
        Depois faça Redeploy. As variáveis cadastradas no GitHub Actions não são copiadas para a Vercel.
      </p>
      <p className="mt-4 text-sm leading-7">A chave administrativa começa com sb_secret_. Se estiver usando uma chave JWT antiga (eyJ…), ela deve ser service_role. Publishable e anon são chaves públicas e não permitem este acesso.</p>
      <p className="mt-4 text-sm leading-7">Não envie a chave pelo chat.</p>
      <Link href="/admin/produtos" className="mt-6 inline-block underline">Tentar abrir os produtos</Link>
    </main>
  )
}
