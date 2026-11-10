import { bannerPlacement } from '@/lib/home-images'
import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { adminDatabase } from '@/lib/admin-auth'
import type { AdminBanner } from '@/lib/banner-ui'
import BannerEditor from './BannerEditor'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Banners | Administração Lunarity',
}

interface Props {
  searchParams?: Record<
    string,
    string | string[] | undefined
  >
}

export default async function Page({
  searchParams = {},
}: Props) {
  const { db } = await adminDatabase()

  const requested = Number(searchParams.page)

  const page =
    Number.isSafeInteger(requested) && requested > 0
      ? Math.min(requested, 100000)
      : 1

  const selected =
    typeof searchParams.edit === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      searchParams.edit
    )
      ? searchParams.edit
      : ''

  const [list, detail] = await Promise.all([
    db
      .from('serenity_site_banners')
      .select(
        'id,title,slot,cta,enabled,position',
        { count: 'exact' }
      )
      .order('slot')
      .order('position')
      .order('id')
      .range(
        (page - 1) * 20,
        page * 20 - 1
      ),

    selected
      ? db
          .from('serenity_site_banners')
          .select('*')
          .eq('id', selected)
          .maybeSingle()
      : Promise.resolve({
          data: null,
          error: null,
        }),
  ])

  if (list.error?.code === 'PGRST103') {
    redirect('/admin/banners')
  }

  if (list.error || detail.error) {
    throw new Error('ADMIN_BANNERS_QUERY')
  }

  const pages = Math.max(
    1,
    Math.ceil((list.count || 0) / 20)
  )

  if (page > pages) {
    redirect('/admin/banners?page=' + pages)
  }

  const banner = detail.data as AdminBanner | null

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <h1 className="text-3xl font-medium">
        Banners
      </h1>

      <p className="mt-3 text-sm text-[#81796C]">
        Imagens, textos, links e ordem da página inicial.
      </p>

      <div className="mt-7 grid items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-3xl border bg-white">
          <Link
            href="/admin/banners"
            className="block border-b p-5 text-sm font-medium"
          >
            + Novo banner
          </Link>

          {(list.data || []).map(item => (
            <Link
              key={item.id}
              href={
                `/admin/banners?edit=${item.id}` +
                `&page=${page}`
              }
              className={
                'block border-b p-4 text-xs ' +
                (
                  selected === item.id
                    ? 'bg-[#F5EFE5]'
                    : ''
                )
              }
            >
              <strong className="break-words">
                {item.title}
              </strong>

              <span className="mt-2 block">
                {{hero:'Principal',category:'Categoria',mini:'Mini banner',stone:'Cor das pedras'}[bannerPlacement(item)]}
                {' · '}
                {item.enabled ? 'Ativo' : 'Inativo'}
                {' · '}
                Posição {item.position}
              </span>
            </Link>
          ))}

          {!list.data?.length && (
            <p className="p-5 text-xs text-[#81796C]">
              Nenhum banner cadastrado.
            </p>
          )}

          <nav
            aria-label="Paginação de banners"
            className="flex justify-between gap-2 p-4 text-xs"
          >
            <span>
              {page} de {pages}
            </span>

            {page > 1 && (
              <Link
                href={
                  '/admin/banners?page=' +
                  (page - 1)
                }
              >
                ← Anterior
              </Link>
            )}

            {page < pages && (
              <Link
                href={
                  '/admin/banners?page=' +
                  (page + 1)
                }
              >
                Próxima →
              </Link>
            )}
          </nav>
        </aside>

        {selected && !banner ? (
          <section
            role="alert"
            className="rounded-3xl border bg-white p-6"
          >
            <p className="text-sm">
              Banner não encontrado.
            </p>

            <Link
              href="/admin/banners"
              className="mt-4 inline-block text-xs underline"
            >
              Voltar para banners
            </Link>
          </section>
        ) : (
          <BannerEditor
            key={
              banner
                ? banner.id + ':' + banner.version
                : 'new'
            }
            initial={banner || undefined}
            id={banner?.id || randomUUID()}
            base={
              process.env.SUPABASE_URL?.trim() || ''
            }
          />
        )}
      </div>
    </main>
  )
}
